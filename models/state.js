const Generic = require('./generic-class');

const _pickAttributes = Symbol.for("generic-class-pickAttributes");

const _name = Symbol.for("generic-class-name");

class State extends Generic{
  getLogs(options = {}){
    if(this.get("meta.id")){
      options.method = "GET";
      options.url = this.util.getServiceUrl('log') + "/" + this.get("meta.id") + "?type=" + this[_name];
      options.parse = false;
      return this._request(options);
    }
    return false;
  }
}

State[_pickAttributes] = {
  '2.0': ['meta', 'data', 'status', 'type', 'timestamp']
};

module.exports = State;
