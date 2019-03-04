const fetch = require('node-fetch');
const Util = require('../util');
const EventEmitter = require('events');
const Collection = require('./generic-collection');

const _pickAttributes = Symbol.for("generic-class-pickAttributes");
const _collections = Symbol.for("generic-class-collections");
const _name = Symbol("generic-class-name");
const _parent = Symbol.for("generic-collection-parent");
const _util = Symbol.for("generic-util");
const _class = "defaultModel";
const _relations = "_relations";
const _defaults = "_defaults";

class Generic extends EventEmitter {

    constructor(attributes = {}, util) {
        super();
        this[_util] = util || this.constructor[_util] || Util.extend({});

        // Initializing attributes
        this.attributes = {};
        if(!attributes.hasOwnProperty("meta")){
            this.attributes.meta = {
                version: this[_util].version
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

    }

    _propagateEventDown(){
        this.constructor[_relations].forEach(({ key, type, relatedClass }) => {
            if (type === Util.type.One) {
                this.get(key).emit("destroy", this.get(key));
            } else if (type === Util.type.Many) {
                this.get(key)._propagateEventDown("destroy");
            }
        });
        this.removeListener("destroy", this._propagateEventDown);
    }

    get util(){
        return this[_util];
    }

    _createRelationCollection({
        key,
        type,
        relatedClass
    }) {
        if (type === Util.type.One) {
            this.attributes[key] = new relatedClass({}, this[_util]);
        } else if (type === Util.type.Many) {
            let col = new Collection(undefined, this[_util]);
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
            for (let key in data) {
                if (this.constructor[_relations]) {
                    // Looking for key in relations
                    let relation = this.constructor[_relations].find((element) => {
                        return element["key"] === key;
                    });
                    if (relation) {
                        if (relation.type === Util.type.One) {
                            this.get(key).set(data[key]);
                        } else if (relation.type === Util.type.Many) {
                            this.get(key).push(data[key], value);
                        }
                    } else {
                        this._set(key, data[key], value);
                    }
                } else {
                    this._set(key, data[key], value);
                }
            }
        } else {
            this._set(data, value, options);
        }
    }

    _set(key, value, options) {
        if (this.attributes[key] !== value) {
            let oldValue = this.attributes[key]
            this.attributes[key] = value;
            this.emit("change:" + key, this, value, oldValue, key, options);
            this.emit("change", this, value, oldValue, key, options);
        }
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
            if (this.get(attr) instanceof Generic || this.get(attr) instanceof Collection) {
                json[attr] = this.get(attr).toJSON(options);
            } else {
                json[attr] = this.get(attr);
            }
        });
        return json;
    }

    _request(options = {}) {
        let url = (options.url || this.url());
        if (options.query) {
          if(url.indexOf("?") === -1){
            url += "?" + options.query;
          } else {
            url += "&" + options.query;
          }
        }
        let headers = options["headers"] || {}
        if (this[_util].session && !headers["x-session"]) {
            headers["x-session"] = this[_util].session;
        }
        headers["Content-Type"] = "application/json";
        headers["Accept"] = "application/json";
        let requestOptions = Object.assign({}, options);
        requestOptions.headers = headers;
        requestOptions.url = url;
        let responseFired = false;
        let fireResponse = function(type, context, args, options) {
            responseFired = true;
            if (options[type]) {
                options[type].apply(context, args);
            }
            if (options.complete) {
                options.complete.call(context, context);
            }
        };
        options.xhr = true;
        let savedResponse;
        fetch(url, requestOptions)
            .then((response) => {
                if (!response.ok) {
                    throw response;
                }
                savedResponse = response;
                return response.json();
            })
            .then((jsonResponse) => {
                if (options.parse !== false) {
                    let data = this.parse(jsonResponse);
                    this.set(data, options);
                }
                savedResponse.responseJSON = jsonResponse;
                fireResponse("success", this, [this, jsonResponse, savedResponse], options);
            })
            .catch((response) => {
                if(responseFired){
                    Util.throw(response);
                }
                if (response.text) {
                    response.text().then((text) => {
                        response.responseText = text;
                        try {
                            response.responseJSON = JSON.parse(text);
                        } catch (error) {

                        }
                        fireResponse("error", this, [this, response], options);
                    }).catch(() => {
                        fireResponse("error", this, [this, response], options);
                    });
                } else {
                    fireResponse("error", this, [this, response], options);
                }
            });
    }

    fetch(options = {}) {
        options.method = "GET";
        return this._request(options);
    }

    save(data, options = {}) {
        if (options.patch == true) {
            options.method = "PATCH";
            options.body = JSON.stringify(data);
        } else {
            if (this.get("meta.id")) {
                options.method = "PUT";
            } else {
                options.method = "POST";
                options.create = true;
            }
            options.body = JSON.stringify({
                ...this.toJSON(options),
                ...data
            });
        }
        return this._request(options);
    }

    destroy(options = {}) {
        let success = options.success;
        options.success = (jsonResponse) => {
            success.call(this, this, jsonResponse);
            this[_collections].forEach((col) => {
                col.remove(this);
            });
            this.emit("destroy", this);
        }
        options.method = "DELETE";
        return this._request(options);
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
                return self[_util].baseUrl;
            }
        };
    }

    url(options = {}) {
        let startUrl = (options.full !== false && this.parent()) ? this.parent().url() : this[_util].baseUrl;
        if (this.get("meta.id")) {
            return startUrl + '/' + this[_name] + '/' + this.get("meta").id;
        } else {
            return startUrl + '/' + this[_name];
        }
    }
}

module.exports = Generic;
