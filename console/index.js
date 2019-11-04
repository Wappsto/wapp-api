// Saving console functions
let defaultConsole = Object.assign({}, console);

var start = function(session, customOptions) {
    const http = require("http");
    // Getting token, session and installation Id
    let sessionID = session || process.env.sessionID;
    if(!sessionID){
      console.error("Wappsto console requires sessionID to work");
      return;
    }

    const version = customOptions && customOptions.version ? customOptions + '/' : '';
    // Extsync request options
    const options = {
        hostname: 'rest-service',
        port: 80,
        path: '/services/' + version + 'extsync/wappsto/editor/console',
        method: 'POST',
        headers: {
            'x-session': sessionID,
            'Content-Type': 'application/json'
        }
    };

    let replacer = function(key, value) {
        if (value === undefined) {
            return 'undefined';
        } else if (value === null) {
            return 'null';
        } else if (typeof value === "function") {
            return "function";
        }
        return value;
    }

    let sendExtsync = function(key, arguments) {
        let req = http.request(options, function(res) {});
        req.on('error', (e) => {
            defaultConsole.error(`problem with request: ${e.message}`);
        });

        let time = new Date().toISOString();
        let postData = JSON.stringify({
            key,
            arguments,
            time
        }, replacer);

        // Write data to request body
        req.write(postData);
        req.end();
        return req;
    }

    // Override console
    let consoleKeys = Object.keys(console);
    for (let i = 0; i < consoleKeys.length; i++) {
        let key = consoleKeys[i];
        console[key] = function() {
            sendExtsync(key, arguments);
            defaultConsole[key].apply(console, arguments);
        };
    }

    process.on('uncaughtException', (err) => {
        let req = sendExtsync('error', [err.stack]);
        req.on('close', () => {
            process.exit(1);
        });
    });
};

var stop = function(){
    Object.assign(console, defaultConsole);
}

module.exports = {
    start,
    stop
};
