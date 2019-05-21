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
  (function(open, setRequestHeader, send) {
      XMLHttpRequest.prototype.open = function(method, url){
        let trace = checkAndSendTrace(method, url);
        if(trace.shouldTrace){
          trace.method = method;
          if(trace.query){
            url = url.split('?')[0] + trace.query;
          }
        }
        trace.url = url;
        this.trace = trace;
        return open.apply(this, arguments);
      }
      XMLHttpRequest.prototype.setRequestHeader = function(key, value){
        if(this.trace.shouldTrace && key === 'x-session'){
          this.trace.session = value;
        }
        return setRequestHeader.apply(this, arguments);
      }
      XMLHttpRequest.prototype.send = function() {
        if(this.trace.shouldTrace){
          tracer.sendTrace(this.trace.session, this.trace.parentNode, this.trace.nodeId, this.trace.nodeName, { query: this.trace.query }, 'ok');
        }
        // Handle response that have TRACE in data
        this.addEventListener(
            'load',
            function() {
              checkResponseTrace(this.status, this.response, nodeId, nodeName);
            },
            false
        );
        return send.apply(this, arguments);
      };
  })(XMLHttpRequest.prototype.open, XMLHttpRequest.prototype.setRequestHeader, XMLHttpRequest.prototype.send);
  window.Tracer = tracer;
  fetch = window.fetch;
  through = "/external/";
  isBrowser = true;

  // Check Global Trace
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

  const handleRequestEnd = function(request, nodeId, nodeName){
    request.on('response', function (response) {
      let body = '';
      response.on('data', function (chunk) {
        body += chunk;
      });
      response.on('end', function () {
        console.log(response);
        checkResponseTrace(status, body, nodeId, nodeName);
      });
    });
  };

  const func = function(req = {}, options = {}, defaultFunc) {
      let url, method, session, isObject;
      if (req.constructor === String) {
          isObject = false;
          url = req;
          method = options.method || 'GET';
          session = options.headers && options.headers["x-session"];
      } else if(Object.prototype.toString.call(req) === "[object Object]"){
          isObject = true;
          url = req.path;
          method = req.method || 'GET';
          session = req.headers && req.headers["x-session"];
      }
      let { nodeId, nodeName, newQuery } = checkAndSendTrace(method, url, session);
      if(newQuery){
        if(isObject){
          req.path = req.path.split('?')[0] + newQuery;
        } else {
          req = req.split('?')[0] + newQuery;
        }
      }
      let request = defaultFunc.apply(this, arguments);
      handleRequestEnd(request, nodeId, nodeName);
      return request;
  }

  const overrideRequest = function(protocol, strName) {
      protocol.request = function(req, options){
        return func(req, options, originalRequest[strName].request);
      }
      protocol.get = function(req, options) {
        return func(req, options, originalRequest[strName].get);
      }
  };

  overrideRequest(http, 'http');
  overrideRequest(https, 'https');

  fetch = originalRequest["https"].get;
  through = "https://";
  isBrowser = false;
}

const checkAndSendTrace = function(method, path, session) {
    if(!path){
      return;
    }
    let nodeId, nodeName, parentNode, newQuery, shouldTrace = false;
    path = path.replace(/^http:\/\//, '').replace(/^https:\/\//, '');
    if(path.indexOf('/') !== -1){
        path = path.split('/').slice(1).join('/') || '';
    } else {
        path = path.split('?')[1] || '';
    }
    if(tracer.params && tracer.params.name){
        nodeName = tracer.params.name + "_" + method + '_' + path;
    } else {
        nodeName = 'WS_APP_BACKGROUND_' + method + '_' + path;
    }
    if (path.startsWith('services/') || (path.startsWith('external/') && path.indexOf('external/tracer') === -1)) {
        // Removing trace_parent from path
        let splitPath = path.split('?');
        let queryData = {};
        let tracing = false;
        if (splitPath.length > 1) {
            // Converting query to object
            var query = splitPath[1].split('&');
            var origin = splitPath[0];
            query.forEach(function(q) {
                q = q.split('=');
                queryData[q[0]] = q[1];
            });

            parentNode = queryData['trace_parent'];
            nodeId = queryData['trace'];
            if (nodeId) {
                // Clean and reconstruct
                delete queryData['trace_parent'];
                newQuery = '';
                for(let key in queryData){
                    newQuery += key + '=' + queryData[key] + '&';
                }
                if (newQuery.length) {
                    newQuery = '?' + newQuery;
                    newQuery = newQuery.slice(0, -1);
                }

                path = origin + newQuery;
                var splitOrigin = origin.split('/');
                shouldTrace = true;
                tracing = true;
            }
        }

        if (!tracing && tracer.globalTrace === true && session && path && path.startsWith('services') && (path.indexOf('/network') !== -1 || path.indexOf('/device') !== -1 || path.indexOf('/value') !== -1 || path.indexOf('/state') !== -1)) {
            shouldTrace = true;
        }
        return { nodeId, nodeName, parentNode, quary: newQuery, shouldTrace };
    }
};

const checkResponseTrace = function(status, response, nodeId, nodeName, session){
  // Handle response that have TRACE in data
  if(status === 200){
    if(nodeId){
      tracer.sendTrace(session, nodeId, null, nodeName, null, 'ok');
    }
  } else {
    let responseTrace;
    try {
        let jsonResponse = JSON.parse(response);
        responseTrace = jsonResponse.trace;
    } catch (e) {
        responseTrace = nodeId;
    }
    if(responseTrace){
      tracer.sendTrace(session, responseTrace, null, nodeName, null, 'fail');
    }
  }
}

module.exports = tracer;
