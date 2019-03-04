var Wappsto = require("../main");
var wappsto = new Wappsto({
    baseUrl: "http://wappsto.local/services",
    version: "2.0",
    session: "a8cab23b-305c-43f9-af18-a03f2e73c87a"
});

wappsto.get("network", {}, {
    quantity: 1,
    expand: 3,
    success: (col, json, response) => {
        console.log(col);
    },
    error: (response) => {
        console.log(response);
    },
    onStatusChange: (status) => {
      console.log(status);
    }
});

wappsto.initializeStream({subscription: ["/notification"]}, {
	success: (wappstoStream) => {console.log("success");},
	error: () => {console.log("error");}
});
