const WebSocket = require('./stream-polyfill');
const Stream = require('../models/stream');
const Util = require('../util');
const Tracer = require('../tracer');
const EventEmitter = require('events');
const Model = require('../models/generic-class');
const Collection = require('../models/generic-collection');

const _stream = Symbol("stream");
const _source = Symbol("source");
const _oldSource = Symbol("oldSource");
const _util = Symbol.for("generic-util");
const _relations = "_relations";

class WappstoStream extends EventEmitter {
    constructor(stream) {
        super();
        this.models = {};
        this.close = this.close.bind(this);
        this.on('error', () => {});
        if (stream instanceof Stream) {
            this[_stream] = stream;
            stream.on("destoy", this.close);
        }
    }

    get stream() {
        return this[_stream];
    }

    open() {
        if (this.stream && this.stream.get("meta.id") && WebSocket) {
            let url = this.stream.url() + '?x-session=' + this.stream[_util].session;
            if (!url.startsWith("http") && window && window.location && window.location.origin) {
                url = window.location.origin + url;
            }
            let ws = new WebSocket(url.replace(/^http/, 'ws'));
            this._addEventListeners(ws);
            this[_source] = ws;
        } else {
            console.error("cannot connect, stream model not found");
        }
    }

    close() {
        if (this[_source]) {
            this[_source].ignoreReconnect = true;
            this[_source].close();
        }
    }

    _reconnect() {
        if (this[_source]) {
            if (this[_oldSource] && !this[_source].ignoreReconnect) {
                this[_source].ignoreReconnect = true;
                this[_source].close();
            } else {
                this[_oldSource] = this[_source];
            }
            this.open();
        }
    }

    _addEventListeners(source) {
        let self = this,
            url = self.stream.url().replace(/^http/, 'ws');

        let timeout = setTimeout(() => {
            source.ignoreReconnect = true;
            source.close();
            self._reconnect();
        }, 5000);

        let reconnect = () => {
            if (!source.ignoreReconnect) {
                source.ignoreReconnect = true;
                setTimeout(function() {
                    self._reconnect();
                }, 5000);
            }
        }

        source.addEventListener('message', function(e) {
            let message;
            try {
                message = JSON.parse(e.data);
            } catch (e) {
                self.emit('message', e);
                return;
            }
            self.emit('message', e);
            message.forEach((msg) => {
                if(msg.meta_object.type === 'extsync' && msg.extsync.uri === 'extsync/wappsto/editor/console'){
                    return;
                }
                let traceId = self._checkAndSendTrace(msg);
                self._handleMessage(msg, traceId);
            });
        }, false);

        source.addEventListener('open', function(e) {
            // Connection was opened.
            console.log('stream open: ' + url);
            clearTimeout(timeout);
            self.emit('open', e);
            // disconnect from old source
            if (self[_oldSource]) {
                self[_oldSource].ignoreReconnect = true;
                self[_oldSource].close();
                self[_oldSource] = null;
            }
        }, false);

        source.addEventListener('error', function(e) {
            try {
              self.emit('error', e);
            } catch (e) {
              self.emit('error');
            }
            console.log('stream error: ' + url);
        }, false);

        source.addEventListener('close', function(e) {
            console.log('stream closed: ' + url);
            self.emit('close', e);
            reconnect();
        }, false);
    }

    _checkAndSendTrace(message) {
        if (message.hasOwnProperty('meta') && message.meta.hasOwnProperty('trace')) {
            return Tracer.sendTrace(message.meta.trace, null, null, {
                'stream_id': message.meta.id
            });
        }
    }

    _handleMessage(message, traceId) {
        let id, model, options, event = message.event;
        if (traceId) {
            options = {
                trace: traceId
            };
        }
        switch (event) {
            case "create":
                if (message.meta_object.type === "notification") {
                    this._handleNotification(message.notification, options);
                } else {
                    if(!this._updateModel(message, options)){
                        id = message.path.split("/");
                        let last = id[id.length - 1];
                        id = (Util.isUUID(last) || !last) ? id[id.length - 3] : id[id.length - 2];
                        model = this.models[id];
                        if (model) {
                            let type = message.meta_object.type;
                            let newModel = model.get(type).add(message[type], options);
                            this.addModel(newModel);
                        }
                    }
                }
                break;
            case "update":
                this._updateModel(message, options);
                break;
            case "delete":
                id = message.meta_object.id;
                model = this.models[id];
                if (model) {
                    model.emit("destroy", options);
                    this.removeModel(model);
                }
                break;

        }
    }

