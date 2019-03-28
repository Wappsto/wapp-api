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

  send(context, options){
    if(context instanceof StreamModel || (context[_class] && context[_class].prototype instanceof StreamModel) || context[_className] === "stream"){
      return super.send.apply(this, arguments);
    }
    return new Promise((resolve, reject) => {
      callStatusChange.call(context, options, STATUS.PENDING);
      return this._wrapRequest(context, options, resolve, reject);
    });
  }

  _wrapRequest(context, options, resolveRequest, rejectRequest){
    if(this._wStreamPromise){
      this._wStreamPromise.then(() => {
        this._makeRequest(context, options, resolveRequest, rejectRequest);
      }).catch((context, response) => {
        rejectRequest(response);
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
            this._makeRequest(context, options, resolveRequest, rejectRequest);
          },
          error: (context, response) => {
            this._wStreamPromise = null;
            reject([context, response]);
          }
        });
      }).catch(([context, response]) => {
        rejectRequest(response);
      });
    }
  }

  _makeRequest(context, options, resolve, reject){
    super.send(context, options)
    .then((response) => {
      this._handleSuccess(context, options, response, resolve, reject);
    })
    .catch((response) => {
      this._handleError(context, options, response, resolve, reject);
    });
  }

  _handleSuccess(context, options, response, resolve, reject){
    if(context instanceof Collection && options.method === "GET" && ((options.query && options.query.indexOf("quantity") !== -1) || (options.url && options.url.indexOf("quantity") !== -1))){
      let quantity = (options.query && options.query.split("quantity=")[1].split("&")[0]) || options.url.split("quantity=")[1].split("&")[0];
      let searchIn = options.url.split("/services/")[1].split("/")[0].split("?")[0];
      let length;
      if(response.data instanceof Array){
        length = response.data.length;
      } else {
        length = response.data.id && response.data.id.length;
      }
      if(length < quantity){
        callStatusChange.call(context, options, STATUS.WAITING);
        this._waitFor[searchIn] = [...(this._waitFor[searchIn] || []), { context: context, options: options, resolve: resolve, reject: reject }];
      } else {
        callStatusChange.call(context, options, STATUS.ACCEPTED, context, response);
        context.on("response:handled", () => {
          if(options.subscribe === true && this._wStream){
            this._wStream.subscribe(context);
          }
        });
        resolve(response);
      }
    } else {
        callStatusChange.call(context, options, STATUS.ACCEPTED);
        context.on("response:handled", () => {
          if(options.subscribe === true && this._wStream){
            this._wStream.subscribe(context);
          }
        });
        resolve(response);
    }
  }

  _handleError(context, options, response, resolve, reject){
    if(response.data && response.data.code && [400013, 400008].indexOf(response.data.code) !== -1){
        callStatusChange.call(context, options, STATUS.WAITING);
        this._waitFor.installation = [...(this._waitFor.installation || []), {context: context, options: options, resolve: resolve, reject: reject}];
    } else if(options.error){
        reject(response);
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
          this._makeRequest(obj.context, obj.options, obj.resolve, obj.reject);
        });
        delete this._waitFor[type];
      }
    });
  }
}

module.exports = WappstoRequest;
