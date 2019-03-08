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
    if(context instanceof Collection){
      this._collection(context, options);
    } else {
      this._model(context, options);
    }
  }

  _model(model, options = {}) {
    let savedResponse;
    let responseFired = false;
    return this._sendRequest(model, options)
      .then((response) => {
        if (!response.ok) {
          throw response;
        }
        savedResponse = response;
        return response.json();
      })
      .then((jsonResponse) => {
        responseFired = true;
        if (options.parse !== false) {
          let data = model.parse(jsonResponse);
          model.set(data, options);
        }
        savedResponse.responseJSON = jsonResponse;
        this._fireResponse("success", model, [model, jsonResponse, savedResponse], options);
      })
      .catch((response) => {
        if (responseFired) {
          Util.throw(response);
        }
        responseFired = true;
        if (response.text) {
          response.text().then((text) => {
            response.responseText = text;
            try {
              response.responseJSON = JSON.parse(text);
            } catch (error) {

            }
            this._fireResponse("error", model, [model, response], options);
          }).catch(() => {
            this._fireResponse("error", model, [model, response], options);
          });
        } else {
          this._fireResponse("error", model, [model, response], options);
        }
      });
  }

  _collection(collection, options = {}) {
    let savedResponse;
    let responseFired = false;
    return this._sendRequest(collection, options)
      .then((response) => {
        if (!response.ok) {
          throw response;
        }
        savedResponse = response;
        return response.json();
      })
      .then((jsonResponse) => {
        responseFired = true;
        let data = collection.parse(jsonResponse);
        collection.add(data);
        savedResponse.responseJSON = jsonResponse;
        this._fireResponse("success", collection, [collection, jsonResponse, savedResponse], options);
      })
      .catch((response) => {
        if (responseFired) {
          Util.throw(response);
        }
        responseFired = true;
        if (response.text) {
          response.text().then((text) => {
            response.responseText = text;
            try {
              response.responseJSON = JSON.parse(text);
            } catch (error) {

            }
            this._fireResponse("error", collection, [collection, response], options);
          }).catch(() => {
            this._fireResponse("error", collection, [collection, response], options);
          });
        } else {
          this._fireResponse("error", collection, [collection, response], options);
        }
      });
  }

  _sendRequest(context, options = {}) {
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
    options.xhr = true;
    return fetch(url, requestOptions);
  }

  _fireResponse(type, context, args, options) {
    if (options[type]) {
      options[type].apply(context, args);
    }
    if (options.complete) {
      options.complete.call(context, context);
    }
  }
}

module.exports = Request;
