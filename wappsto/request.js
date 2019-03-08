const Request = require('../models/request');
const StreamModel = require('../models/stream');
const Collection = require('../models/generic-collection');

const _class = "defaultModel";
const _className = Symbol.for("generic-collection-className");

const STATUS = {
  ACCEPTED: "accepted", // user accepted the request
  PENDING: "pending",   // waiting for restservice
  WAITING: "waiting"    // waiting for user to accept
}

let callStatusChange = function(options, status){
  if(options.onStatusChange && (!options.onlySuccess || status === STATUS.ACCEPTED)){
    options.onStatusChange.call(this, status);
  }
};

class WappstoRequest extends Request {
  constructor(util, wappsto){
    super(util);
    this._wappsto = wappsto;
    this._waitFor = {};
  }

  _model(model, options = {}){
    if(model instanceof StreamModel){
      super._model.apply(this, arguments);
      return;
    }
    let requestOptions = this._getPrecisePermissionOptions(options);
    this._wrapRequest(model, requestOptions, options);
  }

  _collection(collection, options = {}){
    if(collection[_class].prototype instanceof StreamModel || collection[_className] === "stream"){
      return super._collection.apply(this, arguments);
    }
    let self = this;
    let requestOptions;
    if(options.method === "GET" && ((options.query && options.query.indexOf("quantity") !== -1) ||options.url.indexOf("quantity") !== -1)){
      let quantity = (options.query && options.query.split("quantity=")[1].split("&")[0]) || options.url.split("quantity=")[1].split("&")[0];
      let searchIn = options.url.split("/services/")[1].split("/")[0].split("?")[0];
      requestOptions = {
        ...options,
        success: (col, response) => {
          if(col.length < quantity){
            callStatusChange.call(col, options, STATUS.WAITING);
            self._waitFor[searchIn] = [...(self._waitFor[searchIn] || []), { context: col, options: options }];
          } else {
            callStatusChange.call(col, options, STATUS.ACCEPTED, col, response);
            console.log(options.subscribe);
            if(options.subscribe === true && self._wStream){
              self._wStream.subscribe(col);
            }
            if(options.success){
              options.success.call(col, col, response);
            }
          }
        },
        error: options.error
      }
    } else {
      requestOptions = this._getPrecisePermissionOptions(options);
    }
    this._wrapRequest(collection, requestOptions, options);
  }

  _getPrecisePermissionOptions(options){
    let self = this;
    return {
        ...options,
        success: (context, jsonResponse, xhrResponse) => {
          callStatusChange.call(context, options, STATUS.ACCEPTED);
            if(options.subscribe === true && self._wStream){
              self._wStream.subscribe(context);
            }
            if(options.success){
                options.success.call(context, context, jsonResponse, xhrResponse);
            }
        },
        error: (context, response) => {
            if(response.responseJSON && [400013, 400008].indexOf(response.responseJSON.code) !== -1){
                callStatusChange.call(context, options, STATUS.WAITING);
                self._waitFor.installation = [...(self._waitFor.installation || []), {context: context, options: options}];
            } else if(options.error){
                options.error.call(context, response);
            }
        }
    }
  }

  _wrapRequest(context, requestOptions, options){
    if(this._wStreamPromise){
      this._wStreamPromise.then(() => {
        this._makeRequest(context, requestOptions, options);
      }).catch((response) => {
        if(options.error){
          options.error(response);
        }
      });
    } else {
      this._wStreamPromise = new Promise((resolve, reject) => {
        this._wappsto.initializeStream({
          name: (typeof window === 'object' && window.document) ? "wapp-api-stream-foreground" : "wapp-api-stream-background",
          subscription: ["/notification"],
          full: true
        }, {
          success: (wStream) => {
            this._wStream = wStream;
            this._addPermissionListener(wStream);
            resolve(wStream);
            this._makeRequest(context, requestOptions, options);
          },
          error: (response) => {
            this._wStreamPromise = null;
            reject(response);
            if(options.error){
              options.error(response);
            }
          }
        });
      });
    }
  }

  _makeRequest(context, requestOptions, options){
    callStatusChange.call(context, options, STATUS.PENDING);
    if(context instanceof Collection){
      super._collection(context, requestOptions);
    } else {
      super._model(context, requestOptions);
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
          obj.context._request(obj.options);
        });
        delete this._waitFor[type];
      }
    });
  }
}

module.exports = WappstoRequest;
