const crypto = require('crypto');

const operators = require('./operators');
const util = require('util');
const { safeAsyncEachSeries } = require('./utils/asyncUtils');
const AttributeReference = require('./attribute_reference');
const { checkContext } = require('./context');

const builtins = ['key', 'ip', 'country', 'email', 'firstName', 'lastName', 'avatar', 'name', 'anonymous'];

const bigSegementsStatusPriority = {
  HEALTHY: 1,
  STALE: 2,
  STORE_ERROR: 3,
  NOT_CONFIGURED: 4,
};

function stringifyContextAttrs(context) {
  // Only legacy contexts may have non-string keys.
  if (context.kind === undefined && typeof context.key !== 'string') {
    return {
      ...context,
      key: String(context.key),
    };
  }
  return context;
}

const noop = () => {};

// This internal object encapsulates SDK state that's used for every flag evaluation. Each
// LDClient maintains a single instance of it.
//
// The "queries" object provides read-only async data access on demand. Its methods are:
//   getFlag(key: string, callback: (flag) => void): void
//   getSegment(key: string, callback: (segment) => void): void
//   getBigSegmentsMembership(userKey: string, callback: ([ BigSegmentStoreMembership, status ]) => void): void
function Evaluator(queries) {
  const ret = {};

  ret.evaluate = (flag, context, eventFactory, maybeCallback) => {
    evaluate(flag, context, queries, eventFactory, maybeCallback);
  };

  return ret;
}

// Callback receives (err, detail, events) where detail has the properties "value", "variationIndex", and "reason";
// detail will never be null even if there's an error; events is either an array or undefined.
function evaluate(flag, context, queries, eventFactory, maybeCallback) {
  const cb = maybeCallback || noop;
  if (!checkContext(context, true)) {
    cb(null, errorResult('USER_NOT_SPECIFIED'), []);
    return;
  }

  if (!flag) {
    cb(null, errorResult('FLAG_NOT_FOUND'), []);
    return;
  }

  const sanitizedContext = stringifyContextAttrs(context);

  const stateOut = {};
  evalInternal(flag, sanitizedContext, queries, stateOut, eventFactory, [flag.key], (err, detail) => {
    const result = detail;
    if (stateOut.bigSegmentsStatus) {
      result.reason.bigSegmentsStatus = stateOut.bigSegmentsStatus;
    }
    cb(err, result, stateOut.events);
  });
}

function evalInternal(flag, context, queries, stateOut, eventFactory, visitedFlags, cb) {
  // If flag is off, return the off variation
  if (!flag.on) {
    getOffResult(flag, { kind: 'OFF' }, cb);
    return;
  }

  checkPrerequisites(flag, context, queries, stateOut, eventFactory, visitedFlags, (err, failureReason) => {
    if (stateOut.error) {
      cb(...stateOut.error);
      return;
    }
    if (err || failureReason) {
      getOffResult(flag, failureReason, cb);
    } else {
      evalRules(flag, context, queries, stateOut, cb);
    }
  });
}

// Callback receives (err, reason) where reason is null if successful, or a "prerequisite failed" reason
function checkPrerequisites(flag, context, queries, stateOut, eventFactory, visitedFlags, cb) {
  if (flag.prerequisites && flag.prerequisites.length) {
    safeAsyncEachSeries(
      flag.prerequisites,
      (prereq, callback) => {
        if (visitedFlags.indexOf(prereq.key) !== -1) {
          /* eslint-disable no-param-reassign */
          stateOut.error = [
            new Error(
              `Prerequisite of ${flag.key} causing a circular reference.` +
                ' This is probably a temporary condition due to an incomplete update.'
            ),
            errorResult('MALFORMED_FLAG'),
          ];
          /* eslint-enable no-param-reassign */
          callback(null);
          return;
        }
        const updatedVisitedFlags = [...visitedFlags, prereq.key];
        queries.getFlag(prereq.key, prereqFlag => {
          // If the flag does not exist in the store or is not on, the prerequisite
          // is not satisfied
          if (!prereqFlag) {
            callback({
              key: prereq.key,
              err: new Error('Could not retrieve prerequisite feature flag "' + prereq.key + '"'),
            });
            return;
          }
          evalInternal(prereqFlag, context, queries, stateOut, eventFactory, updatedVisitedFlags, (err, detail) => {
            // If there was an error, the value is null, the variation index is out of range,
            // or the value does not match the indexed variation the prerequisite is not satisfied
            stateOut.events = stateOut.events || []; // eslint-disable-line no-param-reassign
            stateOut.events.push(eventFactory.newEvalEvent(prereqFlag, context, detail, null, flag));
            if (err) {
              callback({ key: prereq.key, err: err });
            } else if (!prereqFlag.on || detail.variationIndex !== prereq.variation) {
              // Note that if the prerequisite flag is off, we don't consider it a match no matter what its
              // off variation was. But we still evaluate it and generate an event.
              callback({ key: prereq.key });
            } else {
              // The prerequisite was satisfied
              callback(null);
            }
          });
        });
      },
      errInfo => {
        if (errInfo) {
          cb(errInfo.err, {
            kind: 'PREREQUISITE_FAILED',
            prerequisiteKey: errInfo.key,
          });
        } else {
          cb(null, null);
        }
      }
    );
  } else {
    cb(null, null);
  }
}

