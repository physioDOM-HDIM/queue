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
	config = require(program.config);
}
config.key = program.key || config.key || null;
config.server = program.server || config.server || null;

var port = program.port;
var queue = new Queue(config);    // Queue object is global and so shared to all modules
global.queue = queue;
global.config = config;

var server = restify.createServer({
	name:    pkg.name,
	version: pkg.version
});

server.use(restify.gzipResponse());
server.use(restify.fullResponse());
server.use(restify.queryParser());
server.use(restify.bodyParser());
server.pre(restify.pre.userAgentConnection());

server.get( '/',          IQueue.status);

server.get( '/msg',       IQueue.getMessages );
server.post('/msg',       IQueue.pushMessage );
server.del( '/msg/all',   IQueue.delAllMessages );
server.del( '/msg:msgID', IQueue.delMessage );

server.post('/cmd/:cmd',  IQueue.command);

server.post('/register',  IQueue.getPublishers);
server.post('/register/create',  IQueue.createPublisher);
server.del( '/register/:publisherID',  IQueue.delPublisher);

server.post( '/:msgType', IQueue.receivedMsg );

(function init() {
	try {
		queue.connect()
			.then(function (queue) {
				server.listen(port, "0.0.0.0", function () {
					logger.info(server.name + " v" + server.versions + " listening at " + server.url);
				});
			})
			.then( function() {
				console.log("start agenda");
				var agenda = new Agenda({db: { address: config.mongouri }});

				agenda.define('resend queue', function(job, done) {
					// User.remove({lastLogIn: { $lt: twoDaysAgo }}, done);
					// queue.sendToSserver();
				});

				agenda.define('push message', function(job, done) {
					// User.remove({lastLogIn: { $lt: twoDaysAgo }}, done);
				});

				agenda.every('3 minutes', 'resend queue');
				agenda.every('3 minutes', 'push message');
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

