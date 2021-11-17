function TestData() {
  const existingFlagBuilders = {};
  const dataSourceImpls = [];

  const td = () => {
    const tds = {
      start: true,
      stop: true,
      initialized: true,
      close: true,
    };
    dataSourceImpls.push(tds);
    return tds;
  };

  td.flag = flagName => {
    if (existingFlagBuilders[flagName]) {
      return existingFlagBuilders[flagName].copy();
    } else {
      return new FlagBuilder(flagName);
    }
  };

  td.update = flagBuilder => {
    existingFlagBuilders[flagBuilder._key] = flagBuilder;
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

FlagBuilder.prototype.copy = function () {
  const to = new FlagBuilder(this._key);
  to._variations = [...this._variations];
  to._offVariation = this._offVariation;
  to._on = this._on;
  to._fallthroughVariation = this._fallthroughVariation;
  to._targets = !this._targets ? null : JSON.parse(JSON.stringify(this._targets));
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

FlagBuilder.variationForBoolean = function (aBool) {
  return aBool ? TRUE_VARIATION_INDEX : FALSE_VARIATION_INDEX;
};

FlagBuilder.prototype.fallthroughVariation = function (variation) {
  if (typeof variation === 'boolean') {
    this.booleanFlag().fallthroughVariation(FlagBuilder.variationForBoolean(variation));
  } else {
    this._fallthroughVariation = variation;
  }
  return this;
};

FlagBuilder.prototype.offVariation = function (variation) {
  if (typeof variation === 'boolean') {
    this.booleanFlag().offVariation(FlagBuilder.variationForBoolean(variation));
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

FlagBuilder.prototype.variationForUser = function (userKey, variation) {
  if (typeof variation === 'boolean') {
    return this.booleanFlag().variationForUser(userKey, FlagBuilder.variationForBoolean(variation));
  }

  if (!this._targets) {
    this._targets = {};
  }

  this._variations.forEach((_, i) => {
    if (i === variation) {
      //If there is no set at the current variation then set it to the empty array
      if (!this._targets[i]) {
        this._targets[i] = [];
      }
      // Add user to current variation set if they arent already there
      if (this._targets[i].indexOf(userKey) === -1) {
        this._targets[i].push(userKey);
      }
    } else {
      // remove user from other variation set if necessary
      if (this._targets[i]) {
        const userIndex = this._targets[i].indexOf(userKey);
        if (userIndex !== -1) {
          this._targets = this._targets[i].splice(userIndex);
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
    baseFlagObject.targets = Object.entries(this._targets).map(([variationIndex, userKeys]) => ({
      variation: parseInt(variationIndex, 10),
      values: userKeys,
    }));
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
    return this.thenReturn(FlagBuilder.variationForBoolean(variation));
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
