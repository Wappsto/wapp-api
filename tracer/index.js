let fetch;
let baseUrl;
let isBrowser;

let tracer = {
    globalTrace: false,
    params: {
        name: null,
        parent: null
    },
    sendTrace: function(session, parent, id, name, data, status) {
        if(!name){
            if (this.params && this.params.name) {
                name = this.params.name;
            } else {
                name = "WS_APP_BACKGROUND";
            }
        }
        if (id === null) {
            id = 'WS_APP_BACKGROUND_' + Math.floor(Math.random() * 1000000 + 1);
        }
        var str = '';
        for (let k in data) {
            let v = data[k];
            if (typeof v !== 'string') {
                v = JSON.stringify(v);
            }
            str += '&' + k + '=' + encodeURIComponent(v);
        }
        if (!status) {
            status = 'ok';
        }
        name = encodeURIComponent(name);
        var uri = 'id=' + id + '&name=' + name + '&status=' + status + str;
        if (parent) {
            uri = 'parent=' + parent + '&' + uri;
        } else if (this.params && this.params.parent) {
            uri = 'parent=' + this.params.parent + '&' + uri;
        }
        fetch(through + 'tracer.iot.seluxit.com/trace?' + (isBrowser ? 'x-session=' + session + '&' : '') + uri);
        return id;
    }
}

if(typeof window === 'object' && window.document && window.fetch){
  const originalFetch = window.fetch;
  window.fetch = function(req, options){
    checkAndSendTrace(req, options);
    return originalFetch.apply(this, arguments);
  }
  window.Tracer = tracer;
  fetch = originalFetch;
  through = "/external/";
  isBrowser = true;
  let search = window.location.search;
  let traceIndex = search.indexOf("trace");
  if(traceIndex !== -1){
    let slice = window.location.search.slice(window.location.search.indexOf("trace") + 6)
    let value = slice.slice(0, slice.indexOf("&"));
    if(value === "true"){
      tracer.globalTrace = true;
    }
  }
} else {
  const http = require('http');
  const https = require('https');

  // Overriding http and https
  const originalRequest = {
      http: {
          request: http.request,
          get: http.get
      },
      https: {
          request: https.request,
          get: https.get
      }
  };

  const overrideRequest = function(protocol, strName) {
      protocol.request = function(req, options) {
          checkAndSendTrace(req, options);
          return originalRequest[strName].request.apply(this, arguments);
      }
      protocol.get = function(req, options) {
          checkAndSendTrace(req, options);
          return originalRequest[strName].get.apply(this, arguments);
      }
  };

  overrideRequest(http, 'http');
  overrideRequest(https, 'https');

  fetch = originalRequest["https"].get;
  through = "https://";
  isBrowser = false;
}

const checkAndSendTrace = function(req = {}, options = {}) {
    let path, method, nodeName;
    if (req.constructor === String) {
        path = req.replace(/^http:\/\//, '').replace(/^https:\/\//, '');
        if(path.indexOf('/') !== -1){
            path = path.split('/').slice(1).join('/') || '';
        } else {
            path = path.split('?')[1] || '';
        }
        method = options.method || 'GET';
        session = options.headers && options.headers["x-session"];
    } else if(Object.prototype.toString.call(req) === "[object Object]"){
        path = req.path;
        method = req.method || 'GET';
        options = req;
        session = req.headers && req.headers["x-session"];
    }
    if(!path || !session){
      return;
    }
    if(tracer.params && tracer.params.name){
        nodeName = tracer.params.name + "_" + method + '_' + path;
    } else {
        nodeName = 'WS_APP_BACKGROUND_' + method + '_' + path;
    }
    if (path.startsWith('services/') || (path.startsWith('external/') && path.indexOf('external/tracer') === -1)) {
        // Removing trace_parent from path
        var splitPath = path.split('?');
        var queryData = {};
        var tracing = false;
        if (splitPath.length > 1) {
            // Converting query to object
            var query = splitPath[1].split('&');
            var origin = splitPath[0];
            query.forEach(function(q) {
                q = q.split('=');
                queryData[q[0]] = q[1];
            });

            var parentNode = queryData['trace_parent'];
            nodeId = queryData['trace'];
            if (nodeId) {
                // Clean and reconstruct
                delete queryData['trace_parent'];
                var newQuery = '';
                for(let key in queryData){
                    newQuery += key + '=' + queryData[key] + '&';
                }
                if (newQuery.length) {
                    newQuery = '?' + newQuery;
                    newQuery = newQuery.slice(0, -1);
                }

                path = origin + newQuery;
                var splitOrigin = origin.split('/');
                tracer.sendTrace(session, parentNode, nodeId, nodeName, { query: queryData }, 'ok');
                tracing = true;
            }
        }

        if (!tracing && tracer.globalTrace === true && session && path && path.startsWith('services') && (path.indexOf('/network') !== -1 || path.indexOf('/device') !== -1 || path.indexOf('/value') !== -1 || path.indexOf('/state') !== -1)) {
            var id = tracer.sendTrace(session, parentNode, null, nodeName, { method, path }, 'ok');
            path += '?trace=' + id;
        }

        options.path = path;
    }
};

module.exports = tracer;
