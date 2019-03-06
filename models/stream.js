const Util = require('../util');
const Generic = require('./generic-class');
const _pickAttributes = Symbol.for("generic-class-pickAttributes");

class Stream extends Generic{}

Stream["_defaults"] = {
    full: true,
    subscription: []
};

Stream[_pickAttributes] = {
  '2.0': ['meta', 'subscription', 'ignore', 'full', 'name']
};

module.exports = Stream;