function evalRules(flag, context, queries, stateOut, cb) {
  if (evalTargets(flag, context, cb)) {
    return;
  }

  safeAsyncEachSeries(
    flag.rules,
    (rule, callback) => {
      ruleMatchContext(
        rule,
        context,
        queries,
        stateOut,
        matched => {
          // We raise an "error" on the first rule that *does* match, to stop evaluating more rules
          callback(matched ? rule : null);
        },
        []
      );
    },
    // The following function executes once all of the rules have been checked
    err => {
      // If there was an error processing the rules, then it will
      // have been populated into stateOut.error.
      if (stateOut.error) {
        return cb(...stateOut.error);
      }

      // we use the "error" value to indicate that a rule was successfully matched (since we only care
      // about the first match, and eachSeries terminates on the first "error")
      if (err) {
        const rule = err;
        const reason = { kind: 'RULE_MATCH', ruleId: rule.id };
        for (let i = 0; i < flag.rules.length; i++) {
          if (flag.rules[i].id === rule.id) {
            reason.ruleIndex = i;
            break;
          }
        }
        getResultForVariationOrRollout(rule, context, flag, reason, cb);
      } else {
        // no rule matched; check the fallthrough
        getResultForVariationOrRollout(flag.fallthrough, context, flag, { kind: 'FALLTHROUGH' }, cb);
      }
    }
  );
}

function evalTarget(flag, target, context, cb) {
  if (!target.values) {
    return false;
  }
  const matchContext = getContextForKind(context, target.contextKind);
  if (!matchContext) {
    return false;
  }
  const matchKey = matchContext.key;
  return target.values.some(key => {
    if (key === matchKey) {
      getVariation(flag, target.variation, { kind: 'TARGET_MATCH' }, cb);
      return true;
    }
    return false;
  });
}

function evalTargets(flag, context, cb) {
  if (!flag.contextTargets || !flag.contextTargets.length) {
    return (
      flag.targets &&
      flag.targets.some(target =>
        // We can call evalTarget with this just like we could with a target from contextTargets: it does not
        // have a contextKind property, but our default behavior is to treat that as a contextKind of "user".
        evalTarget(flag, target, context, cb)
      )
    );
  }

  return flag.contextTargets.some(target => {
    if (!target.contextKind || target.contextKind === 'user') {
      const userTarget = (flag.targets || []).find(ut => ut.variation === target.variation);
      return userTarget && evalTarget(flag, userTarget, context, cb);
    } else {
      return evalTarget(flag, target, context, cb);
    }
  });
}

function ruleMatchContext(r, context, queries, stateOut, cb, segmentsVisited) {
  if (!r.clauses) {
    cb(false);
    return;
  }

  // A rule matches if all its clauses match.
  safeAsyncEachSeries(
    r.clauses,
    (clause, callback) => {
      clauseMatchContext(
        clause,
        context,
        queries,
        stateOut,
        matched => {
          // on the first clause that does *not* match, we raise an "error" to stop the loop
          callback(matched ? null : clause);
        },
        segmentsVisited
      );
    },
    err => {
      cb(!err);
    }
  );
}

