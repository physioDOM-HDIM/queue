/**
 * @file IQueue.js
 * @module Http
 */

/* jslint node:true */
"use strict";

var Logger = require("logger"),
	ObjectID = require("mongodb").ObjectID;
var logger = new Logger("IQueue");

/**
 * IBeneficiaries
 *
 * treat http request for beneficiaries
 */
var IQueue = {
	
	status: function(req, res, next) {
		res.send( queue.status() );
		return next();
	},
	
	command: function(req, res, next) {
		try {
			var msg = JSON.parse(req.body);
			switch (req.params.cmd) {
				case "start":
					queue.start(msg)
						.then(function (status) {
							res.send(status);
							next();
						})
						.catch( function(err) {
							res.send(500 || err.code, err );
							next(false);
						});
					break;
				case "stop":
					queue.stop(msg)
						.then(function (status) {
							res.send(status);
							next();
						})
						.catch( function(err) {
							res.send(500 || err.code, err );
							next(false);
						});
					break;
				case "reset":
					logger.trace("reset");
					queue.reset(msg)
						.then( function(list) {
							res.send(200, { code:200, message:"reset of the queue"});
							next();
						})
						.catch( function(err) {
							res.send(500 || err.code, err );
							next(false);
						});
					break;
				default:
					res.send(405, {code: 405, message: "unknown command"});
					return next(false);
			}
		} catch(err) { 
			res.send(403, { code:403, message:"unauthorized"});
			next(false);
		}
	},
	
	getPublishers: function(req, res, next) {
		try {
			var msg = JSON.parse(req.body);
			queue.getPublishers(msg)
				.then( function(publishers) {
					res.send(publishers);
					next();
				})
				.catch( function(err) {
					res.send(500 || err.code , err);
					next(false);
				})
		} catch(err) {
			res.send(405, { code:405, message:"bad id"});
			next(false);
		}
	},
	
	createPublisher: function(req, res, next) {
		try {
			var msg = JSON.parse(req.body);
			queue.createPublisher(msg)
				.then( function(key) {
					res.send(key);
					next();
				})
		} catch(err) {
			res.send(403, { code:403, message:"unauthorized"});
			next(false);
		}
	},

	delPublisher: function(req, res, next) {
		try {
			var msg = JSON.parse(req.body);
			queue.delPublisher(msg, req.params.publisherID )
				.then( function() {
					res.send( 200, {code:200,"message":"publisher revoked"});
					next();
				})
				.catch( function(err) {
					res.send( 500 || err.code, err );
					next();
				})
		} catch(err) {
			res.send(403, { code:403, message:"unauthorized"});
			next(false);
		}
	},
	
	pushMessage: function(req, res, next) {
		var message;
		if( !req.body ) {
			res.send(400,"no message");
			return next(false);
		} else {
			try {
				message = JSON.parse(req.body);
				queue.addMsg(message)
					.then( function(message) {
						res.send(200,{ code:200, message:"message added to queue" } );
						return next;
					})
					.catch( function(err) {
						console.log(err);
						res.send( 500 || err.code, err);
						return next(false);
					})
			} catch(err) {
				res.send(400,"not a json message");
				return next(false);
			}
		}
	},
	
	getMessages: function(req, res, next) {
		logger.trace("getMessages");
		// logger.debug(req.session?"session "+ JSON.stringify(req.session,null,4) : "no session");
		var pg = parseInt(req.params.pg,10) || 1;
		var offset = parseInt(req.params.offset,10) || 20;
		var filter = req.params.filter;

		// console.log(req.Session);
		queue.getMessages( pg, offset, filter)
			.then( function(list) {
				res.send(list);
				next();
			})
			.catch( function(err) {
				res.send(err.code || 400, err);
				next(false);
			});
	},
	
	delMessage: function(req, res, next) {
		logger.trace("delMessage");
		
		queue.del( req.params.msgID )
			.then( function(list) {
				res.send(200, { code:200, message:"message deleted"});
				next();
			})
			.catch( function(err) {
				res.send(err.code || 400, err);
				next(false);
			});
	},
	
	delAllMessages: function(req, res, next) {
		logger.trace("delAllMessage");

		// console.log(req.Session);
		queue.clear()
			.then( function(list) {
				res.send(200, { code:200, message:"all messages deleted"});
				next();
			})
			.catch( function(err) {
				res.send(err.code || 400, err);
				next(false);
			});
	},

	reset: function(req, res, next) {
		logger.trace("reset");

		// console.log(req.Session);
		queue.reset()
			.then( function(list) {
				res.send(200, { code:200, message:"reset of the queue"});
				next();
			})
			.catch( function(err) {
				res.send(err.code || 400, err);
				next(false);
			});
	}
}

module.exports = IQueue;