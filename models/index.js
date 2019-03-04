const Util = require('../util');
const _util = Symbol.for("generic-util");

let toCreate = {
    State: require('./state'),
    Value: require('./value'),
    Device: require('./device'),
    Network: require('./network'),
    Stream: require('./stream'),
    Set: require('./set'),
    Notification: require('./notification'),
    Data: require('./data'),
    Model: require('./generic-class'),
    Collection: require('./generic-collection')
}

// The only way to keep names, at least for now
let extendClass = (c, key) => {
  switch (key) {
    case "State":
      return class State extends c{};
      break;
    case "Value":
      return class Value extends c{};
      break;
    case "Device":
      return class Device extends c{};
      break;
    case "Network":
      return class Network extends c{};
      break;
    case "Stream":
      return class Stream extends c{};
      break;
    case "Set":
      return class Set extends c{};
      break;
    case "Notification":
      return class Notification extends c{};
      break;
    case "Data":
      return class Data extends c{};
      break;
    case "Model":
      return class Model extends c{};
      break;
    case "Collection":
      return class Collection extends c{};
      break;
    default:
      throw new Error("undefined class name");
      break;
  }
}

class WappstoModels {
    constructor(util, wrapper) {
        this[_util] = Util.extend(util);
        for (let key in toCreate) {
            // Get class name instead of anonmymous
            this[key] = extendClass(toCreate[key], key);
            this[key][_util] = this[_util];
            if(wrapper){
              wrapper(this[key]);
            }
        }
    }

    get util() {
        return this[_util];
    }
}

module.exports = WappstoModels;
