/* jslint node:true */

"use strict";

var restify = require("restify"),
	fs      = require('fs'),
	program = require("commander"),
	Promise = require("rsvp").Promise,
	Logger  = require("logger"),
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
var queue = new Queue(config);;   // Queue object is global and so shared to all modules
global.queue = queue;

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

server.post('/register',  IQueue.createPublisher);
server.del( '/register',  IQueue.delPublisher);

(function init() {
	try {
		queue.connect()
			.then(function (queue) {
				server.listen(port, "127.0.0.1", function () {
					logger.info(server.name + " v" + server.versions + " listening at " + server.url);
				});
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

