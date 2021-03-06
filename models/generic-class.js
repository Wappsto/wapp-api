const Util = require('../util');
const EventEmitter = require('events');
const Collection = require('./generic-collection');
const Request = require('./request');

const _pickAttributes = Symbol.for("generic-class-pickAttributes");
const _collections = Symbol.for("generic-class-collections");
const _name = Symbol.for("generic-class-name");
const _parent = Symbol.for("generic-collection-parent");
const _util = Symbol.for("generic-util");
const _class = "defaultModel";
const _relations = "_relations";
const _defaults = "_defaults";
const _requestInstance = "_requestInstance";

class Generic extends EventEmitter {

    constructor(attributes = {}, request) {
        super();
        if(request instanceof Request){
          this[_requestInstance] = request
        } else {
          this[_requestInstance] = new Request(request);
        }

        // Initializing attributes
        this.attributes = {};
        if(!attributes.hasOwnProperty("meta")){
            this.attributes.meta = {
                version: this.util.version
            }
        }

        // Setting class name
        this[_name] = this.constructor.name.charAt(0).toLowerCase() + this.constructor.name.slice(1);

        // Setting Class data
        this[_pickAttributes] = {};
        this[_collections] = [];


        // Setting relations
        if (this.constructor[_relations]) {
            this.constructor[_relations].forEach(this._createRelationCollection.bind(this));
        }

        // Merging attributes with defaults
        for (let key in this.constructor[_defaults]) {
            if (!attributes.hasOwnProperty(key)) {
                attributes[key] = this.constructor[_defaults][key];
            }
        }
        this.set(attributes);

        // Propagate destroy event
        if (this.constructor[_relations]) {
            this._propagateEventDown = this._propagateEventDown.bind(this);
            this.on("destroy", this._propagateEventDown);
        }

        this._addResponseHandler();
    }

    _propagateEventDown(){
        this.constructor[_relations].forEach(({ key, type, relatedClass }) => {
            if(this.get(key)){
                if (type === Util.type.One) {
                    this.get(key).emit("destroy", this.get(key));
                } else if (type === Util.type.Many) {
                    this.get(key)._propagateEventDown("destroy");
                }
            }
        });
        this.removeListener("destroy", this._propagateEventDown);
    }

    get util(){
        return this[_requestInstance][_util];
    }

    _createRelationCollection({
        key,
        type,
        relatedClass
    }) {
        if (type === Util.type.One) {
            this.attributes[key] = new relatedClass({}, this[_requestInstance]);
        } else if (type === Util.type.Many) {
            let col = new Collection(undefined, this[_requestInstance]);
            col[_parent] = this;
            col[_class] = relatedClass;
            this.attributes[key] = col;
        } else {
            throw `unsupported relation type '${type}' in Class ${this.constructor.name}`;
        }
    }

    get(data) {
        if (typeof(data) !== "string") {
            console.error("get: expected string argument but got " + data + " instead");
            return;
        }
        if (this.attributes.hasOwnProperty(data)) {
            return this.attributes[data];
        }
        // handle nested get
        let dataArr = data.split(".");
        if (dataArr.length > 1) {
            let val = this.attributes;
            for (let i = 0; i < dataArr.length && val; i++) {
                let currentAttr = dataArr[i];
                if (val instanceof Generic || val instanceof Collection) {
                    // return val.get(dataArr.slice(i, dataArr.length).join("."));
                    val = val.get(currentAttr);
                } else if (val instanceof Object) {
                    val = val[currentAttr];
                } else {
                    val = undefined;
                }
            }
            return val;
        }
        return undefined;
    }

    set(data, value, options) {
        if (Object.prototype.toString.call(data) == "[object Object]") {
            options = value;
            if(options && (options.method === "PUT" || options.merge === false)){
              this._removeOldAttributes();
            }
            let events = [];
            let oldValue = Object.assign({}, this.attributes);
            for (let key in data) {
                let event;
                if (this.constructor[_relations]) {
                    // Looking for key in relations
                    let relation = this.constructor[_relations].find((element) => {
                        return element["key"] === key;
                    });
                    if (relation) {
                        if(this.get(key)){
                            if (relation.type === Util.type.One) {
                                this.get(key).set(data[key]);
                            } else if (relation.type === Util.type.Many) {
                                this.get(key).push(data[key], options);
                            }
                        }
                    } else {
                        event = this._set(key, data[key], options);
                    }
                } else {
                    event = this._set(key, data[key], options);
                }
                if(event){
                  events.push(event);
                }
            }
            let newValue = Object.assign({}, this.attributes);
            this._emitEvents(events, options);
            this.emit("change", this, newValue, oldValue, null, options);
        } else {
            let event = this._set(data, value, options);
            if(event){
              this._emitEvents([event], options);
              this.emit("change", this, event.newValue, event.oldValue, event.key, options);
            }
        }
    }

