const Util = require('../util');
const Generic = require('./generic-class');
const Collection = require('./generic-collection');

const _pickAttributes = Symbol.for("generic-class-pickAttributes");

class Set extends Generic{
  toJSON(options) {
    let json = Generic.prototype.toJSON.call(this, options);

    //merging _relations and group array
    ["network", "device", "value", "state", "set", "object"].forEach((name) => {
      // Check if the array is under this
      if(this[name] instanceof Array){
        // Getting the array
        let arr = this[name] instanceof Collection ? this[name].toJSON() : this[name];

        // Looking if the group exist under the the set
        let groupForName = json["group"].find((element) => {
          return element.type == name;
        });

        // Creating group
        let newGroup = false;
        if(!groupForName){
          json["group"].push({
            name,
            meta: {
                id: ""
            }
          });
          newGroup = true;
        }

        // merge the array with the group
        this[name].forEach((element) => {

          // Getting the id of the element
          let elementId;
          if(typeof(element) == 'object'){
            elementId = element.meta && element.meta.id;
          } else if(Utils.isUUID(element)){
            elementId = element;
          }

          if(elementId){
            if(newGroup){
              groupForName.id.push(elementId);
            } else if(!groupForName.id.includes(elementId)){
              // Checking if the id is already added
              // Adding the new id to the group
              groupForName.id.push(elementId);
            }
          }
        });
      }
    });

    return json;
  }
}

Set["_defaults"] = {
  "group": []
};

Set[_pickAttributes] = {
  '2.0': ['meta', 'name', 'description', 'group']
};

// it think is better to create this dynamically in the set using GenericClass._createRelationCollection
// Set["_relations"] = [{
//   type: Util.type.Many,
//   key: "device",
//   relatedClass: Device
// }, {
//   type: Util.type.Many,
//   key: "set",
//   relatedClass: Set
// }];

module.exports = Set;