function clauseMatchContext(c, context, queries, stateOut, matchedCb, segmentsVisited) {
  if (c.op === 'segmentMatch') {
    safeAsyncEachSeries(
      c.values,
      (value, seriesCallback) => {
        queries.getSegment(value, segment => {
          if (segment) {
            if (segmentsVisited.indexOf(segment.key) >= 0) {
              /* eslint-disable no-param-reassign */
              stateOut.error = [
                new Error(
                  `Segment rule referencing segment ${segment.key} caused a circular reference. ` +
                    'This is probably a temporary condition due to an incomplete update'
                ),
                errorResult('MALFORMED_FLAG'),
              ];
              /* eslint-enable no-param-reassign */

              //The return needs to be non-null in order to skip the rest of the series.
              return seriesCallback(true);
            }
            const newVisited = [...segmentsVisited, segment.key];
            segmentMatchContext(
              segment,
              context,
              queries,
              stateOut,
              result =>
                // On the first segment that matches, we call seriesCallback with an
                // arbitrary non-null value, which safeAsyncEachSeries interprets as an
                // "error", causing it to skip the rest of the series.
                seriesCallback(result ? segment : null),
              newVisited
            );
          } else {
            return seriesCallback(null);
          }
        });
      },
      // The following function executes once all of the clauses have been checked
      err => {
        // an "error" indicates that a segment *did* match
        matchedCb(maybeNegate(c, !!err));
      }
    );
  } else {
    matchedCb(clauseMatchContextNoSegments(c, context, stateOut));
  }
}

function getContextValueForClause(c, context) {
  const kind = c.contextKind || 'user';
  const isKindRule = AttributeReference.isKind(c.attribute);

  if (isKindRule && context.kind !== 'multi') {
    return [true, context.kind || 'user'];
  } else if (isKindRule) {
    return [true, Object.keys(context).filter(key => key !== 'kind')];
  }

  return contextValue(context, kind, c.attribute, !c.contextKind);
}

function clauseMatchContextNoSegments(c, context, stateOut) {
  const matchFn = operators.fn(c.op);
  const [validReference, cValue] = getContextValueForClause(c, context);

  if (!validReference) {
    stateOut.error = [new Error('Invalid attribute reference in clause'), errorResult('MALFORMED_FLAG')]; // eslint-disable-line no-param-reassign
    return false;
  }

  if (cValue === null || cValue === undefined) {
    return false;
  }

  // The contexts's value is an array
  if (Array.isArray(cValue)) {
    for (let i = 0; i < cValue.length; i++) {
      if (matchAny(matchFn, cValue[i], c.values)) {
        return maybeNegate(c, true);
      }
    }
    return maybeNegate(c, false);
  }

  return maybeNegate(c, matchAny(matchFn, cValue, c.values));
}

/**
 * Get a priority for the given big segment status.
 * @param {string} status
 * @returns Integer representing the priority.
 */
function getBigSegmentsStatusPriority(status) {
  return bigSegementsStatusPriority[status] || 0;
}

/**
 * Given two big segment statuses return the one with the higher priority.
 * @param {string} old
 * @param {string} latest
 * @returns The status with the higher priority.
 */
function computeUpdatedBigSegmentsStatus(old, latest) {
  if (old !== undefined && getBigSegmentsStatusPriority(old) > getBigSegmentsStatusPriority(latest)) {
    return old;
  }
  return latest;
}

function segmentMatchContext(segment, context, queries, stateOut, cb, segmentsVisited) {
  if (!segment.unbounded) {
    return simpleSegmentMatchContext(segment, context, true, queries, stateOut, cb, segmentsVisited);
  }

  if (!segment.generation) {
    // Big Segment queries can only be done if the generation is known. If it's unset,
    // that probably means the data store was populated by an older SDK that doesn't know
    // about the generation property and therefore dropped it from the JSON data. We'll treat
    // that as a "not configured" condition.
    stateOut.bigSegmentsStatus = computeUpdatedBigSegmentsStatus(stateOut.bigSegmentsStatus, 'NOT_CONFIGURED'); // eslint-disable-line no-param-reassign
    return cb(false);
  }

  const bigSegmentKind = segment.unboundedContextKind || 'user';
  const bigSegmentContext = getContextForKind(context, bigSegmentKind);

  if (!bigSegmentContext) {
    return cb(false);
  }

  if (stateOut.bigSegmentsMembership && stateOut.bigSegmentsMembership[bigSegmentContext.key]) {
    // We've already done the query at some point during the flag evaluation and stored
    // the result (if any) in stateOut.bigSegmentsMembership, so we don't need to do it
    // again. Even if multiple Big Segments are being referenced, the membership includes
    // *all* of the user's segment memberships.

    return bigSegmentMatchContext(
      stateOut.bigSegmentsMembership[bigSegmentContext.key],
      segment,
      bigSegmentContext,
      queries,
      stateOut,
      cb
    );
  }

  queries.getBigSegmentsMembership(bigSegmentContext.key, result => {
    /* eslint-disable no-param-reassign */
    stateOut.bigSegmentsMembership = stateOut.bigSegmentsMembership || {};
    if (result) {
      stateOut.bigSegmentsMembership[bigSegmentContext.key] = result[0];
      stateOut.bigSegmentsStatus = computeUpdatedBigSegmentsStatus(stateOut.bigSegmentsStatus, result[1]);
    } else {
      stateOut.bigSegmentsStatus = computeUpdatedBigSegmentsStatus(stateOut.bigSegmentsStatus, 'NOT_CONFIGURED');
    }
    /* eslint-enable no-param-reassign */
    return bigSegmentMatchContext(
      stateOut.bigSegmentsMembership[bigSegmentContext.key],
      segment,
      bigSegmentContext,
      queries,
      stateOut,
      cb
    );
  });
}

