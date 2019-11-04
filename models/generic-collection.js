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
        this._addResponseHandler();
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
        let results = [];
        let isArray = true;
        if (!Array.isArray(data)) {
            data = [data];
            isArray = false;
        }
        data.forEach((element, index) => {
            let id, lookFor;
            if(element.constructor === Object){
              if(this.models.includes(element)){
                  results.push(element);
                  return;
              }
              id = element.meta && element.meta.id
            } else if(element.constructor === String){
              element = {
                meta: {
                  id: element
                }
              };
              id = element;
            } else if(element.constructor === Array){
              return;
            } else {
              id = element.get("meta.id");
            }
            if(id){
              lookFor = { meta: { id: id }};
            } else {
              lookFor = element
            }
            let found = this.find(lookFor, options);
            if (found) {
                if(found instanceof Generic){
                    found.set(element, options);
                } else {
                    Object.assign(found, element);
                }
                results.push(found);
            } else if (this[_class] && !(element instanceof Generic)) {
                let newInstance = new this[_class](element, this[_requestInstance]);
                newInstance[_collections].push(this);
                this._pushToModels(newInstance, options);
                results.push(newInstance);
            } else {
                if(!element[_collections]){
                  element[_collections] = [];
                }
                element[_collections].push(this);
                this._pushToModels(element, options);
                results.push(element);
            }
        });

        return isArray ? results : results[0];
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
            let result = this.models.splice(index, 1)[0];
            this.emit("remove", this, result, options);
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
            if(options.xhr && (
              (element instanceof Generic && !element.get("meta.id")) ||
              (!(element instanceof Generic ) && (!element.meta || !element.meta.id))
            )){
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

    _addResponseHandler(){
      this.on("handle:response", (response, options) => {
        this._parseData(response, options);
        this.emit("response:handled", this, response.data, response);
      });
    }

    _parseData(response, options){
      if (options.parse !== false) {
        let data = this.parse(response.data);
        this.add(data);
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
      if (options[type] && options[type].constructor === Function) {
        options[type].apply(context, args);
      }
      if (options.complete) {
        options.complete.call(context, context);
      }
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

    url(options) {
        if(!this[_className] && this[_class]){
            let instance = new this[_class];
            this[_className] = instance.constructor.name.charAt(0).toLowerCase() + instance.constructor.name.slice(1)
        }

        let url = '';
        if(this.parent()){
          url = this.parent.url(options);
          if (this[_className]) {
              url += "/" + this[_className];
          }
        } else if(this[_className]){
          url = this.util.getServiceUrl(this[_className], options);
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

    reset(options){
      let result = [];
      for(let i = 0; i < this.models.length; i++){
        let model = this.models[i];
        let removed = this.remove(model, options);
        if(removed){
          result.push(removed);
          i--;
        }
      }
      return result;
    }
}

module.exports = Collection;
