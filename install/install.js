"use strict";

/* jshint node:true */

var fs = require("fs"),
	swig = require("swig");

var confSchema = {
	"id": "/installConf",
	"description" : "install configuration file",
	"type": "object",
	"properties": {
		"serverName": { type:"string", required:true },
		"rootDir": { type: "string"},
		"sslDir": { type:"string"  },
		"logDir": { type: "string", required: true },
		"appPort": { type:"integer", required: true },
	},
	"additionalProperties":false
};

fs.exists(__dirname+"/install.json", function(exists) {
	var error = false;

	if(!exists) {
		console.error("ERROR : no install.json file");
		process.exit(1);
	}

	var conf = require("./install.json");
	
	var homedir = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
	for( var prop in conf ) {
		if(conf.hasOwnProperty(prop) && isNaN(conf[prop])) {
			conf[prop] = conf[prop].replace(/\{\{HOME\}\}/g,homedir);
		}
	}

	var Validator = require('jsonschema').Validator;
	var validator = new Validator();
	var checkConf = validator.validate( conf, confSchema );
	
	if( checkConf.errors.length ) {
		checkConf.errors.forEach( function( error , indx) {
			console.log( error.stack );
			if( indx === checkConf.errors.length - 1) {
				return process.exit(1);
			}
		});
	}
	
	if( conf.sslDir) {
		if( !(fs.existsSync( conf.sslDir + "/server.crt" ) && fs.existsSync( conf.sslDir + "/server.key" ) ) ) {
			console.log("ERROR : can't find server keys");
			error = true;
		}
	}

	conf.nginxDestDir = (require('os').platform() === "darwin" ? "/usr/local":"")+"/etc/nginx/sites-available";

	var nginxConfFile =  swig.renderFile('install/nginx.tpl', conf );
	var filepath = conf.nginxDestDir + "/" + conf.serverName;
	fs.writeFileSync("./nginx.conf", nginxConfFile );
	require("child_process").exec("sudo cp nginx.conf "+filepath , function(err) {
		if (err) {
			console.log(err);
		} else {
			console.log("config file written : "+filepath);
			console.log();
			console.log("create a symlink in "+ ((require('os').platform() === "darwin" ? "/usr/local":"")+"/etc/nginx/sites-enabled"));
			console.log("then, don't forget to reload nginx ( sudo service nginx reload )");
			fs.unlinkSync("./nginx.conf");
		}
	});
});
