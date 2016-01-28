/* jslint node:true */

"use strict";

var restify = require("restify"),
	fs      = require('fs'),
	program = require("commander"),
	Promise = require("rsvp").Promise,
	Logger  = require("logger"),
	Agenda = require("agenda"),
	dbPromise = require("./lib/dbPromise"),
	Queue = require("./lib/queue"),
	IQueue = require("./lib/IQueue");

var pkg     = require('./package.json');
var logger = new Logger( "Queue Service");

var config = {};

logger.info("--------------------------------------------------");

program
	.version(pkg.version)
	.usage('[options] [dir]')
	.option('-p, --port <port>', 'specify the port [9000]', Number, 9000)
	.option('-s, --server <url>', 'specify the SServer url', String)
	.option('-k, --key <key>', 'specify the admin key', String )
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
config.key = program.key || config.key || null;
config.server = program.server || config.server || null;
if( !config.retry ) {
	config.retry = 5;
}
var port = program.port;
var queue = new Queue(config);    // Queue object is global and so shared to all modules
global.queue = queue;

var agenda = new Agenda({db: { address: config.mongouri }});

var server = restify.createServer({
	name:    pkg.name,
	version: pkg.version
});

/**
 * message de log de la réponse
 *
 * @param {Object} req the request object
 * @param {Object} res the response object
 * @return null
 */
function responseLog(req, res) {
	var ipAddress = req.headers['x-forwarded-for'] === undefined ? req.connection.remoteAddress : req.headers['x-forwarded-for'];
	var responseTime = (res._headers && res._headers.hasOwnProperty('response-time') ? res._headers['response-time'] + 'ms' : '');
	logger.info(ipAddress, req.method, req.url, res.statusCode, responseTime);
	return;
}

server.use(restify.gzipResponse());
server.use(restify.fullResponse());
server.use(restify.queryParser());
server.use(restify.bodyParser());
server.pre(restify.pre.userAgentConnection());

server.use( function( req, res, next ) {
	logger.info( "method", req.method, req.url );
	return next();
});

server.on("after",function(req,res) {
	responseLog(req, res);
});

server.get( '/',           IQueue.status);

server.get( '/msg',        IQueue.getMessages );
server.post('/msg',        IQueue.pushMessage );
server.del( '/msg/all',    IQueue.delAllMessages );
server.del( '/msg/:msgID', IQueue.delMessage );

server.post('/cmd/:cmd',   IQueue.command);

server.post('/register',   IQueue.getPublishers);
server.post('/register/create',  IQueue.createPublisher);
server.del( '/register/:publisherID',  IQueue.delPublisher);

server.post( '/:msgType',  IQueue.receivedMsg );

(function init() {
	try {
		queue.connect()
			.then(function () {
				server.listen(port, "0.0.0.0", function () {
					logger.info(server.name + " v" + server.versions + " listening at " + server.url);
					logger.info("config", JSON.stringify(config,"",4) );
				});
			})
			.then( function() {
				logger.info("start agenda", config.retry );

				agenda.purge( function(err, numRemoved) {
					logger.info("agenda jobs removed");

					agenda.define('resend queue', function (job, done) {
						// resend the queue for waiting ( rejected ) message
						logger.trace("reactivate the queue");
						queue.sendToSserver();
						console.log("done");
						done();
					});

					agenda.define('receive queue', function (job, done) {
						// resend the queue for waiting ( rejected ) message
						logger.trace("send received message");
						queue.sendToHHRPro();
						done();
					});

					agenda.every(config.retry + ' minutes', 'resend queue');
					// agenda.every(config.retry + ' minutes', 'receive queue');
				});
				
				agenda.start();
			})
			.catch(function (err) {
				console.error("process exit with error");
				console.error(err);
				process.exit(1);
			});
	} catch(err) {
		logger.emergency(err.message, err.detail);
	}
})();

