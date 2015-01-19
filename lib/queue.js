/**
 * @file queue.js
 * @module PhysioDOM_Queue
 */

/* jslint node:true */
"use strict";

var dbPromise = require("./dbPromise"),
	promise = require("rsvp").Promise,
	ObjectID = require("mongodb").ObjectID,
	messageSchema = require("./../schema/messageSchema"),
	moment = require("moment"),
	request = require("request"),
	Logger = require("logger");

var logger = new Logger("Queue");

function Queue( server ) {
	this.server = server;
	this.db = null;
	
	/**
	 * Connect to the database
	 * 
	 * @param uri
	 * @returns {promise}
	 */
	this.connect = function(uri) {
		var that = this;
		return new promise( function(resolve, reject) {
			dbPromise.connect(uri)
				.then( function(dbClient) {
					that.db = dbClient;
					that.sendToSserver();
					resolve(that);
				});
		});
	};

	/**
	 * Close the connection to the database
	 */
	this.close = function() {
		this.db.close();
	};
	
	/**
	 * Check the schema of a beneficiary record
	 * 
	 * @param entry
	 * @returns {promise}
	 */
	function checkSchema( entry ) {
		return new promise( function(resolve, reject) {
			logger.trace("checkSchema");
			var check = messageSchema.validator.validate( entry, { "$ref":"/Message"} );
			if( check.errors.length ) {
				return reject( { code:405, message:"bad format", detail: check.errors } );
			} else {
				return resolve(entry);
			}
		});
	}
	
	
	this.addMsg = function( message ) {
		var that  = this;
		return new promise( function(resolve, reject) {
			logger.trace("addMsg");
			checkSchema(message)
				.then( function( message ) {
					message.datetime = moment.utc().toISOString();
					that.db.collection("messages").save(message, function(err,result) {
						if(err) {
							reject(err);
						} else {
							message._id = result.id;
							that.sendToSserver();
							resolve( message );
						}
					});
				})
				.catch( function(err) {
					reject(err);
				})
		});
	};
	
	this.getMessages = function( pg, offset, filter ) {
		var search = {}, filter = filter || "none";
		switch( filter ) {
			case "sent":
				search = { send: { $exists:1} };
				break;
			case "all":
				search = {};
				break;
			case "error":
				search = { send: { $exists:1}, code: 400 };
				break;
			default:
				search = { send: { $exists:0} };
		}
		var cursor = queue.db.collection("messages").find(search);
		var cursorSort = { datetime: -1 };
		cursor = cursor.sort( cursorSort );
		return dbPromise.getList(cursor, pg, offset);
	};
	
	
	
	this.del = function( msgID ) {
		var that = this;
		return new promise( function(resolve, reject) {
			logger.trace("del", msgID);
			that.db.collection("messages").remove( { _id: new ObjectID(msgID) }, function(err, nb) {
				if(err) {
					reject(err);
				} else {
					if( nb ) {
						resolve();
					} else {
						reject( { code:404, message:"message not found"})
					}
				}
			})
		});
	}
	
	this.clear = function( msgID ) {
		var that = this;
		return new promise( function(resolve, reject) {
			logger.trace("clear");
			that.db.collection("messages").remove( { send: { $exists:0} }, function(err, nb) {
				if(err) {
					reject(err);
				} else {
					resolve();
				}
			})
		});
	}
	
	function getDatabase( server, gateway ) {
		return new promise( function( resolve, reject) {
			logger.trace("getDatabase");
			request( server+"/restUrl.rest?appSri=plt.treedb.srv/rest&gateway="+gateway, function(err, resp, body) {
				if(err) {
					logger.warning("Erreur getting database for "+gateway);
					reject();
				} else {
					resolve(body.replace(/\"/g,''));
				}
			});
		});
	}
	
	function sendMsg( server, msg ) {
		return new promise( function(resolve, reject) {
			logger.trace("sendMsg",msg.gateway);
			getDatabase( server, msg.gateway )
				.then( function(database) {
					switch( msg.method) {
						case "POST":
							request( {
									url: server+database+"/database?gateway="+msg.gateway,
									method:"POST",
									headers: { "content-type":"text/plain"},
									body: JSON.stringify(msg.content)
								}, function(err, resp, body) {
									if( err || resp.statusCode === 500) {
										logger.warning("error 500 for gateway ",msg.gateway);
										reject(msg);
									} else {
										if( resp.statusCode === 400 ) {
											logger.warning("error 400 for gateway ",msg.gateway);
										}
										msg.send = moment.utc().toISOString();
										msg.code = resp.statusCode;
										resolve(msg);
									}
								}
							);
							break;
							break;
						case "DELETE":
							request( {
									url: server+database+"/database?gateway="+msg.gateway,
									method:"DELETE",
									headers: { "content-type":"text/plain"},
									body: JSON.stringify(msg.content)
								}, function(err, resp, body) {
									if( err ) {
										reject(msg);
									} else {
										if( resp.statusCode === 500 ) {
											logger.warning("error 500 for gateway ",msg.gateway);
											resolve(msg);
										} else {
											if( resp.statusCode === 400 ) {
												logger.warning("error 400 for gateway ",msg.gateway);
											}
											msg.send = moment.utc().toISOString();
											msg.code = resp.statusCode;
											resolve(msg);
										}
									}
								}
							);
							break;
						default:
							reject
					}
				})
				.catch( function(err) {
					resolve(msg) 
				});
		});
	};
	
	this.sendToSserver = function() {
		var that = this;
		logger.trace("sendToSserver");
		var cursor = queue.db.collection("messages").find({ send: { $exists:0 }}).sort( {datetime:1});
		dbPromise.getArray( cursor )
			.then( function(messages) {
				messages.forEach( function(message) {
					sendMsg(that.server, message)
						.then( function(message) {
							return new promise( function(resolve, reject) {
								if( !message.send) {
									resolve(message);
								} else {
									queue.db.collection("messages").save(message, function(err, res) {
										if(err) {
											reject(err);
										} else {
											resolve(message);
										}
									});
								}
							});
						});
				});
			});
	}
}

module.exports = Queue;