    _removeOldAttributes(){
      let version = this.attributes.meta && this.attributes.meta.version;
      let attributes = (this.constructor[_pickAttributes] && this.constructor[_pickAttributes][version]) || Object.keys(this.attributes);
      attributes.forEach(attr => {
        if (this.constructor[_relations]) {
            let found = this.constructor[_relations].find(({ key }) => key === attr);
            if(!found) {
              delete this.attributes[attr];
            }
        } else {
          delete this.attributes[attr];
        }
      });
    }

    _set(key, value, options) {
        if (this.attributes[key] !== value) {
            let oldValue = this.attributes[key]
            this.attributes[key] = value;
            return {
              key: key,
              oldValue: oldValue,
              newValue: value
            }
        }
        return null;
    }

    _emitEvents(events, options){
      events.forEach((e) => {
        if(e){
          this.emit("change:" + e.key, this, e.newValue, e.oldValue, e.key, options);
        }
      });
    }

    // Called whenever a RESTful call is success(POST/PUT/PATCH)
    parse(data) {
        return data;
    }

    toJSON(options = {}) {
        let json = {};
        let attributes;
        let version = this.attributes.meta && this.attributes.meta.version;
        if (options.full == true && version) {
            attributes = ((this.constructor[_pickAttributes] && this.constructor[_pickAttributes][version]) || []).concat(Object.keys(this.attributes));
        } else if (version) {
            attributes = (this.constructor[_pickAttributes] && this.constructor[_pickAttributes][version]) || Object.keys(this.attributes);
        } else {
            attributes = Object.keys(this.attributes);
        }
        attributes.forEach((attr) => {
          if(this.attributes.hasOwnProperty(attr)){
            let val = this.get(attr);
            if (val instanceof Generic || val instanceof Collection) {
                json[attr] = val.toJSON(options);
            } else {
                json[attr] = val;
            }
          }
        });
        return json;
    }

    _addResponseHandler(){
      this.on("handle:response", (response, options) => {
        this._parseData(response, options);
        this.emit("response:handled", this, response.data, response);
      });
    }

    _parseData(response, options){
      if (options.parse !== false) {
        let data = this.parse(response.data);
        this.set(data, options);
      }
    }

    _request(options){
      let responseFired = false;
      options.xhr = true;
      return this[_requestInstance].send(this, options)
      .then((response) => {
        responseFired = true;
        this._parseData(response, options);
        response.responseJSON = response.data;
        this._fireResponse("success", this, [this, response.data, response], options);
        return this;
      })
      .catch((response) => {
        if (responseFired) {
          Util.throw(response);
        }
        responseFired = true;
        response.responseJSON = response.response.data;
        if(!options.error || options.error.constructor !== Function){
          throw response;
        }
        this._fireResponse("error", this, [this, response], options);
      });
    }

    _fireResponse(type, context, args, options) {
      if (options[type]) {
        options[type].apply(context, args);
      }
      if (options.complete) {
        options.complete.call(context, context);
      }
    }

    fetch(options = {}) {
        if(!this.get("meta.id")){
          return false;
        }
        let requestOptions = Object.assign({}, options);
        requestOptions.method = "GET";
        return this._request(requestOptions);
    }

    save(data, options = {}) {
        let requestOptions = Object.assign({}, options);
        if (requestOptions.patch == true) {
            requestOptions.method = "PATCH";
            requestOptions.data = JSON.stringify(data);
        } else {
            if (this.get("meta.id")) {
                requestOptions.method = "PUT";
            } else {
                requestOptions.method = "POST";
                requestOptions.create = true;
            }
            if(requestOptions.merge !== false){
              data = Object.assign({}, this.toJSON(requestOptions), data);
            }
            requestOptions.data = JSON.stringify(data);
        }
        return this._request(requestOptions);
    }

    destroy(options = {}) {
        if(!this.get("meta.id")){
          return false;
        }
        let requestOptions = Object.assign({}, options);
        requestOptions.success = (self, jsonResponse, response) => {
            if(success){
              success.call(this, this, jsonResponse, response);
            }
            this[_collections].forEach((col) => {
                col.remove(this);
            });
            this.emit("destroy", this);
        }
        requestOptions.method = "DELETE";
        return this._request(requestOptions);
    }

    parent() {
        let collection, parent, self = this;
        if(collection = this[_collections][0]){
            if(parent = collection.parent()){
                return parent;
            }
        }
        return {
            url: function(){
                return self.util.baseUrl;
            }
        };
    }

    url(options = {}) {
        if (this.get("meta.id")) {
            return this.util.getServiceUrl(this[_name], options) + '/' + this.get("meta").id;
        } else {
            return this.util.getServiceUrl(this[_name], options);
        }
    }
}

module.exports = Generic;
