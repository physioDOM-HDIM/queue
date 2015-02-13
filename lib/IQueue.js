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
	/**
	 * get the status of the queue
	 *
	 * @param req
	 * @param res
	 * @param next
	 * @returns {*}
	 */
	status: function (req, res, next) {
		res.send(queue.status());
		return next();
	},

	/**
	 * treat start, stop, reset commands
	 * @param req
	 * @param res
	 * @param next
	 * @returns {*}
	 */
	command: function (req, res, next) {
		try {
			var msg = JSON.parse(req.body);
			switch (req.params.cmd) {
				case "start":
					queue.start(msg)
						.then(function (status) {
							res.send(status);
							next();
						})
						.catch(function (err) {
							res.send(500 || err.code, err);
							next(false);
						});
					break;
				case "stop":
					queue.stop(msg)
						.then(function (status) {
							res.send(status);
							next();
						})
						.catch(function (err) {
							res.send(500 || err.code, err);
							next(false);
						});
					break;
				case "reset":
					logger.trace("reset");
					queue.reset(msg)
						.then(function (list) {
							res.send(200, {code: 200, message: "reset of the queue"});
							next();
						})
						.catch(function (err) {
							res.send(500 || err.code, err);
							next(false);
						});
					break;
				default:
					res.send(405, {code: 405, message: "unknown command"});
					return next(false);
			}
		} catch (err) {
			res.send(403, {code: 403, message: "unauthorized"});
			next(false);
		}
	},

	/**
	 * Get the list of publishers
	 *
	 * @param req
	 * @param res
	 * @param next
	 */
	getPublishers: function (req, res, next) {
		try {
			var msg = JSON.parse(req.body);
			queue.getPublishers(msg)
				.then(function (publishers) {
					res.send(publishers);
					next();
				})
				.catch(function (err) {
					res.send(500 || err.code, err);
					next(false);
				})
		} catch (err) {
			res.send(405, {code: 405, message: "bad id"});
			next(false);
		}
	},

	/**
	 * Create a new publisher
	 *
	 * @param req
	 * @param res
	 * @param next
	 */
	createPublisher: function (req, res, next) {
		try {
			var msg = JSON.parse(req.body);
			queue.createPublisher(msg)
				.then(function (key) {
					res.send(key);
					next();
				})
		} catch (err) {
			res.send(403, {code: 403, message: "unauthorized"});
			next(false);
		}
	},

	/**
	 * revoke a publisher ( delete )
	 * @param req
	 * @param res
	 * @param next
	 */
	delPublisher: function (req, res, next) {
		try {
			var msg = JSON.parse(req.body);
			queue.delPublisher(msg, req.params.publisherID)
				.then(function () {
					res.send(200, {code: 200, "message": "publisher revoked"});
					next();
				})
				.catch(function (err) {
					res.send(500 || err.code, err);
					next();
				})
		} catch (err) {
			res.send(403, {code: 403, message: "unauthorized"});
			next(false);
		}
	},

	/**
	 * Push a message to the queue
	 *
	 * @param req
	 * @param res
	 * @param next
	 * @returns {*}
	 */
	pushMessage: function (req, res, next) {
		var message;
		if (!req.body) {
			res.send(400, "no message");
			return next(false);
		} else {
			try {
				message = JSON.parse(req.body);
				queue.addMsg(message)
					.then(function (message) {
						res.send(200, {code: 200, message: "message added to queue"});
						return next;
					})
					.catch(function (err) {
						console.log(err);
						res.send(500 || err.code, err);
						return next(false);
					})
			} catch (err) {
				res.send(400, "not a json message");
				return next(false);
			}
		}
	},

	/**
	 * Get the list of messages
	 *
	 * @param req
	 * @param res
	 * @param next
	 */
	getMessages: function (req, res, next) {
		logger.trace("getMessages");
		// logger.debug(req.session?"session "+ JSON.stringify(req.session,null,4) : "no session");
		var pg = parseInt(req.params.pg, 10) || 1;
		var offset = parseInt(req.params.offset, 10) || 20;
		var filter = req.params.filter;
		
		queue.getMessages(pg, offset, filter)
			.then(function (list) {
				res.send(list);
				next();
			})
			.catch(function (err) {
				res.send(err.code || 400, err);
				next(false);
			});
	},

	/**
	 * remove a message from the queue
	 *
	 * @param req
	 * @param res
	 * @param next
	 */
	delMessage: function (req, res, next) {
		logger.trace("delMessage");

		queue.del(req.params.msgID)
			.then(function (list) {
				res.send(200, {code: 200, message: "message deleted"});
				next();
			})
			.catch(function (err) {
				res.send(err.code || 400, err);
				next(false);
			});
	},

	/**
	 * remove all pending messages
	 *
	 * @param req
	 * @param res
	 * @param next
	 */
	delAllMessages: function (req, res, next) {
		logger.trace("delAllMessage");

		// console.log(req.Session);
		queue.clear()
			.then(function (list) {
				res.send(200, {code: 200, message: "all messages deleted"});
				next();
			})
			.catch(function (err) {
				res.send(err.code || 400, err);
				next(false);
			});
	},
	
	/**
	 * POST messages from the SServer
	 *
	 * the message is saved in the database ( collection received )
	 * then the message is relayed to the right instance of HHR-pro
	 *
	 * @param req
	 * @param res
	 * @param next
	 * @returns {*}
	 */
	receivedMsg: function (req, res, next) {
		logger.trace("receivedMsg");
		if (["messageRead", "symptomsSelf", "symptoms", "measures"].indexOf(req.params.msgType) === -1) {
			logger.warning("unknown message type", req.params.msgType);
			res.send(404, {code: 404, message: "unknown message type"});
			return next(false);
		}
		
		try {
			var message = JSON.parse(req.body.toString());
			queue.relayMsg(req.params.msgType, message)
				.then(function (record) {
					res.send(200, record);
					next();
				})
				.catch(function (err) {
					res.send(err.code || 400, err);
					next(false);
				});
		} catch (err) {
			logger.alert("bad body format", req.params.msgType);
			res.send(400, {code: 400, message: "bad body format"});
			return next(false);
		}
	}

}

module.exports = IQueue;