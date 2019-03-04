const Util = require('../util');
const Generic = require('./generic-class');

const _pickAttributes = Symbol.for("generic-class-pickAttributes");

class Notification extends Generic{}

Notification[_pickAttributes] = {
    '2.0': ['meta', 'read', 'custom', 'base', 'times', 'timestamp', 'identifier', 'url']
};

module.exports = Notification;
