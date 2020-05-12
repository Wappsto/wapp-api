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
const _name = Symbol.for("generic-class-name");

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

  send(options){
    if(options.generateUrl !== false){
      if(options.constructor === Object){
        options = Object.assign({}, options);
      } else {
        options = {
          url: options,
          method: "GET"
        }
      }
      const service = options.url.split('/')[0];
      options.url = this.util.getServiceUrl(service) + options.url;
    }
    return this._sendAndHandle(options);
  }

  sendExtsync(options){
    if(options.generateUrl !== false){
      options = Object.assign({}, options);
      let url = this.util.getServiceUrl('extsync', options);
      if(options.type === "request"){
        url += '/request';
      } else if(options.type === "response"){
        url += '/response';
        if(!options.method){
          options.method = "PATCH";
        }
      }
      if(options.useSession === false || options.token){
        url += '/' + (options.token || this.util.token);
      }
      if(options.url){
        url += options.url;
      }
      options.url = url;
    }
    return this._sendAndHandle(options);
  }

  _sendAndHandle(options){
    let responseFired = false;
    return this[_requestInstance].http(options)
    .then((response) => {
      responseFired = true;
      response.responseJSON = response.data;
      this._fireResponse("success", [response.data, response], options);
      return response;
    })
    .catch((response) => {
      if (responseFired) {
        Util.throw(response);
      }
      responseFired = true;
      this._fireResponse("error", [response], options);
      return response;
    });
  }

  _fireResponse(type, args, options) {
    if (options[type]) {
      options[type].apply(context, args);
    }
    if (options.complete) {
      options.complete.call(context, context);
    }
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
        url: this.util.getServiceUrl(searchIn, options) + "?" + data
      });
      return collection.fetch(requestOptions);
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
          let url = model.url().replace(model.util.getServiceUrl(model[_name]), "");
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
    return new Promise((resolve, reject) => {
      const streamServiceVersion = this.util.getServiceVersion('stream');
      if (!streamJSON.hasOwnProperty('full')) {
          streamJSON.full = true;
      }
      // if(streamServiceVersion){
      //   let stream = new this.models.Stream(streamJSON);
      //   this._startStream(stream, models, options, resolve);
      // } else {
        this.get('stream', searchFor, {
          expand: 1,
          success: (streamCollection) => {
            if (streamCollection.length > 0) {
              let stream = streamCollection.first();

              // merging with json
              let newJSON = this._mergeStreams(stream.toJSON(), streamJSON);

              if(newJSON){
                stream.save(newJSON, {
                  patch: true,
                  success: () => {
                    this._startStream(stream, models, options, resolve);
                  },
                  error: (model, response) => {
                    reject(response);
                  }
                });
              } else {
                this._startStream(stream, models, options, resolve);
              }
            } else {
              this._createStream(streamJSON, models, options, resolve, reject);
            }
          },
          error: (model, response) => {
            reject(response);
          }
        });
      // }
    }).catch((error) => {
      if(!options.error || options.error.constructor !== Function){
        throw error;
      } else {
        options.error(error);
      }
    })
  }

  _mergeStreams(oldJSON, newJSON){
    let update = false;
    if(newJSON.subscription){
      newJSON.subscription.forEach((sub) => {
        if(oldJSON.subscription.indexOf(sub) === -1){
          update = true;
          oldJSON.subscription.push(sub);
        }
      });
    }
    if(newJSON.ignore){
      newJSON.ignore.forEach((sub) => {
        if(oldJSON.ignore.indexOf(sub) === -1){
          update = true;
          oldJSON.ignore.push(sub);
        }
      });
    }
    if(oldJSON.full !== newJSON.full){
      update = true;
      oldJSON = newJSON.full;
    }
    return update ? oldJSON : undefined;
  }

  _createStream(streamJSON, models, options, resolve, reject) {
    let stream = new this.models.Stream(streamJSON);
    stream.save({}, {
        success: () => {
            this._startStream(stream, models, options, resolve);
        },
        error: (model, response) => {
          reject(response);
        }
    });
  }

  _startStream(stream, models, options, resolve){
    let wStream = new this.Stream(stream);
    wStream.open(options);
    if(options.subscribe === true){
      wStream.subscribe(models);
    }
    if(options.success){
      options.success(wStream);
    }
    resolve(wStream);
  }
}

try {
  if (typeof window === 'object' && window.document) {
    window.Wappsto = Wappsto;
  }
} catch (e) {

}

module.exports = Wappsto;
