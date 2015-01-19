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
	}
}

module.exports = IQueue;