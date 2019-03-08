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

class WappstoModels {
    constructor(request) {
        let self = this;
        if(request instanceof Request){
            this[_requestInstance] = request
        } else {
            this[_requestInstance] = new Request(request);
        }
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
        return this[_requestInstance][_util];
    }
}

module.exports = WappstoModels;