    _updateModel(message, options) {
        let id = message.meta_object.id;
        let model = this.models[id];
        if (model) {
            model.emit("stream:message", model, message[message.meta_object.type], message);
            model.set(message[message.meta_object.type], options);
            return true;
        }
        return false;
    }

    _handleNotification(notification, options) {
        switch (notification.base.code) {
            case 1100004:
                this.emit("permission:added", notification.base.type_ids, notification.base.ids, options);
                break;
            case 1100013:
                this.emit("permission:updated", notification.base.type_ids, notification.base.ids, options);
                break;
            case 1100006:
                this.emit("permission:removed", notification.base.type_ids, notification.base.ids, options);
                break;
            case 1100007:
                this.emit("permission:revoked", notification.base.type_ids, notification.base.ids, options);
                break;

        }
    }

    subscribe(arr, options = {}) {
        if (!this.stream) {
            console.error("stream model is not found, cannot update subscriptions");
            return;
        }
        if(arr.constructor !== Array && !(arr.constructor.prototype instanceof Collection)){
            arr = [arr];
        }
        let subscriptions = [];
        let models = [];
        arr.forEach((obj) => {
            let { path, isModel } = this._getPath(obj);
            if(path){
                subscriptions.push(path);
                if(isModel){
                    models.push(obj);
                }
            }
        });
        if(subscriptions.length === 0) return;
        let requestOptions = Object.assign({}, options);
        requestOptions.success = () => {
            models.forEach((obj) => this.addModel(obj));
            if (options.success) {
                options.success.apply(this, arguments);
            }
        }
        return this._updateSubscriptions([...this.stream.get("subscription"), ...subscriptions], requestOptions);
    }

    unsubscribe(arr, options) {
        if (!this.stream) {
            console.error("stream model is not found, cannot update subscriptions");
            return;
        }
        if(arr.constructor !== Array && !(arr.constructor.prototype instanceof Collection)){
            arr = [arr];
        }
        let update = false;
        let subscriptions = [...this.stream.get("subscription")];
        arr.forEach((obj) => {
            let { path, isModel } = this._getPath(obj);
            if(path){
                let index = subscriptions.indexOf(path);
                if (isModel) {
                    this.removeModel(obj);
                }
                if (index !== -1) {
                    subscriptions.splice(index, 1);
                    update = true;
                }
            }
        });
        if(update){
            return this._updateSubscriptions(subscriptions, options);
        } else if(options.success){
            options.success.call(this.stream, this.stream, this.stream.toJSON(), {});
        }
    }

    _getModelUrl(model) {
        return model.url({
            full: false
        }).replace(model.util.baseUrl, "");
    }

    addModel(model) {
        this._forAllModels(model, this._addModelToCache.bind(this));
    }

    removeModel(model) {
        this._forAllModels(model, this._removeModelFromCache.bind(this));
    }

    _forAllModels(model, func) {
        let arr = [model];
        while (arr.length != 0) {
            let temp = [];
            arr.forEach((m) => {
                func(m);
                if (m.constructor[_relations]) {
                    m.constructor[_relations].forEach(({
                        key,
                        type,
                        relatedClass
                    }) => {
                        if (type === Util.type.One) {
                            func(m.get(key));
                        } else if (type === Util.type.Many) {
                            temp = [...temp, ...m.get(key).models];
                        }
                    });
                }
            });
            arr = temp;
        }
    }

    _addModelToCache(model) {
        let id = model.get("meta.id");
        if (!this.models.hasOwnProperty(id)) {
            this.models[id] = model;
        }
    }

    _removeModelFromCache(model) {
        delete this.models[model.get("meta.id")];
    }

    _updateSubscriptions(subscription, options) {
        this.stream.set("subscription", subscription);
        return this.stream.save({
            subscription,
            full: true
        }, {
            wait: true,
            patch: true,
            success: options.success,
            error: options.error,
            complete: options.complete
        });
    }

    _getPath(obj) {
        let isObject = obj instanceof Object;
        let isString = typeof(obj) === "string";
        if (!isObject && !isString) {
            console.error("argument must be a string, an object or a class");
            return {
                path: undefined,
                isModel: false,
                isString: false
            };
        }
        let path;
        let isModel = obj.constructor.prototype instanceof Model;
        if (isModel) {
            path = this._getModelUrl(obj);
        } else if (isObject) {
            path = obj.meta && obj.meta.id && obj.meta.type && "/" + obj.meta.type + "/" + obj.meta.id;
        } else {
            path = obj;
        }
        return {
            path,
            isModel,
            isString
        };
    }
}

module.exports = WappstoStream;