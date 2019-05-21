let baseUrl, session, token;

let readCookie = function(name){
  var nameEQ = name + '=';
  var ca = window.document.cookie.split(';');
  for (var i = 0; i < ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

let get = function(key){
  let result = window.sessionStorage.getItem(key);
  if(!result){
    result = readCookie(key);
  }
  return result;
}

if(typeof window === 'object' && window.document){
    baseUrl = "/services";
    session = get("sessionID");
    token = get("tokenID");
} else {
    baseUrl = process.env.baseUrl && process.env.baseUrl.slice(0, -1);
    session = process.env.sessionID;
    token = process.env.tokenID;
}

function define(obj, prop, value){
  Object.defineProperty(obj, prop, {
    value: value,
    writable: false,
    enumerable: true
  });
}

module.exports = {
    baseUrl: baseUrl,
    version: "2.0",
    type: {
        One: Symbol.for('one'),
        Many: Symbol.for('many')
    },
    isUUID: function(data) {
        try {
            if (data.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-b8-9][a-f0-9]{3}-[a-f0-9]{12}$/i).length > 0) {
                return true;
            }
        } catch (err) {}
        return false;
    },
    extend: function(util = {}) {
      let xSession = util.session || session;
      if (!xSession) {
        throw new Error("session is required");
      }
      let newUtil = {};
      define(newUtil, "session", xSession);
      define(newUtil, "version", util.version || this.version);
      define(newUtil, "baseUrl", util.baseUrl || this.baseUrl);
      define(newUtil, "token", util.token || token);
      return newUtil;
    },
    throw: function(response){
      process.on('unhandledRejection', up => { throw up });
      throw response;
    }
}
