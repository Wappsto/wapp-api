const fetch = require('node-fetch');
const querystring = require('querystring');

const Models = require('../models');
const Stream = require('../stream');
const Util = require('../util');

const Request = require('./request');

const _util = Symbol.for("generic-util");
const _wappstoModels = Symbol("wappstoModels");
const _Stream = Symbol("Stream");
const _class = "defaultModel";
const _className = Symbol.for("generic-collection-className");
const _requestInstance = "_requestInstance";

class Wappsto {
  constructor(request) {
    if(request instanceof Request){
        this[_requestInstance] = request
    } else {
        this[_requestInstance] = new Request(request, this);
    }
    this[_wappstoModels] = new Models(this[_requestInstance]);
    this[_Stream] = Stream;
  }

  get util() {
    return this[_requestInstance][_util];
  }

  get models() {
    return this[_wappstoModels];
  }

  get Stream() {
    return this[_Stream];
  }

  get wStream(){
    return this[_requestInstance]._wStream;
  }

  set wStream(wStream){
    this[_requestInstance]._wStream = wStream;
  }

  create(type, obj = {}, options){
      if(!type || !this.models[type]){
          console.error("you must specify a model type");
          return;
      }

      let model = new this.models[type]();
      model.save(obj, options);
  }

  get(searchIn, searchObj, options = {}) {
      // Checking searchIn
      if(!searchIn){
        console.error("you must specify a service");
        return false;
      }

      // Checking quantity
      if(options.hasOwnProperty("quantity")){
        let quantity = options.quantity;
        if((isNaN(quantity) &&  quantity !== "all") || (!isNaN(quantity) && parseInt(quantity) < 1)){
          console.error("quantity must be a positive number");
          return false;
        }
      }

      let data = this._getOptionsData(searchObj, options);
      data = querystring.stringify(data);

      let collection = new this.models.Collection();
      collection[_className] = searchIn;
      let M = searchIn.charAt(0).toUpperCase() + searchIn.slice(1);
      M = this.models[M];

      if (M) {
        collection[_class] = M;
      }

      let requestOptions = Object.assign({}, options, {
        url: this.util.baseUrl + "/" + searchIn + "?" + data
      });
      collection.fetch(requestOptions);
  }

  _getOptionsData(searchObj, options) {
    let tempObj = {
      method: options.method || ["retrieve", "update"]
    };
    for (let key in searchObj) {
      let val = searchObj[key];
      if (val !== undefined && val !== null) {
        if (key == "_parent" && val instanceof Object) {
          for (let k in val) {
            tempObj["parent_" + k] = val[k];
          }
        } else {
          tempObj["this_" + key] = val;
        }
      }
    }
    if (options.quantity) {
      tempObj.quantity = options.quantity;
    }
    if (options.expand) {
      tempObj.expand = options.expand;
    }
    if (options.message) {
      tempObj.message = options.message;
    }
    return tempObj;
  }

  initializeStream(streamJSON, options = {}) {
    let models = [];
    let searchFor = {};
    if(!streamJSON){
      streamJSON = {};
    } else if(streamJSON.constructor === Array){
      let paths = [];
      streamJSON.forEach((obj) => {
        if(obj instanceof this.models.Model){
          let url = model.url({ full: false }).replace(model.util.baseUrl, "");
          paths.push(url);
          models.push(obj);
        } else if(obj.constructor === Object){
          path = obj.meta && obj.meta.id && obj.meta.type && "/" + obj.meta.type + "/" + obj.meta.id;
          if(path){
            paths.push(path);
          }
        }
      });
      streamJSON = {
        subscription: paths
      };
    }
    if(streamJSON.name){
      searchFor = {
        name: streamJSON.name
      }
    }
    this.get('stream', searchFor, {
      expand: 1,
      success: (streamCollection) => {
        if (streamCollection.length > 0) {
          if (!streamJSON.hasOwnProperty('full')) {
              streamJSON.full = true;
          }
          let stream = streamCollection.first();

          // merging with json
          if(streamJSON.subscription){
            streamJSON.subscription = [...streamJSON.subscription, ...stream.get("subscription")];
          }
          if(streamJSON.ignore){
            streamJSON.ignore = [...streamJSON.ignore, ...stream.get("ignore")];
          }

          stream.save(streamJSON, {
            patch: true,
            success: () => {
              this._startStream(stream, models, options);
            },
            error: options.error
          });
        } else {
          this._createStream(streamJSON, models, options);
        }
      },
      error: options.error
    });
  }

  _createStream(streamJSON, models, options) {
    let stream = new this.models.Stream(streamJSON);
    stream.save({}, {
        success: () => {
            this._startStream(stream, models, options);
        },
        error: options.error
    });
  }

  _startStream(stream, models, options){
    let wStream = new this.Stream(stream);
    wStream.open();
    if(options.subscribe === true){
      wStream.subscribe(models);
    }
    if(options.success){
      options.success(wStream);
    }
  }
}

try {
  if (typeof window === 'object' && window.document) {
    window.Wappsto = Wappsto;
  }
} catch (e) {

}

module.exports = Wappsto;