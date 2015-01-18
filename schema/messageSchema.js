/* jslint node:true */
"use strict";

var transmitMsgSchema = {
    "id":"/Message",
    "description" : "Message transmitted from HHR-Pro to Queue",
    "type":"object",
    "additionalProperties":false,
    "properties": {
        "gateway": { type:"string", description:"The gateway (PhysioDomBox) for which the URL is requested" , required:true },
        "method": { type:"string", "enum":[ "POST", "DELETE" ], required: true},
        "content": { 
			type:"array", 
			items: { type:"object" }, 
			required:true }
    }
}

var Validator = require('jsonschema').Validator;
var validator = new Validator();
validator.addSchema(transmitMsgSchema, '/Message');

module.exports.validator = validator;