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

program
	.version(pkg.version)
	.usage('[options] [dir]')
	.option('-p, --port <port>', 'specify the port [8001]', Number, 8443)
	.option('-s, --server <url>', 'specify the SServer url', String, 'http://127.0.0.1:8080')
	.parse(process.argv);
	
console.log("serveur ", program.server);

var QueueURL = 'mongodb://127.0.0.1/physioDOM_queue';

var queue = new Queue(program.server);   // Queue object is global and so shared to all modules
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

server.get(/\/*/, IQueue.getMessages );
server.post('/',  IQueue.pushMessage );
server.del('/all', IQueue.delAllMessages );
server.del('/:msgID', IQueue.delMessage );


(function init() {
	queue.connect(QueueURL)
		.then( function( dbClient ) {
			server.listen(9000, function() {
				logger.info('------------------------------------------------------------------');
			  	logger.info(server.name+" v"+server.versions+" listening at "+server.url);
			});
		})
		.catch( function(err) {
			console.error("process exit with error");
			console.error(err);
			process.exit(1);
		});
})();