function bigSegmentMatchContext(membership, segment, context, queries, stateOut, cb) {
  const segmentRef = makeBigSegmentRef(segment);
  const included = membership && membership[segmentRef];
  if (included !== undefined) {
    return cb(included);
  }
  return simpleSegmentMatchContext(segment, context, false, queries, stateOut, cb);
}

function getContextForKind(context, inKind) {
  const kind = inKind || 'user';
  if (context.kind === 'multi') {
    return context[kind];
  } else if (context.kind === kind || (context.kind === undefined && kind === 'user')) {
    return context;
  }
  return undefined;
}

/**
 * Search the given contextTargets and userTargets. If a match is made, then
 * return `[true, true]`. If a match is not made then return `[false, _]`.
 * If there was an error which prevents matching, then return `[true, false]`.
 * @param {{contextKind: string, values: string[]}[]} contextTargets
 * @param {string[]} userTargets
 * @param {Object} context
 * @returns {[boolean, boolean]} Pair of booleans where the first indicates
 * if the return value should be used, and the second indicates if there
 * was a match.
 */
function segmentSearch(contextTargets, userTargets, context) {
  const contextKind = context.kind || 'user';
  for (const { contextKind: kind, values } of contextTargets) {
    const contextForKind = getContextForKind(context, kind);
    if (contextForKind) {
      if (values.indexOf(contextForKind.key) >= 0) {
        return [true, true];
      }
    }
  }

  const userContext = contextKind === 'user' ? context : context['user'];
  if (userContext) {
    if (userTargets.indexOf(userContext.key) >= 0) {
      return [true, true];
    }
  }
  return [false, false];
}

function simpleSegmentMatchContext(segment, context, useIncludesAndExcludes, queries, stateOut, cb, segmentsVisited) {
  if (useIncludesAndExcludes) {
    const includedRes = segmentSearch(segment.includedContexts || [], segment.included || [], context);
    if (includedRes[0]) {
      return cb(includedRes[1]);
    }
    const excludedRes = segmentSearch(segment.excludedContexts || [], segment.excluded || [], context);
    if (excludedRes[0]) {
      // The match was an exclusion, so it should be negated.
      return cb(!excludedRes[1]);
    }
  }

  safeAsyncEachSeries(
    segment.rules || [],
    (rule, callback) => {
      segmentRuleMatchContext(
        rule,
        context,
        segment.key,
        segment.salt,
        queries,
        stateOut,
        res => {
          // on the first rule that does match, we raise an "error" to stop the loop
          callback(res ? res : null);
        },
        segmentsVisited
      );
    },
    err => {
      cb(err);
    }
  );
}

function segmentRuleMatchContext(rule, context, segmentKey, salt, queries, stateOut, cb, segmentsVisited) {
  safeAsyncEachSeries(
    rule.clauses,
    (clause, callback) => {
      clauseMatchContext(
        clause,
        context,
        queries,
        stateOut,
        matched => {
          // on the first clause that does *not* match, we raise an "error" to stop the loop
          callback(matched ? null : clause);
        },
        segmentsVisited
      );
    },
    err => {
      if (err) {
        return cb(false);
      }
      // If the weight is absent, this rule matches
      if (rule.weight === undefined || rule.weight === null) {
        return cb(true);
      }

      // All of the clauses are met. See if the user buckets in
      const { invalid, refAttr } = validateReference(!rule.contextKind, rule.bucketBy || 'key');
      if (invalid) {
        stateOut.error = [new Error('Invalid attribute reference in rule.'), errorResult('MALFORMED_FLAG')]; // eslint-disable-line no-param-reassign
        return cb(false);
      }
      const [bucket] = bucketContext(context, segmentKey, refAttr, salt, rule.contextKind);
      const weight = rule.weight / 100000.0;
      return cb(bucket < weight);
    }
  );
}

