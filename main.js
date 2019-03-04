const fetch = require('node-fetch');
const querystring = require('querystring');

let Models = require('./models');
let Stream = require('./stream');
const Util = require('./util');

const _util = Symbol("util");
const _wappstoModels = Symbol("wappstoModels");
const _Stream = Symbol("Stream");
const _class = "defaultModel";
const _className = Symbol.for("generic-collection-className");

const STATUS = {
  ACCEPTED: "accepted", // user accepted the request
  PENDING: "pending",   // waiting for restservice
  WAITING: "waiting"    // waiting for user to accept
}

const StreamModel = require('./models/stream');
const Collection = require('./models/generic-collection');

let callStatusChange = function(options, status){
  if(options.onStatusChange && (!options.onlySuccess || status === STATUS.ACCEPTED)){
    options.onStatusChange.call(this, status);
  }
};

let makeRequest = function(request, requestOptions, options){
  callStatusChange.call(this, options, STATUS.PENDING);
  request.call(this, requestOptions);
};

class Wappsto {
  constructor(util) {
    this._wrapRequest = this._wrapRequest.bind(this);
    this[_util] = Util.extend(util);
    this[_wappstoModels] = new Models(util, this._wrapRequest);
    this[_Stream] = Stream;
    this.wStream = null;
    this._waitFor = {};
  }

  get util() {
    return this[_util];
  }

  get models() {
    return this[_wappstoModels];
  }

  get Stream() {
    return this[_Stream];
  }

  _wrapRequest(modelClass) {
    if(modelClass.prototype instanceof Collection){
      this._wrapCollection(modelClass);
    } else if (!(modelClass.prototype instanceof StreamModel)){
      this._wrapModel(modelClass);
    }
  }

  _wrapCollection(collectionClass){
    var self = this;
    let defaultRequest = collectionClass.prototype._request;
    collectionClass.prototype._request = function (options = {}){
      if(this[_class].prototype instanceof StreamModel || this[_className] === "stream"){
        return defaultRequest.call(this, options);
      }

      let requestOptions;
      if(options.method === "GET" && ((options.query && options.query.indexOf("quantity") !== -1) ||options.url.indexOf("quantity") !== -1)){
        let quantity = (options.query && options.query.split("quantity=")[1].split("&")[0]) || options.url.split("quantity=")[1].split("&")[0];
        let searchIn = options.url.split("/services/")[1].split("/")[0].split("?")[0];
        requestOptions = {
          ...options,
          success: (col, response) => {
            if(col.length < quantity){
              callStatusChange.call(col, options, STATUS.WAITING);
              self._waitFor[searchIn] = [...(self._waitFor[searchIn] || []), { model: col, options: options }];
            } else {
              callStatusChange.call(col, options, STATUS.ACCEPTED, col, response);
              if(options.subscribe === true && self.wStream){
                self.wStream.subscribe(col);
              }
              if(options.success){
                options.success.call(col, col, response);
              }
            }
          },
          error: options.error
        }
      } else {
        requestOptions = self._getPrecisePermissionOptions(options);
      }
      self._request(this, defaultRequest, requestOptions, options);
    }
  }

  _wrapModel(modelClass){
    if(modelClass.prototype instanceof StreamModel){
      return;
    }
    let self = this;
    let defaultRequest = modelClass.prototype._request;
    modelClass.prototype._request = function (options = {}){
      let requestOptions = self._getPrecisePermissionOptions(options);
      self._request(this, defaultRequest, requestOptions, options);
    }
  }

  _getPrecisePermissionOptions(options){
    let self = this;
    return {
        ...options,
        success: (model, jsonResponse, xhrResponse) => {
          callStatusChange.call(model, options, STATUS.ACCEPTED);
            if(options.subscribe === true && self.wStream){
              self.wStream.subscribe(model);
            }
            if(options.success){
                options.success.call(model, model, jsonResponse, xhrResponse);
            }
        },
        error: (model, response) => {
            if(response.responseJSON && [400013, 400008].indexOf(response.responseJSON.code) !== -1){
                callStatusChange.call(model, options, STATUS.WAITING);
                self._waitFor.installation = [...(self._waitFor.installation || []), {model: model, options: options}];
            } else if(options.error){
                options.error.call(model, response);
            }
        }
    }
  }

  _request(model, defaultRequest, requestOptions, options){
    if(this.wStream !== null){
      makeRequest.call(model, defaultRequest, requestOptions, options);
    } else {
      this.wStream = false;
      this.initializeStream({subscription: ["/notification"], full: true}, {
        success: (wStream) => {
          this.wStream = wStream;
          this._addPermissionListener(wStream);
          makeRequest.call(model, defaultRequest, requestOptions, options);
        },
        error: (response) => {
          this.wStream = null;
          if(options.error){
            options.error(response);
          }
        }
      });
    }
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

      let self = this;
      let data = this._getOptionsData(searchObj, options);
      data = querystring.stringify(data);

      let collection = new self[_wappstoModels].Collection();
      let M = searchIn.charAt(0).toUpperCase() + searchIn.slice(1);
      M = self[_wappstoModels][M];

      if (M) {
        collection[_class] = M;
      }

      let requestOptions = {
        ...options,
        url: this.util.baseUrl + "/" + searchIn + "?" + data,
        error: (col, response) => {
          if(options.error){
            options.error(response);
          }
        }
      };
      collection.fetch(requestOptions);
  }

  initializeStream(streamJSON, options = {}) {
    let models = [];
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
    this.get('stream', {}, {
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
            error: (col, response) => {
              if(options.error){
                options.error(response);
              }
            }
          });
        } else {
          this._createStream(streamJSON, models, options);
        }
      },
      error: (col, response) => {
        if(options.error){
          options.error(response);
        }
      }
    });
  }

  _createStream(streamJSON, models, options) {
    let stream = new this.models.Stream(streamJSON);
    stream.save({}, {
        success: () => {
            this._startStream(stream, models, options);
        },
        error: (model, response) => {
            if(options.error){
              options.error(response);
            }
        }
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

  _addPermissionListener(wStream) {
    wStream.on("permission:added", (type, ids) => {
      if(this._waitFor[type]){
        this._waitFor[type].forEach((obj) => {
          if(!obj.options){
            obj.options = {};
          }
          obj.options.onlySuccess = true;
          obj.model._request(obj.options);
        });
        delete this._waitFor[type];
      }
    });
  }
}

try {
  if (typeof window === 'object' && window.document) {
    window.Wappsto = Wappsto;
  }
} catch (e) {

}

module.exports = Wappsto;
