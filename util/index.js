let baseUrl, session;
if(typeof window === 'object' && window.document){
    baseUrl = "/services";
    session = window.sessionStorage.getItem("sessionID");
} else {
    baseUrl = process.env.baseUrl && process.env.baseUrl.slice(0, -1);
    session = process.env.sessionID;
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
    extend: function(util) {
        let newUtil = Object.assign({}, util);
        if (!newUtil.session) {
            if(!session){
                throw new Error("session is required");
            }
            newUtil.session = session;
        }
        if (!newUtil.version) {
            newUtil.version = this.version;
        }
        if (!newUtil.baseUrl) {
            newUtil.baseUrl = this.baseUrl;
        }
        return newUtil;
    },
    throw: function(response){
      process.on('unhandledRejection', up => { throw up });
      throw response;
    }
}
