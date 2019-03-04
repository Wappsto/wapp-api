let WappstoFunctions = require("../functions");
let WappstoStream = require("../stream");

let wappstoStream;

let wappstoFunctions = new WappstoFunctions({
    baseUrl: "http://wappsto.local/services",
    version: "2.0",
    session: "f9dee56b-2c25-4ac8-99dc-873b6c5c23a6"
});

let startNetworkSubscription = function(){
    wappstoFunctions.get("network", {}, {
        expand: 5,
        success: function(collection){
            console.log("success start network subscription");
            let network = collection.first();
            wappstoStream.subscribe(network);
            network.on("change:name", function(){
                console.log("network name changed to: " + network.get("name"));
            });
            network.get("device.0").on("change:name", function(device){
                console.log("device name changed to: " + device.get("name"));
            });
        },
        error: function(){
            console.log("error start network subscription");
        }
    });
};

let createWappstoStream = function(stream){
    wappstoStream = new WappstoStream(stream);
    wappstoStream.connect();
    wappstoStream.subscribe("/network", {
        error: function(model, {responseJSON: { data }}) {
            console.log(data);
        }
    });
    startNetworkSubscription();
};

let createStream = function(){
    let stream = new wappstoFunctions.getModels().Stream();
    stream.save({
        full: true
    }, {
        wait: true,
        success: function(){
            console.log("success create stream");
            createWappstoStream(stream);
        },
        error: function(model, {responseJSON: { data }}){
            console.log("error create stream");
            console.log(data);
        }
    });
};

wappstoFunctions.get("stream", {}, {
    expand: 1,
    success: function(collection){
        console.log("success get stream");
        createWappstoStream(collection.at(0));
    },
    error: function(){
        console.log("error get stream");
        console.log(arguments);
    }
});
