const WebSocket = require('./stream-polyfill');
const Stream = require('../models/stream');
const Util = require('../util');
const Tracer = require('../tracer');
const EventEmitter = require('events');
const Model = require('../models/generic-class');
const Collection = require('../models/generic-collection');
const querystring = require('querystring');

const _stream = Symbol('stream');
const _source = Symbol('source');
const _util = Symbol.for('generic-util');
const _relations = '_relations';
const _name = Symbol.for('generic-class-name');
const _oldSocket = Symbol('oldSocket');

class WappstoStream extends EventEmitter {
    constructor(stream) {
        super();
        this.models = {};
        this.nextStream = false;
        this.nextStreamPromises = [];
        this.updating = false;
        this.close = this.close.bind(this);
        this._collectionAddCallback = this._collectionAddCallback.bind(this);
        this._collectionRemoveCallback = this._collectionRemoveCallback.bind(this);
        this.on('error', () => {});
        if (stream instanceof Stream) {
            this[_stream] = stream;
            stream.on('destoy', this.close);
        }
    }

    get stream() {
        return this[_stream];
    }

    get socket() {
        return this[_source];
    }

    open(options) {
        if (WebSocket && this.stream) {
            const customOptions = Object.assign({}, options);
            let url = this.stream.url(customOptions);
            if (!url.startsWith('http') && window && window.location && window.location.origin) {
                url = window.location.origin + url;
            }
            url = url.replace(/^http/, 'ws');
            if(customOptions.endPoint){
                url = url.replace('stream', customOptions.endPoint);
            } else if(this.stream.util.getServiceVersion('stream')){
                url = url.replace('stream', 'websocket');
            }
            if(!this.stream.get('meta.id')){
                const streamClone = this.stream.toJSON();
                delete streamClone.meta;
                delete streamClone.name;
                url += '/open?' + querystring.stringify(streamClone) + '&';
            } else {
                url += '?';
            }
            url += 'x-session=' + this.stream.util.session;
            let ws = new WebSocket(url);
            this._addEventListeners(ws);
            this[_source] = ws;
        } else {
            console.error('cannot connect, stream model not found');
        }
    }

    close() {
        if (this[_source]) {
            this[_source].ignoreReconnect = true;
            this[_source].close();
            this[_source] = null;
        }
    }

    _reconnect(keep) {
        this.close();
        this.open();
    }

