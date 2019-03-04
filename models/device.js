const Util = require('../util');
const Generic = require('./generic-class');
const Value = require('./value');
const Set = require('./set');

const _pickAttributes = Symbol.for("generic-class-pickAttributes");

class Device extends Generic{}

Device[_pickAttributes] = {
  '2.0': ['meta', 'name', 'product', 'serial', 'description', 'protocol', 'communication', 'version', 'manufacturer', 'value']
};

Device["_relations"] = [{
  type: Util.type.Many,
  key: "value",
  relatedClass: Value
},{
  type: Util.type.Many,
  key: "set",
  relatedClass: Set
}];

module.exports = Device;