function maybeNegate(c, b) {
  if (c.negate) {
    return !b;
  } else {
    return b;
  }
}

function matchAny(matchFn, value, values) {
  for (let i = 0; i < values.length; i++) {
    if (matchFn(value, values[i])) {
      return true;
    }
  }

  return false;
}

function getVariation(flag, index, reason, cb) {
  if (index === null || index === undefined || index < 0 || index >= flag.variations.length) {
    cb(new Error('Invalid variation index in flag'), errorResult('MALFORMED_FLAG'));
  } else {
    cb(null, { value: flag.variations[index], variationIndex: index, reason: reason });
  }
}

function getOffResult(flag, reason, cb) {
  if (flag.offVariation === null || flag.offVariation === undefined) {
    cb(null, { value: null, variationIndex: null, reason: reason });
  } else {
    getVariation(flag, flag.offVariation, reason, cb);
  }
}

function getResultForVariationOrRollout(r, context, flag, reason, cb) {
  if (!r) {
    cb(new Error('Fallthrough variation undefined'), errorResult('MALFORMED_FLAG'));
  } else {
    const [index, inExperiment, errorData] = variationForUser(r, context, flag);
    if (errorData !== undefined) {
      cb(...errorData);
    } else if (index === null || index === undefined) {
      cb(new Error('Variation/rollout object with no variation or rollout'), errorResult('MALFORMED_FLAG'));
    } else {
      const transformedReason = reason;
      if (inExperiment) {
        transformedReason.inExperiment = true;
      }
      getVariation(flag, index, transformedReason, cb);
    }
  }
}

function errorResult(errorKind) {
  return { value: null, variationIndex: null, reason: { kind: 'ERROR', errorKind: errorKind } };
}

// Given a variation or rollout 'r', select the variation for the given context.
// Returns an array of the form [variationIndex, inExperiment, Error].
function variationForUser(r, context, flag) {
  if (r.variation !== null && r.variation !== undefined) {
    // This represets a fixed variation; return it
    return [r.variation, false, undefined];
  }
  const rollout = r.rollout;
  if (rollout) {
    const isExperiment = rollout.kind === 'experiment';
    const variations = rollout.variations;
    if (variations && variations.length > 0) {
      // This represents a percentage rollout. Assume
      // we're rolling out by key
      const bucketBy = isExperiment ? 'key' : rollout.bucketBy || 'key';
      const { invalid, refAttr } = validateReference(!rollout.contextKind, bucketBy);
      if (invalid) {
        return [
          undefined,
          undefined,
          [new Error('Invalid attribute reference for bucketBy in rollout'), errorResult('MALFORMED_FLAG')],
        ];
      }
      const [bucket, hadContext] = bucketContext(
        context,
        flag.key,
        refAttr,
        flag.salt,
        rollout.seed,
        rollout.contextKind
      );
      let sum = 0;
      for (let i = 0; i < variations.length; i++) {
        const variate = variations[i];
        sum += variate.weight / 100000.0;
        if (bucket < sum) {
          return [variate.variation, isExperiment && hadContext && !variate.untracked, undefined];
        }
      }

      // The context's bucket value was greater than or equal to the end of the last bucket. This could happen due
      // to a rounding error, or due to the fact that we are scaling to 100000 rather than 99999, or the flag
      // data could contain buckets that don't actually add up to 100000. Rather than returning an error in
      // this case (or changing the scaling, which would potentially change the results for *all* users), we
      // will simply put the context in the last bucket.
      const lastVariate = variations[variations.length - 1];
      return [lastVariate.variation, isExperiment && !lastVariate.untracked, undefined];
    }
  }

  return [null, false];
}

// Fetch an attribute value from a context object. Automatically
// navigates into the custom array when necessary
function legacyUserValue(context, attr) {
  if (builtins.some(builtIn => AttributeReference.compare(attr, builtIn))) {
    return contextValueByReference(context, attr);
  }
  if (context.custom) {
    return contextValueByReference(context.custom, attr);
  }
  return null;
}

/**
 * Get a value from the context by the specified reference.
 * @param {Object} context
 * @param {string} reference
 * @returns The value from the context, or undefined. If the value
 * would have been a non-array object, then undefined will be returned.
 * Objects are not valid for clauses.
 */
