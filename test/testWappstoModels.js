var WappstoModels = require("../models");
var wappstoModels = new WappstoModels({
    baseUrl: "https://wappsto.local/services",
    version: "2.0",
    session: "440a1eeb-68c4-424c-a52c-3b56e38c58b1"
});

var network = new wappstoModels.Network({
    name: "sami heyyyyy"
});
network.save({}, {
    success: function() {
        console.log(arguments);
    },
    error: function(model, response) {
        console.log(response.responseText);
    }
});

// var WappstoFunctions = require("./wappstoFunctions");
// var wappstoFunctions = new WappstoFunctions({session: "", installation});

// var myNetworks = wappstoFunctions.getDevice({name: "stefano", quantity: 1}, {quantity: 3, expand: 5, parent: {manufacturer: "philips"}});
