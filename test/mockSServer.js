/* jslint node:true */

"use strict";

var restify = require("restify"),
	fs = require("fs"),
	program = require("commander"),
	Logger  = require("logger");

var logger = new Logger( "Mock SServer");

// for https server
/*
var server = restify.createServer({
	name:    "SServer mock",
	version: "0.0.1",
	certificate: fs.readFileSync("./test/server.crt"),
    key : fs.readFileSync("./test/server.key"),
    requestCert: true,
    rejectUnauthorized:false
});
*/

var pkg     = require('../package.json');
var config = {};
program
	.version(pkg.version)
	.usage('[options] [dir]')
	.option('-c, --config <config>', 'configuration file', String )
	.parse(process.argv);

if( program.config ) {
	if( program.config.slice(0,1) !== '/') {
		program.config = require('path').join( process.cwd(), program.config );
	}
	
	if( !fs.existsSync( program.config ) ) {
		logger.emergency("couldn't find the config file");
		process.exit(1);
	}
	try {
		config = require(program.config);
	} catch(err) {
		logger.emergency("config file bad syntax");
		process.exit(1);
	}
}

var server = restify.createServer({
	name:    "SServer mock",
	version: "0.0.2"
});

server.use(restify.gzipResponse());
server.use(restify.fullResponse());
server.use(restify.queryParser());
server.use(restify.bodyParser());
server.pre(restify.pre.userAgentConnection());

server.use( function(req, res, next) {
	if( !req.params.gateway ) {
		res.send(400, { code:400, message:"no gateway parameter"});
		return next(false);
	} else {
		if(req.method !== "GET") {
			switch( req.params.gateway ) {
				case "physio-500":
					res.send(500);
					return next(false);
					break;
				case "physio-400":
					res.send(400);
					return next(false);
					break;
				default:
					return next();
			}
		} else {
			return next();
		}
	}
});

server.get('/restUrl.rest', function( req,res, next) {
	logger.trace("get gateway database");
	if( !req.params.appSri || req.params.appSri !== config.appSri ) {
		logger.warning("bad message (no appSri)");
		res.send(400, { code:400, message:"bad message (no appSri)" });
		return next(false);
	} else {
		logger.info("send default database");
		res.send("/plt.treedb.srv-18590");
		return next();
	}
});

server.post('/plt.treedb.srv-18590/database', function(req, res, next) {
	try {
		var message = JSON.parse(req.body);
		if( message instanceof Array ) {
			logger.info("POST", message );
			res.send( "POST "+ JSON.stringify(message) );
			return next();
		} else {
			logger.error("POST is not an array" );
			res.send(400, { code:400, message:"not an array" });
			return next(false);
		}
	} catch(err) {
		logger.error("POST bad message" );
		res.send(400, { code:400, message:"bad message" });
		return next(false);
	}
});

server.del('/plt.treedb.srv-18590/database', function(req, res, next) {
	logger.trace("delete message");
	try {
		var message = JSON.parse(req.body);
		if( message instanceof Array ) {
			logger.info("DELETE", message )
			res.send( "DELETE "+ JSON.stringify(message) );
			return next();
		} else {
			res.send(400, { code:400, message:"not an array" });
			return next(false);
		}
	} catch(err) {
		res.send(400, { code:400, message:"bad message" });
		return next(false);
	}
});


server.listen(8443, function() {
	logger.info('------------------------------------------------------------------');
  	logger.info(server.name+" v"+server.versions+" listening at "+server.url);
	logger.info("config", JSON.stringify(config,"",4));
});