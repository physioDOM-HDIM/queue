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
	configSchema = require("./../schema/configSchema"),
	moment = require("moment"),
	request = require("request"),
	events = require("events"),
	Logger = require("logger"),
	UUID = require("node-uuid");

var logger = new Logger("Queue");

function Queue( config ) {
	var check = configSchema.validator.validate( config, { "$ref":"/Config"} );
	if( check.errors.length ) {
		throw { code:500, message:"bad configuration", detail: check.errors };
	}
	
	this.config = config;
	this.db = null;
	
	var _start     = false;
	var _sending   = false;
	var _new       = false;
	var _delay     = 1000;
	var _nbSending = 0;
	var _nbNew     = 0;
	var eventEmitter = new events.EventEmitter();
	
	/**
	 * Connect to the database
	 * 
	 * @param uri
	 * @returns {promise}
	 */
	this.connect = function() {
		var that = this;
		
		return new promise( function(resolve, reject) {
			dbPromise.connect(that.config.mongouri)
				.then( function(dbClient) {
					that.db = dbClient;
					_start = true;
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
	
	this.status = function() {
		var status = {
			start   : _start,     // if false the queue doesn't send message
			sending : _sending,   // sending message to SServer
			new     : _new,       // while sending, indicate that there's other message to send
			"count"   : {
					sending: _nbSending,
					new    : _nbNew
				}
			};
		return status;
	};
	
	this.getPublishers = function( key ) {
		var that = this;
		return new promise( function(resolve, reject) {
			logger.trace("getPublishers");
			if (!key.hasOwnProperty("key") || key.key !== that.config.key) {
				console.log("reject");
				reject({code: 403, message: "not authorized"});
			} else {
				var cursor = queue.db.collection("publisher").find({});
				dbPromise.getArray(cursor)
					.then( resolve );
			}
		});
	};
	
	this.createPublisher = function( key ) {
		var that = this;
		return new promise( function(resolve, reject) {
			if ( !key.hasOwnProperty("key") || key.key !== that.config.key) {
				reject({ code:403, message:"not authorized"});
			} else {
				var publisher = { key:UUID.v4() };
				that.db.collection("publisher").save(publisher, function(err,result) {
					if (err) {
						reject({code: 500, message: "database error"});
					} else {
						resolve( { key: publisher.key } );
					}
				});
			}
		});
	};

	this.delPublisher = function( key, publisher ) {
		var that = this;
		return new promise( function(resolve, reject) {
			if ( !key.hasOwnProperty("key") || key.key !== that.config.key) {
				reject({ code:403, message:"not authorized"});
			} else {
				that.db.collection("publisher").remove( { key : publisher }, function(err,result) {
					if (err) {
						reject({code: 500, message: "database error"});
					} else {
						if(result > 0) {
							resolve({key: publisher.key});
						} else {
							reject( {code:404, message:"publisher not found"} );
						}
					}
				});
			}
		});
	};
	
	this.start = function( key ) {
		var that = this;
		return new promise( function(resolve, reject) {
			if ( !key.hasOwnProperty("key") || key.key !== that.config.key) {
				reject({ code:403, message:"not authorized"});
			} else {
				_start = true;
				that.sendToSserver();
				resolve(that.status());
			}
		});
	};
	
	this.stop = function( key ) {
		var that = this;
		_start = false;
		var flag = _sending;

		function stopQueue() {
			return new promise( function(resolve, reject) {
				logger.info( "queue is stopped ");
				resolve(that.status());
			});
		}

		return new promise( function(resolve, reject) {
			if ( !key.hasOwnProperty("key") || key.key !== that.config.key) {
				reject({ code:403, message:"not authorized"});
			} else {
				if (flag) {
					eventEmitter.once("stop", function () {
						stopQueue()
							.then(function (status) {
								resolve(status);
							});
					});
				} else {
					stopQueue()
						.then(function (status) {
							resolve(status);
						});
				}
			}
		});
	};

	this.reset = function( key ) {
		var that = this;
		
		function dropMessages() {
			return new promise( function(resolve, reject) {
				that.db.collection("messages").drop(function (err, res) {
					if(err) {
						reject(err);
					} else {
						resolve();
					}
				});
			});
		}
		
		return new promise( function(resolve, reject) {
			logger.trace("reset", _start );
			if ( !key.hasOwnProperty("key") || key.key !== that.config.key) {
				reject({ code:403, message:"not authorized"});
			} else {
				console.log( "start", _start);
				if (_start) {
					logger.trace("reset start");
					that.stop( key )
						.then(function () {
							return dropMessages();
						})
						.then(function () {
							return that.start( key );
						})
						.then(resolve);
				} else {
					logger.trace("reset stop");
					dropMessages()
						.then(resolve);
				}
			}
		});
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
			logger.trace("addMsg", message);
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
	};
	
	this.clear = function( msgID ) {
		var that = this;
		var flag = _sending;
		
		function clearQueue() {
			return new promise( function(resolve, reject) {
				logger.trace("clear");
				that.db.collection("messages").remove({send: {'$exists': 0}}, function (err, nb) {
					if (err) {
						reject(err);
					} else {
						_new = false;
						_nbNew = 0;
						that.start();
						resolve();
					}
				});
			});
		}
		
		return new promise( function(resolve, reject) {
			if( flag ) {
				that.stop();
				eventEmitter.once("stop", function() { clearQueue().then(resolve) } );
			} else {
				return clearQueue();
			}
		});
	};
	
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
	};
	
	this.sendMsg = function( server, msg ) {
		var that = this;
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
											that.returnStatus( msg.server, msg.subject, false );
										} else {
											that.returnStatus( msg.server, msg.subject, true );
										}
										msg.send = moment.utc().toISOString();
										msg.code = resp.statusCode;
										resolve(msg);
									}
								}
							);
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
												that.returnStatus( msg.server, msg.subject, false );
											} else {
												that.returnStatus( msg.server, msg.subject, true );
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
							reject(msg);
					}
				})
				.catch( function(err) {
					resolve(msg);
				});
		});
	};
	
	this.returnStatus = function( server, subject, status ) {
		logger.trace("returnStatus", { subject:subject, status:status, server: server } );
		
		var search = { subject:subject };
		var update = { subject:subject, server:server, status:status };
		this.db.collection('hhr').findOne( search, function (err, result) {
			logger.debug("status find ", result );
			if (result && result.status === status) {
				return;
			} else {
				this.db.collection('hhr').update(search, update, {upsert: true}, function (err, doc) {
					if (err) {
						logger.error("Database error");
					} else {
						logger.info("status updated ", doc);
						request({
								url               : 'https://' + server + "/api/queue/status",
								method            : "POST",
								headers           : {"content-type": "text/plain"},
								rejectUnauthorized: false,
								body              : JSON.stringify({subject: subject, status: status})
							}, function (err, resp, body) {
								if (err) {
									logger.warning("-> error", err);
								} else {
									if (resp.statusCode !== 200) {
										logger.warning("hhr pro ", gateway, resp.statusCode);
									}
								}
							}
						);
					}
				});
			}
		});
	}
	
	this.countInQueue= function() {
		var cursor = this.db.collection("messages").find({ send: { $exists:0 }}).sort( {datetime:1});
		return dbPromise.count(cursor);
	};
	
	this.sendToSserver = function() {
		var that = this;
		logger.trace("sendToSserver");
		that.countInQueue()
			.then( function(count) {
				if (!_start || _sending) {
					_new   = (count > 0);
					_nbNew++ ;
					if(!_sending) {
						_nbSending = 0;
						_nbNew = count;
					}
					return;
				}
				_new = false;
				_nbNew = 0;
				if( count === 0 ) {
					_sending = false;
					return;
				}
				_sending = true;
				_nbSending = count;
				var cursor = that.db.collection("messages").find({send: {$exists: 0}}).sort({datetime: 1});
				dbPromise.getArray(cursor)
					.then(function (messages) {
						var count = messages.length;
						var indx = 0;

						(function sendMessage() {
							if (!_start) {
								// stop the queue
								_sending = false;
								_new = true;
								_nbNew+= count - indx;
								_nbSending = 0;
								eventEmitter.emit("stop");
								return;
							}
							var message = messages[indx];
							that.sendMsg(that.config.server, message)
								.then(function (message) {
										if ( message.send === undefined ) {
											if (++indx !== count) {
												_nbSending = count - indx;
												setTimeout(sendMessage, _delay);
											} else {
												_sending = false;
												_nbSending = 0;
												if (_new) {
													that.sendToSserver();
												}
											}
										} else {
											logger.trace("mark the message sent");
											queue.db.collection("messages").save(message, function (err, res) {
												if (err) {
													_start = false;
													_sending = false;
												} else {
													if (++indx !== count) {
														_nbSending = count - indx;
														setTimeout(sendMessage, _delay);
													} else {
														_sending = false;
														_nbSending = 0;
														if (_new) {
															that.sendToSserver();
														}
													}
												}
											});
										}
								})
								.catch(function (message) {
										// bad message in queue, remove it
										queue.db.collection("messages").remove(message, function (err, res) {
											if (err) {
												_start = false;
												_sending = false;
												reject(err);
											} else {
												if (++indx !== count) {
													_nbSending = count - indx;
													setTimeout(sendMessage, _delay);
												} else {
													_sending = false;
													_nbSending = 0;
													if (_new) {
														that.sendToSserver();
													}
												}
											}
										});
								});
						})();
					});
			});
	};
}

module.exports = Queue;