const Generic = require('./generic-class');

const _pickAttributes = Symbol.for("generic-class-pickAttributes");

class State extends Generic{}

State[_pickAttributes] = {
  '2.0': ['meta', 'data', 'status', 'type', 'timestamp']
};

module.exports = State;
