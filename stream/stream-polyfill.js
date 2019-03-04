let WebSocket;
if(typeof window === 'object' && window.document && window.WebSocket){
    WebSocket = window.WebSocket;
} else {
    WebSocket = require('ws');
}

module.exports = WebSocket;