    _addEventListeners(source) {
        let self = this,
            url = source.url;

        let openTimeout = setTimeout(() => {
            self._reconnect();
        }, 5000);

        let pingTiemout;
        let refreshPingTimer = function(){
            clearTimeout(pingTiemout);
            pingTiemout = setTimeout(() => {
              console.log('connection lost, trying to reconnect to: ' + url);
              self._reconnect();
            }, 40000);
        }

        let reconnect = () => {
            setTimeout(function() {
                self._reconnect();
            }, 5000);
        }

        source.addEventListener('message', function(e) {
            let message;
            try {
                message = JSON.parse(e.data);
            } catch (e) {
                self.emit('message', e);
                return;
            }
            if(message.constructor !== Array){
              message = [message];
            }
            self.emit('message', e);
            message.forEach((msg) => {
                if(msg.meta_object.type === 'extsync'){
                    const newData = msg.extsync || msg.data;
                    if(newData.uri !== 'extsync/wappsto/editor/console'){
                        self.emit('extsync', newData);
                    }
                    return;
                }
                if(msg.meta_object.type === 'extsync_request'){
                    const newData = msg.extsync_request || msg.data;
                    self.emit('extsync_request', newData);
                    return;
                }
                let traceId = self._checkAndSendTrace(msg);
                self._handleMessage(msg, traceId);
            });
        }, false);

        source.addEventListener('open', function(e) {
            // Connection was opened.
            clearTimeout(openTimeout);
            console.log('stream open: ' + url);
            self.emit('open', e);

            if(!(typeof window === 'object') || !(window.document && window.WebSocket)){
                // Add ping timeout
                refreshPingTimer();
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
            clearTimeout(openTimeout);
            clearTimeout(pingTiemout);
            self.emit('close', e);
            if(!source.ignoreReconnect){
                reconnect();
            }
        }, false);

        source.addEventListener('ping', function(e) {
            refreshPingTimer();
        });
    }

    _checkAndSendTrace(message) {
        if (message.hasOwnProperty('meta') && message.meta.hasOwnProperty('trace')) {
            return Tracer.sendTrace(this.stream.util.session, message.meta.trace, null, null, {
                'stream_id': message.meta.id
            });
        }
    }

    _handleMessage(message, traceId) {
        let id, models, options, event = message.event;
        if (traceId) {
            options = {
                trace: traceId
            };
        }
        switch (event) {
            case 'create':
                if (message.meta_object.type === 'notification') {
                    this._handleNotification(message.notification || message.data, options);
                }
                if(!this._updateModel(message, options)){
                    id = message.path.split('/');
                    let last = id[id.length - 1];
                    id = (Util.isUUID(last) || !last) ? id[id.length - 3] : id[id.length - 2];
                    models = this.models[id];
                    if (models) {
                      let type = message.meta_object.type;
                      models.forEach((model) => {
                        let newModel = model.get(type).add(message[type] || message.data, options);
                        this.addModel(newModel);
                      });
                    }
                }
                break;
            case 'update':
                if (message.meta_object.type === 'notification') {
                    this._handleNotification(message.notification || message.data, options);
                }
                this._updateModel(message, options);
                break;
            case 'delete':
                id = message.meta_object.id;
                models = this.models[id];
                if (models) {
                    models.forEach((model) => {
                      model.emit('destroy', model, options);
                      this.removeModel(model);
                    });
                }
                break;

        }
    }

    _updateModel(message, options) {
        let id = message.meta_object.id;
        let models = this.models[id];
        if (models) {
            models.forEach((model) => {
              model.emit('stream:message', model, message[message.meta_object.type] || message.data, message);
              model.set(message[message.meta_object.type] || message.data, options);
            });
            return true;
        }
        return false;
    }

    _handleNotification(notification, options) {
        switch (notification.base.code) {
            case 1100004:
                this.emit('permission:added', notification.base.type_ids, notification.base.ids, options);
                break;
            case 1100013:
                this.emit('permission:updated', notification.base.type_ids, notification.base.ids, options);
                break;
            case 1100006:
                this.emit('permission:removed', notification.base.type_ids, notification.base.ids, options);
                break;
            case 1100007:
                this.emit('permission:revoked', notification.base.type_ids, notification.base.ids, options);
                break;

        }
    }

    _getUniqueSubscriptions(subscriptions){
      let allSubscriptions = [...this.stream.get('subscription'), ...subscriptions];
      return allSubscriptions.filter((value, index, self) => self.indexOf(value) === index);
    }

    subscribe(arr, options = {}) {
        if (!this.stream) {
            console.error('stream model is not found, cannot update subscriptions');
            return;
        }
        if(arr.constructor !== Array && !(arr instanceof Collection)){
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
        if(subscriptions.length === 0) {
          if(options.success){
            options.success.call(this);
          }
          if(options.complete){
            options.complete.call(this);
          }
          return;
        }
        subscriptions = this._getUniqueSubscriptions(subscriptions);
        if(this.updating){
          this.nextStream = subscriptions;
          let promise = new Promise((resolve, reject) => {
            this.nextStreamPromises.push({resolve, reject});
          })
          return promise;
        }
        // DO NOT UPDATE IF IT IS THE SAME SUBSCRIPTIONS
        // AND MAKE SURE COLLECTION ADD AND REMOVE LISTENERS ARE ADDED ONLY ONCE !!!
        let requestOptions = Object.assign({}, options);
        requestOptions.success = () => {
            models.forEach((obj) => this.addModel(obj));
            if (options.success) {
                options.success.apply(this, arguments);
            }
        }
        return this._updateSubscriptions(subscriptions, requestOptions);
    }

    unsubscribe(arr, options) {
        if (!this.stream) {
            console.error('stream model is not found, cannot update subscriptions');
            return;
        }
        if(arr.constructor !== Array && !(arr.constructor.prototype instanceof Collection)){
            arr = [arr];
        }
        let update = false;
        let subscriptions = this._getUniqueSubscriptions(this.nextStream || []);
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
        if(this.updating && options.force !== true){
            this.nextStream = subscriptions;
            let promise = new Promise((resolve, reject) => {
              this.nextStreamPromises.push({resolve, reject});
            })
            return promise;
        }
        if(update){
            return this._updateSubscriptions(subscriptions, options);
        } else if(options.success){
            options.success.call(this.stream, this.stream, this.stream.toJSON(), {});
        }
    }

    _getModelUrl(model) {
        return model.url({
            full: false
        }).replace(model.util.getServiceUrl(model[_name]), '/' + model[_name]);
    }

    addModel(model) {
        this._forAllModels(model, this._addModelToCache.bind(this), this._addCollectionListener.bind(this));
    }

    removeModel(model) {
        this._forAllModels(model, this._removeModelFromCache.bind(this), this._removeCollectionListener.bind(this));
    }

    _forAllModels(model, modelFunc, collectionFunc) {
        let arr = [model];
        while (arr.length != 0) {
            let temp = [];
            arr.forEach((m) => {
                modelFunc(m);
                if (m.constructor[_relations]) {
                    m.constructor[_relations].forEach(({
                        key,
                        type,
                        relatedClass
                    }) => {
                        if (type === Util.type.One) {
                            temp = [...temp, m.get(key)];
                        } else if (type === Util.type.Many) {
                            let col = m.get(key);
                            collectionFunc(col);
                            temp = [...temp, ...col.models];
                        }
                    });
                }
            });
            arr = temp;
        }
    }

    _addModelToCache(model) {
        let id = model.get('meta.id');
        if (!this.models.hasOwnProperty(id)) {
          this.models[id] = [model];
        } else {
          if(this.models[id].indexOf(model) === -1){
            this.models[id].push(model);
          }
        }
    }

    _removeModelFromCache(model) {
        let id = model.get('meta.id');
        if(this.models[id]){
          let index = this.models[id].indexOf(model);
          if(index !== -1){
            this.models[id].splice(index, 1);
            if(this.models[id].length === 0){
              delete this.models[id];
            }
          }
        }
    }

    _addCollectionListener(collection){
        collection.on('add', this._collectionAddCallback);
        collection.on('remove', this._collectionRemoveCallback);
    }

    _removeCollectionListener(collection){
        collection.off('add', this._collectionAddCallback);
        collection.off('remove', this._collectionRemoveCallback);
    }

    _collectionAddCallback(collection, model, options){
        this.addModel(model);
    }

    _collectionRemoveCallback(collection, model, options){
        this.removeModel(model);
    }

    _updateSubscriptions(subscription, options) {
        this.stream.set('subscription', subscription);
        if(this.stream.get('meta.id')){
          this._updateObjectSubscriptions(subscription, options);
        } else {
          this._updateOneTimeStreamSubscriptions(subscription, options);
        }
    }

    _updateOneTimeStreamSubscriptions(subscription, options){
        const self = this;
        if(!this[_oldSocket]){
          this[_oldSocket] = this.socket;
        } else {
          this.socket.ignoreReconnect = true;
          this.socket.close();
        }
        this.open(options);
        const newSocket = this.socket;
        newSocket.addEventListener('open', function(e) {
            this.emit('change:socket', this.socket, this[_oldSocket]);
            if(this[_oldSocket]){
              this[_oldSocket].ignoreReconnect = true;
              this[_oldSocket].close();
              this[_oldSocket] = null;
            }
        }, false);
        return true;
    }

    _updateObjectSubscriptions(subscription, options){
        return this.stream.save({
            subscription,
            full: true
        }, {
            wait: true,
            patch: true,
            success: (model, json, response) => {
              if(!this.nextStream){
                this.nextStreamPromises.forEach(({resolve, reject}) =>{
                  resolve(response);
                });
                if(options.success){
                  options.success.call(this, response);
                }
              }
            },
            error: (model, response) => {
              if(!this.nextStream){
                this.nextStreamPromises.forEach(({resolve, reject}) =>{
                  reject(response);
                });
                if(options.error){
                  options.error.call(this, response);
                }
              }
            },
            complete: () => {
              if(this.nextStream){
                let subscriptions = this.nextStream;
                this.nextStream = null;
                this.subscribe(subscriptions, { force: true });
              } else {
                this.updating = false;
              }
              if(options.complete){
                options.complete.call(this);
              }
            }
        });
    }

    _getPath(obj) {
        let isObject = obj instanceof Object;
        let isString = typeof(obj) === 'string';
        if (!isObject && !isString) {
            console.error('argument must be a string, an object or a class');
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
            path = obj.meta && obj.meta.id && obj.meta.type && '/' + obj.meta.type + '/' + obj.meta.id;
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
