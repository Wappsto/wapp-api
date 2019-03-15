const Tracer = require('../tracer');
const fetch = require('node-fetch');
const Collection = require('./generic-collection');
const Util = require('../util');

const _util = Symbol.for("generic-util");

class Request {
  constructor(util) {
    this[_util] = Util.extend(util);
    this.send = this.send.bind(this);
  }

  get util(){
    return this[_util];
  }

  send(context, options){
    let args = this._getRequestArguments(context, options);
    return fetch(args.url, args.requestOptions);
  }

  _getRequestArguments(context, options){
    let url = (options.url || context.url());
    if (options.query) {
      if (url.indexOf("?") === -1) {
        url += "?" + options.query;
      } else {
        url += "&" + options.query;
      }
    }
    let headers = options["headers"] || {}
    if (this.util.session && !headers["x-session"]) {
      headers["x-session"] = this.util.session;
    }
    headers["Content-Type"] = "application/json";
    headers["Accept"] = "application/json";
    let requestOptions = Object.assign({}, options);
    requestOptions.headers = headers;
    requestOptions.url = url;
    requestOptions.xhr = true;
    return {url, requestOptions};
  }
}

module.exports = Request;
