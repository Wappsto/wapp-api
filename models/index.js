const Request = require('./request');
const Util = require('../util');

const _requestInstance = "_requestInstance";
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

/*
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
}*/

class WappstoModels {
    constructor(request) {
        let self = this;
        if(request instanceof Request){
            this[_requestInstance] = request
        } else {
            this[_requestInstance] = new Request(request);
        }
        this[_util] = this[_requestInstance][_util];
        for (let key in toCreate) {
            this[key] = function(data) {
                if (!(this instanceof self[key])) {
                    throw new Error(key + " should be created with `new`");
                }
                return new toCreate[key](data, self[_requestInstance]);
            }
        }
    }

    get util() {
        return this[_util];
    }
}

module.exports = WappstoModels;
