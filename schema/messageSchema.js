/* jslint node:true */
"use strict";

var transmitMsgSchema = {
	"id": "/Message",
	"description": "Message transmitted from HHR-Pro to Queue",
	"type": "object",
	"additionalProperties": false,
	"properties": {
		"key": {type: "string", description: 'key associated to the publisher', required: false},
		"server": {type: "string", description: 'server name of the sender', required: false},
		"subject": {type: "string", description: "id of the beneficiary", required: true},
		"gateway": {
			type: "string",
			description: "The gateway (PhysioDomBox) for which the URL is requested",
			required: true
		},
		"init": { type:"boolean" },
		"method": {type: "string", "enum": ["POST", "DELETE"], required: true},
		"content": {
			type: "array",
			items: {type: "object"},
			required: true
		}
	}
};

var symptomMsgSchema = {
	id:"/symptomMessage",
	type:"object",
	properties: {
		"id": { type: "string", required: true},
		"value": { type: "integer", required: true},
		"datetime": { type: "integer", required: true}
	},
	"additionalProperties": false
};

var paramMsgSchema = {
	id:"/parameterMessage",
	type:"object",
	properties: {
		"id": { type: "string", required: true},
		"value": { type: "integer", required: true},
		"datetime": { type: "integer", required: true},
		"automatic": {type: "boolean", required: true}
	},
	"additionalProperties": false
};

var receivedMsgSchema = {
	id: "/ReceivedMessage",
	description: "Message received from SServer",
	type: "object",
	oneOf: [
		{
			"properties": {
				"hhr": {type: "string", description: "reference of the beneficiary", required: true},
				"id": {type: "string", description: "read message id", required: true}
			},
			"additionalProperties": false
		},
		{
			"properties": {
				"hhr": {type: "string", description: "reference of the beneficiary", required: true},
				"id": {type: "string", description: "id of the symptoms assesment", required: true},
				"scales": {
					type: "array",
					items: {  "$ref": "/symptomMessage" }
				}
			},
			"additionalProperties": false
		},
		{
			"properties": {
				"hhr": {type: "string", description: "reference of the beneficiary", required: true},
				"id": {type: "string", description: "id of the symptoms assesment", required: true},
				"params": {
					type: "array",
					items: {  "$ref": "/parameterMessage" }
				}
			},
			"additionalProperties": false
		}
	]
};


var Validator = require('jsonschema').Validator;
var validator = new Validator();
validator.addSchema(transmitMsgSchema, '/Message');
validator.addSchema(symptomMsgSchema, '/symptomMessage');
validator.addSchema(paramMsgSchema, '/parameterMessage');
validator.addSchema(receivedMsgSchema, '/ReceivedMessage');

module.exports.validator = validator;