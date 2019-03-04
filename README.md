# wapp-api

Set of classes and functions to speed up wapp development process.

## Install

```
npm install wapp-api
```

## Usage

wapp-api follows the Wappsto's Unified Data Model. It provides a possibility to create data structures supported by Wappsto with ease.

wapp-api can be used in either web browser or in NodeJS environment:

* Browser (client-side usage):
```
<script src="browser/wapp-api.js"></script>
```
This will add the 'Wappsto' class as a global variable under the window object.

* NodeJS (server-side usage):
```
const Wappsto = require("wapp-api");
```

Once 'Wappsto' class is loaded, you can instantiate it as follows:

```
var wappsto = new Wappsto();
        
// or if you want a specific session or environment:

var wappsto = new Wappsto({
  baseUrl: 'your_base_url',
  session: 'your_base_url'
});
```

## Related

- [wapp-cli](https://github.com/Wappsto/wappsto-cli)

## License

Apache 2.0 © [Seluxit A/S](http://seluxit.com)
