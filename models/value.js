const Util = require('../util');
const Generic = require("./generic-class");
const State = require('./state');
const Set = require('./set');

const _pickAttributes = Symbol.for("generic-class-pickAttributes");

class Value extends Generic{}

Value[_pickAttributes] = {
  '2.0': ['meta', 'name', 'permission', 'type', 'period', 'delta', 'number', 'string', 'blob', 'xml', 'status', 'state']
};

Value["_relations"] = [{
  type: Util.type.Many,
  key: "state",
  relatedClass: State
},{
  type: Util.type.Many,
  key: "set",
  relatedClass: Set
}];

module.exports = Value;
