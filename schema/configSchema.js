/* jslint node:true */
"use strict";

var configSchema = {
	"id":"/Config",
	"description" : "Configuration",
	"type":"object",
	"additionalProperties":false,
	"properties": {
		"mongouri": { type:"string", description:"The mongodb uri" , required:true },
		"server": { type:"string", pattern:"^(http|https)\:\/\/.*", description:"the SServer url", required: true},
		"key": { type:'string', required:true },
		"appSri": { type:'string', required:true },
		"retry": { type:'integer', default:3 }
	}
};

var Validator = require('jsonschema').Validator;
var validator = new Validator();
validator.addSchema(configSchema, '/Config');

module.exports.validator = validator;