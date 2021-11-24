const dataKind = require('./versioned_data_kind');
const { promisify } = require('util');

function TestData() {
  const existingFlagBuilders = {};
  const currentFlags = {};
  const dataSourceImpls = [];

  function makeInitData() {
    return { [dataKind.features.namespace]: JSON.parse(JSON.stringify(currentFlags)) };
  }

  const td = config => {
    const featureStore = config.featureStore;

    const tds = {
      start: start,
      stop: stop,
      initialized: () => true,
      close: stop,
      upsert: upsert,
    };

    function start(cb = (() => {})) {
      featureStore.init(makeInitData(), cb);
    }

    function stop() {
      dataSourceImpls.splice(dataSourceImpls.indexOf(this));
    }

    function upsert(value, cb = (() => {})) {
      featureStore.upsert(dataKind.features, value, cb);
    }

    dataSourceImpls.push(tds);

    return tds;
  };

  td.flag = flagName => {
    if (existingFlagBuilders[flagName]) {
      return existingFlagBuilders[flagName].copy();
    } else {
      return new FlagBuilder(flagName).booleanFlag();
    }
  };

  td.update = (flagBuilder, cb) => {
    const oldItem = currentFlags[flagBuilder._key];
    const oldVersion = oldItem ? oldItem.version : 0;
    const newFlag = flagBuilder.build(oldVersion + 1);
    currentFlags[flagBuilder._key] = newFlag;
    existingFlagBuilders[flagBuilder._key] = flagBuilder.copy();

    Promise.all(dataSourceImpls.map(impl => promisify(impl.upsert)(newFlag))).then(cb);
  };

  return td;
}

function FlagBuilder(flagName) {
  this._key = flagName;
  this._on = true;
  this._variations = [];
}

const TRUE_VARIATION_INDEX = 0;
const FALSE_VARIATION_INDEX = 1;

function variationForBoolean(aBool) {
  return aBool ? TRUE_VARIATION_INDEX : FALSE_VARIATION_INDEX;
}

FlagBuilder.prototype.copy = function () {
  const to = new FlagBuilder(this._key);
  to._variations = [...this._variations];
  to._offVariation = this._offVariation;
  to._on = this._on;
  to._fallthroughVariation = this._fallthroughVariation;
  to._targets = !this._targets ? null : new Map(this._targets);
  to._rules = !this._rules ? null : JSON.parse(JSON.stringify(this._rules));
  return to;
};

FlagBuilder.prototype.isBooleanFlag = function () {
  return (
    this._variations.length === 2 &&
    this._variations[TRUE_VARIATION_INDEX] === true &&
    this._variations[FALSE_VARIATION_INDEX] === false
  );
};

FlagBuilder.prototype.booleanFlag = function () {
  if (this.isBooleanFlag()) {
    return this;
  } else {
    return this.variations([true, false])
      .fallthroughVariation(TRUE_VARIATION_INDEX)
      .offVariation(FALSE_VARIATION_INDEX);
  }
};

FlagBuilder.prototype.on = function (aBool) {
  this._on = aBool;
  return this;
};

FlagBuilder.prototype.fallthroughVariation = function (variation) {
  if (typeof variation === 'boolean') {
    this.booleanFlag().fallthroughVariation(variationForBoolean(variation));
  } else {
    this._fallthroughVariation = variation;
  }
  return this;
};

FlagBuilder.prototype.offVariation = function (variation) {
  if (typeof variation === 'boolean') {
    this.booleanFlag().offVariation(variationForBoolean(variation));
  } else {
    this._offVariation = variation;
  }
  return this;
};

FlagBuilder.prototype.variations = function (values) {
  this._variations = [...values];
  return this;
};

FlagBuilder.prototype.clearUserTargets = function () {
  this._targets = null;
  return this;
};

FlagBuilder.prototype.clearRules = function () {
  this._rules = null;
  return this;
};

FlagBuilder.prototype.variationForAllUsers = function (variation) {
  return this.on(true).clearRules().clearUserTargets().fallthroughVariation(variation);
};

FlagBuilder.prototype.valueForAllUsers = function (value) {
  return this.variations([value]).variationForAllUsers(0);
};

FlagBuilder.prototype.variationForUser = function (userKey, variation) {
  if (typeof variation === 'boolean') {
    return this.booleanFlag().variationForUser(userKey, variationForBoolean(variation));
  }

  if (!this._targets) {
    this._targets = new Map();
  }

  this._variations.forEach((_, i) => {
    if (i === variation) {
      //If there is no set at the current variation then set it to the empty array
      let targetForVariation;
      if (this._targets.has(i)) {
        targetForVariation = this._targets.get(i);
      } else {
        targetForVariation = [];
      }
      // Add user to current variation set if they arent already there
      if (targetForVariation.indexOf(userKey) === -1) {
        targetForVariation.push(userKey);
      }

      this._targets.set(i, targetForVariation);
    } else {
      // remove user from other variation set if necessary
      if (this._targets.has(i)) {
        const targetForVariation = this._targets.get(i);
        const userIndex = targetForVariation.indexOf(userKey);
        if (userIndex !== -1) {
          this._targets.set(i, targetForVariation.splice(userIndex));
        }
      }
    }
  });

  return this;
};

FlagBuilder.prototype.addRule = function (flagRuleBuilder) {
  if (!this._rules) {
    this._rules = [];
  }
  this._rules.push(flagRuleBuilder);
};

FlagBuilder.prototype.ifMatch = function (attribute, ...values) {
  const flagRuleBuilder = new FlagRuleBuilder(this);
  return flagRuleBuilder.andMatch(attribute, ...values);
};

FlagBuilder.prototype.ifNotMatch = function (attribute, ...values) {
  const flagRuleBuilder = new FlagRuleBuilder(this);
  return flagRuleBuilder.andNotMatch(attribute, ...values);
};

FlagBuilder.prototype.build = function (version) {
  const baseFlagObject = {
    key: this._key,
    version: version,
    on: this._on,
    offVariation: this._offVariation,
    fallthrough: {
      variation: this._fallthroughVariation,
    },
    variations: [...this._variations],
  };

  if (this._targets) {
    const targets = [];
    for (const [variationIndex, userKeys] of this._targets) {
      targets.push({
        variation: variationIndex,
        values: userKeys,
      });
    }
    baseFlagObject.targets = targets;
  }

  if (this._rules) {
    baseFlagObject.rules = this._rules.map((rule, i) => rule.build(i));
  }

  return baseFlagObject;
};

/* FlagRuleBuilder */
function FlagRuleBuilder(flagBuilder) {
  this._flagBuilder = flagBuilder;
  this._clauses = [];
  this._variation = null;
}

FlagRuleBuilder.prototype.andMatch = function (attribute, ...values) {
  this._clauses.push({
    attribute: attribute,
    operator: 'in',
    values: values,
    negate: false,
  });
  return this;
};

FlagRuleBuilder.prototype.andNotMatch = function (attribute, ...values) {
  this._clauses.push({
    attribute: attribute,
    operator: 'in',
    values: values,
    negate: true,
  });
  return this;
};

FlagRuleBuilder.prototype.thenReturn = function (variation) {
  if (typeof variation === 'boolean') {
    this._flagBuilder.booleanFlag();
    return this.thenReturn(variationForBoolean(variation));
  }

  this._variation = variation;
  this._flagBuilder.addRule(this);
  return this._flagBuilder;
};

FlagRuleBuilder.prototype.build = function (id) {
  return {
    id: 'rule' + id,
    variation: this._variation,
    clauses: this._clauses,
  };
};

module.exports = TestData;