function contextValueByReference(context, reference) {
  const value = AttributeReference.get(context, reference);
  // Rules cannot use objects as a value.
  if (typeof value === 'object' && !Array.isArray(value)) {
    return undefined;
  }
  return value;
}

function legacyAttributeToReference(attr) {
  return attr && attr.startsWith('/') ? AttributeReference.literalToReference(attr) : attr;
}

/**
 * Get a value from the specified context that matches the kind and
 * attribute reference.
 * @param {Object} context The context to get a value from.
 * @param {string} kind The kind that the value must be from.
 * @param {string} attr An attribute reference to the value.
 * @param {boolean} isLegacy Boolean flag indicating if the attribute is from
 * a type which didn't specify a contextKind.
 * @returns {[boolean, any]} A tuple where the first value indicates if the reference was valid and the second is the value
 * of the attribute. The value will be undefined if the attribute does not exist, or if the type
 * of the attribute is not suitable for evaluation (an object).
 */
function contextValue(context, kind, attr, isLegacy) {
  //In the old format an attribute name could have started with a '/' but not
  //been a reference. In this case these attributes need converted.
  const { invalid, refAttr } = validateReference(isLegacy, attr);
  if (invalid) {
    return [!invalid, undefined];
  }

  // If anonymous is not defined, then it is considered false.
  if (attr === 'anonymous') {
    const forKind = getContextForKind(context, kind);
    return [true, contextValueByReference(forKind, refAttr) || false];
  }

  if (!context.kind) {
    if (kind === 'user') {
      return [true, legacyUserValue(context, refAttr)];
    }
    return [true, undefined];
  } else if (context.kind === 'multi') {
    return [true, contextValueByReference(context[kind], refAttr)];
  } else if (context.kind === kind) {
    return [true, contextValueByReference(context, refAttr)];
  }
  return [true, undefined];
}

/**
 * Validate an attribute and return an escaped version if needed.
 * @param {boolean} isLegacy
 * @param {string} attr
 * @returns A pair where the first value indicates if the reference was valid,
 * and the second value is the reference, possibly converted from a literal.
 */
function validateReference(isLegacy, attr) {
  const refAttr = isLegacy ? legacyAttributeToReference(attr) : attr;

  const invalid = attr === '' || (refAttr.startsWith('/') && !AttributeReference.isValidReference(refAttr));
  return { invalid, refAttr };
}

/**
 * Compute a bucket value for use in a rollout or experiment. If an error condition prevents us from
 * computing a valid bucket value, we return zero, which will cause the evaluation to use the first
 * bucket.
 *
 * @returns {[number, boolean]} A tuple where the first value is the bucket, and the second value
 * indicates if there was a context for the value specified by `kindForRollout`. If there was not
 * a context for the specified kind, then the `inExperiment` attribute should be `false`.
 */
function bucketContext(context, key, attr, salt, seed, kindForRollout) {
  const kindOrDefault = kindForRollout || 'user';
  //Key pre-validated. So we can disregard the validation here.
  const [, value] = contextValue(context, kindOrDefault, attr, kindForRollout === undefined);

  const idHash = bucketableStringValue(value);

  if (idHash === null) {
    // If we got a value, then we know there was a context, but if we didn't get a value, then
    // it could either be there wasn't an attribute, the attribute was undefined/null, or there
    // was not a context. So here check for the context.
    const contextForKind = getContextForKind(context, kindForRollout);

    return [0, !!contextForKind];
  }

  const prefix = seed ? util.format('%d.', seed) : util.format('%s.%s.', key, salt);
  const hashKey = prefix + idHash;
  const hashVal = parseInt(sha1Hex(hashKey).substring(0, 15), 16);

  return [hashVal / 0xfffffffffffffff, true];
}

function bucketableStringValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (Number.isInteger(value)) {
    return '' + value;
  }
  return null;
}

function sha1Hex(input) {
  const hash = crypto.createHash('sha1');
  hash.update(input);
  return hash.digest('hex');
}

function makeBigSegmentRef(segment) {
  // The format of Big Segment references is independent of what store implementation is being
  // used; the store implementation receives only this string and does not know the details of
  // the data model. The Relay Proxy will use the same format when writing to the store.
  return segment.key + '.g' + segment.generation;
}

module.exports = {
  Evaluator,
  bucketContext,
  makeBigSegmentRef,
};
