/**
 @license
 Copyright (c) 2016 Telecom Sante
 This code may only be used under the CC BY-NC 4.0 style license found at https://creativecommons.org/licenses/by-nc/4.0/legalcode

 You are free to:

 Share — copy and redistribute the material in any medium or format
 Adapt — remix, transform, and build upon the material
 The licensor cannot revoke these freedoms as long as you follow the license terms.

 Under the following terms:

 Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made.
 You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.

 NonCommercial — You may not use the material for commercial purposes.

 No additional restrictions — You may not apply legal terms or technological measures that legally restrict others
 from doing anything the license permits.
 */

/* jslint node:true */
"use strict";

var configSchema = {
  "id"                  : "/Config",
  "description"         : "Configuration",
  "type"                : "object",
  "additionalProperties": false,
  "properties"          : {
    "mongouri": {type: "string", description: "The mongodb uri", required: true},
    "server"  : {type: "string", pattern: "^(http|https)\:\/\/.*", description: "the SServer url", required: true},
    "key"     : {type: 'string', required: true},
    "appSri"  : {type: 'string', required: true},
    "retry"   : {type: 'integer', default: 3}
  }
};

var Validator = require('jsonschema').Validator;
var validator = new Validator();
validator.addSchema(configSchema, '/Config');

module.exports.validator = validator;