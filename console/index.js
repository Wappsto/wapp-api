// Saving console functions
const Util = require('../util');
const axios = require('axios');

const defaultConsole = Object.assign({}, console);

const start = function(session, customOptions) {
    // Getting token, session and installation Id
    const sessionID = session || Util.session;
    if(!sessionID){
        console.error('Wappsto console requires sessionID to work');
        return;
    }

    const version = customOptions && customOptions.version ? customOptions + '/' : '';
    // Extsync request options
    const options = {
        url: (customOptions.baseUrl || Util.baseUrl) + '/' + version + 'extsync/wappsto/editor/console',
        method: 'POST',
        headers: {
            'x-session': sessionID,
            'Content-Type': 'application/json'
        }
    };

    const replacer = function(key, value) {
        if (value === undefined) {
            return 'undefined';
        } else if (value === null) {
            return 'null';
        } else if (typeof value === 'function') {
            return 'function';
        }
        return value;
    }

    const sendExtsync = function(key, arguments) {
        const time = new Date().toISOString();
        const postData = JSON.stringify({
            key,
            arguments,
            time
        }, replacer);

        const requestOptions = Object.assign({}, options, { data: postData });
        const req = axios(options);
        return req;
    }

    // Override console
    const consoleKeys = Object.keys(console);
    for (let i = 0; i < consoleKeys.length; i++) {
        const key = consoleKeys[i];
        console[key] = function() {
            sendExtsync(key, arguments);
            defaultConsole[key].apply(console, arguments);
        };
    }

    process.on('uncaughtException', (err) => {
        const req = sendExtsync('error', [err.stack]);
        req.finally(function () {
            process.exit(1);
        }); 
    });
};

const stop = function(){
    Object.assign(console, defaultConsole);
}

module.exports = {
    start,
    stop
};
