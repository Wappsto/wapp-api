const Util = require('../util');
const Generic = require('./generic-class');
const Device = require('./device');
const Set = require('./set');

const _pickAttributes = Symbol.for("generic-class-pickAttributes");

class Network extends Generic{}

Network[_pickAttributes] = {
  '2.0': ['meta', 'name', 'device']
};

Network["_relations"] = [{
  type: Util.type.Many,
  key: "device",
  relatedClass: Device
},{
  type: Util.type.Many,
  key: "set",
  relatedClass: Set
}];

module.exports = Network;
