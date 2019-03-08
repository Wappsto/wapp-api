const fetch = require('node-fetch');
const Util = require('../util');
const EventEmitter = require('events');
let Request;
let Generic;

const _collections = Symbol.for("generic-class-collections");
const _parent = Symbol.for("generic-collection-parent");
const _util = Symbol.for("generic-util");
const _class = "defaultModel";
const _className = Symbol.for("generic-collection-className");
const _relations = "_relations";
const _requestInstance = "_requestInstance";

class Collection extends EventEmitter {
    constructor(data, request) {
        super();

        // Handle recursive require
        if (!Generic) {
            Generic = require('./generic-class');
        }

        if(!Request){
            Request = require('./request');
        }

        if(request instanceof Request){
            this[_requestInstance] = request
        } else {
            this[_requestInstance] = new Request(request);
        }
        this.models = [];

        this.add = this.push;
        this.where = this.filter;
        this.findWhere = this.find;
        this.forEach = this.each;

        if(typeof(data) === "object"){
            let parsedData = this.parse(data);
            this.add(parsedData);
        }

        this._onModelDestroy = this._onModelDestroy.bind(this);
    }

    _propagateEventDown(event){
        this.forEach((model) => {
            model.emit(event, model);
        });
    }

    map() {
        return this.models.map.apply(this.models, arguments);
    }

    each() {
        return this.models.forEach.apply(this.models, arguments);
    }

    push(data, options = {}) {
        if (!Array.isArray(data)) {
            data = [data];
        }
        data.forEach((element, index) => {
            if(this.models.includes(element)){
                return;
            }
            let found = this.find(element, options);
            if (found) {
                if(found instanceof Generic){
                    found.set(element, options);
                } else {
                    Object.assign(found, element);
                }
            } else if (element instanceof Generic) {
                // Maybe check if it is there
                element[_collections].push(this);
                this._pushToModels(element, options);
            } else if (this[_class]) {
                let newInstance = new this[_class](element, this[_requestInstance]);
                newInstance[_collections].push(this);
                this._pushToModels(newInstance, options);
            } else {
                element[_collections] = [this];
                this._pushToModels(element, options);
            }
        });

        return this;
    }

    _getLookElement(element){
        let lookElement = Object.assign({}, element);
        delete lookElement.meta;
        delete lookElement.status;

        // deleting relations key
        if(this[_class] && this[_class][_relations]){
            this[_class][_relations].forEach(({ key, type, relatedClass }) => {
                delete lookElement[key];
            });
        }
        return lookElement;
    }

    _pushToModels(element, options) {
        this.models.push(element);
        this.emit("add", this, element, options);
        element.on("destroy", this._onModelDestroy);
    }

    _onModelDestroy(model, options){
        this.remove(model, options);
        model.removeListener("destroy", this._onModelDestroy, options);
    }

    remove(obj, options) {
        //remove this reference from obj[_collection]
        let colIndex = obj[_collections].findIndex((element) => {
            return element == this;
        });
        if (colIndex != -1) {
            obj[_collections].splice(colIndex, 1);
        }

        //remove obj from this array
        let index = this.models.findIndex((element) => {
            return element == obj;
        });
        if (index != -1) {
            let result = this.models.splice(index, 1);
            this.emit("remove", result, options);
            if(result instanceof Generic){
                result.removeListener("destroy", this._onModelDestroy);
            }
            return result;
        }
        return undefined;
    }

    toJSON(options) {
        let json = [];
        this.models.forEach(function(model) {
            json.push(model.toJSON(options));
        });
        return json;
    }

    _matchObject(obj1, obj2, options = {}) {
        for (const key in obj2) {
            if(obj1.hasOwnProperty(key)){
                let left = obj1[key];
                let right = obj2[key];
                if (left && right && left.constructor !== right.constructor) {
                    return false;
                } else if (typeof(left) === "object") {
                    if (!this._matchObject(left, right)) {
                        return false;
                    }
                } else if (left !== right) {
                    return false;
                }
            } else if(!options.create){
                return false;
            }
        }
        return true;
    }

    match(instance, obj2, options) {
        let obj1;
        if(instance instanceof Generic){
            obj1 = instance.toJSON({
                full: true
            });
        } else {
            obj1 = instance;
        }
        return this._matchObject(obj1, obj2, options);
    }

    findIndex(obj) {
        return this.models.findIndex((element) => {
            return this.match(element, obj);
        });
    }

    find(obj, options = {}) {
        return this.models.find((element) => {
            let lookElement;
            if(options.xhr && ((element instanceof Generic && !element.get("meta.id")) || !element.meta || !element.meta.id)){
                options.create = true;
                lookElement = this._getLookElement(obj);
            } else {
                options.create = false;
                lookElement = obj;
            }
            return this.match(element, lookElement, options);
        });
    }

    filter(obj) {
        return this.models.filter((element) => {
            return this.match(element, obj);
        });
    }

    first() {
        return this.models[0];
    }

    last() {
        return this.models[this.models.length - 1];
    }

    parse(data) {
        if (!Array.isArray(data)) {
            if(data.hasOwnProperty("id")){
                data = data.id;
            } else {
                return [];
            }
        }
        data.forEach((element, index) => {
            if (typeof(element) === "string") {
                data[index] = {
                    meta: { id: element}
                };
            }
        });
        return data;
    }

    _request(options){
      this[_requestInstance].send(this, options);
    }

    fetch(options = {}) {
        options.method = "GET";
        return this._request(options);
    }

    parent() {
        return this[_parent];
    }

    at(index){
        return this.models[index];
    }

    url() {
        let url = this.parent() ? this.parent().url() : this.util.baseUrl;
        if(!this[_className] && this[_class]){
            let instance = new this[_class];
            this[_className] = instance.constructor.name.charAt(0).toLowerCase() + instance.constructor.name.slice(1)
        }
        if (this[_className]) {
            url += "/" + this[_className];
        }
        return url;
    }

    get util(){
        return this[_requestInstance][_util];
    }

    get length() {
        return this.models.length;
    }

    get(data){
        if (typeof(data) !== "string") {
            console.error("get: expected string argument but got " + data + " instead");
            return;
        }

        // handle nested get
        let dataArr = data.split(".");
        let val = this.models;
        for (let i = 0; i < dataArr.length && val; i++) {
            let currentAttr = dataArr[i];
            if(Util.isUUID(currentAttr)){
                val = this.findWhere({meta: {id: currentAttr}});
            } else{
                if (val instanceof Generic || val instanceof Collection) {
                    // return val.get(dataArr.slice(i, dataArr.length).join("."));
                    val = val.get(currentAttr);
                } else if (val instanceof Object) {
                    val = val[currentAttr];
                } else {
                    val = undefined;
                }
            }
        }
        return val;
    }
}

module.exports = Collection;
