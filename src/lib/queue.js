/**
 @license
 Copyright (c) 2016 Telecom Sante
 This code may only be used under the CC BY-NC 4.0 style license found at https://creativecommons.org/licenses/by-nc/4.0/legalcode

 You are free to:

 Share — copy and redistribute the material in any medium or format
 Adapt — remix, transform, and build upon the material
 The licensor cannot revoke these freedoms as long as you follow the license terms.

 Under the following terms:

 Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made.
 You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.

 NonCommercial — You may not use the material for commercial purposes.

 No additional restrictions — You may not apply legal terms or technological measures that legally restrict others
 from doing anything the license permits.
 */

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

/**
 * Define the Queue object
 *
 * the configuration object must contains :
 *
 * the database uri, the url of the SServer, an admin key
 *
 * example :
 *
 * ~~~
 * {
 *     "mongouri": "mongodb://127.0.0.1/physioDOM_queue",
 *     "server":   "http://127.0.0.1:8443",
 *     "key":      "D9C7F19C-7588-4C39-91BB-FBFEFE1BE90A"
 * }
 * ~~~
 *
 * @param config configuration object
 * @constructor
 */
function Queue(config) {
  var check = configSchema.validator.validate(config, {"$ref": "/Config"});
  if (check.errors.length) {
    logger.emergency("config error", JSON.stringify(check.errors, "", 4));
    throw {code: 500, message: "bad configuration", detail: check.errors};
  }

  this.config = config;
  this.db = null;

  var _start = false;
  var _sending = false;
  var _new = false;
  var _delay = 100;
  var _nbSending = 0;
  var _nbNew = 0;
  var eventEmitter = new events.EventEmitter();

  /**
   * Connect to the database
   *
   * @returns {promise}
   */
  this.connect = function () {
    var that = this;

    return new promise(function (resolve, reject) {
      dbPromise.connect(that.config.mongouri)
        .then(function (dbClient) {
          that.db = dbClient;
          _start = true;
          // that.sendToSserver();
          resolve(that);
        });
    });
  };

  /**
   * Close the connection to the database
   */
  this.close = function () {
    this.db.close();
  };

  /**
   * return the status of the queue
   *
   * example :
   *
   * ~~~
   * {
	 *     start: true,          <- if true the queue is running
	 *     sending: false,       <- if true the queue is sending messages to SServer
	 *     new: false,           <- if true indicate that there's new message to push
	 *     count: {
	 *         sending: 0,       <- cont of sending messages
	 *         new: 0            <- count of new messages
	 *     }
	 * }
   * ~~~
   *
   * @returns {{start: boolean, sending: boolean, new: boolean, count: {sending: number, new: number}}}
   */
  this.status = function () {
    var status = {
      start  : _start,     // if false the queue doesn't send message
      sending: _sending,   // sending message to SServer
      new    : _new,       // while sending, indicate that there's other message to send
      "count": {
        sending: _nbSending,
        new    : _nbNew
      }
    };
    return status;
  };

  /**
   * Get the list of publishers
   *
   * @param key
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.getPublishers = function (key) {
    var that = this;
    return new promise(function (resolve, reject) {
      logger.trace("getPublishers");
      if (!key.hasOwnProperty("key") || key.key !== that.config.key) {
        reject({code: 403, message: "not authorized"});
      } else {
        var cursor = queue.db.collection("publisher").find({});
        dbPromise.getArray(cursor)
          .then(resolve);
      }
    });
  };

  /**
   * create a new publisher with the given key
   *
   * key could be any string, however it's recommended to use uuid
   * uuid could be generate thanks to `uuidgen`
   *
   * @param key
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.createPublisher = function (key) {
    var that = this;
    return new promise(function (resolve, reject) {
      if (!key.hasOwnProperty("key") || key.key !== that.config.key) {
        reject({code: 403, message: "not authorized"});
      } else {
        var publisher = {key: UUID.v4()};
        that.db.collection("publisher").save(publisher, function (err, result) {
          if (err) {
            reject({code: 500, message: "database error"});
          } else {
            resolve({key: publisher.key});
          }
        });
      }
    });
  };

  /**
   * revoke a publisher
   *
   * @param key
   * @param publisher
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.delPublisher = function (key, publisher) {
    var that = this;
    return new promise(function (resolve, reject) {
      if (!key.hasOwnProperty("key") || key.key !== that.config.key) {
        reject({code: 403, message: "not authorized"});
      } else {
        that.db.collection("publisher").remove({key: publisher}, function (err, result) {
          if (err) {
            reject({code: 500, message: "database error"});
          } else {
            if (result > 0) {
              resolve({key: publisher.key});
            } else {
              reject({code: 404, message: "publisher not found"});
            }
          }
        });
      }
    });
  };

  /**
   * start the queue
   *
   * @param key  the admin key
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.start = function (key) {
    var that = this;
    return new promise(function (resolve, reject) {
      if (!key.hasOwnProperty("key") || key.key !== that.config.key) {
        reject({code: 403, message: "not authorized"});
      } else {
        _start = true;
        that.sendToSserver();
        resolve(that.status());
      }
    });
  };

  /**
   * stop the queue
   *
   * while stopped only transfert to the SServer is stopped,
   * messages could be still pushed to the queue, they will be
   * sent when the queue is restarted.
   *
   * @param key
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.stop = function (key) {
    var that = this;
    _start = false;
    var flag = _sending;

    function stopQueue() {
      return new promise(function (resolve, reject) {
        logger.info("queue is stopped ");
        resolve(that.status());
      });
    }

    return new promise(function (resolve, reject) {
      if (!key.hasOwnProperty("key") || key.key !== that.config.key) {
        reject({code: 403, message: "not authorized"});
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

  /**
   * reset the queue
   *
   * this operation will drop all messages of the queue and in the database
   *
   * @param key
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.reset = function (key) {
    var that = this;

    function dropMessages() {
      return new promise(function (resolve, reject) {
        that.db.collection("messages").drop(function (err, res) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    return new promise(function (resolve, reject) {
      logger.trace("reset", _start);
      if (!key.hasOwnProperty("key") || key.key !== that.config.key) {
        reject({code: 403, message: "not authorized"});
      } else {
        if (_start) {
          logger.trace("reset start");
          that.stop(key)
            .then(function () {
              return dropMessages();
            })
            .then(function () {
              return that.start(key);
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
  function checkSchema(entry) {
    return new promise(function (resolve, reject) {
      logger.trace("checkSchema");
      var check = messageSchema.validator.validate(entry, {"$ref": "/Message"});
      if (check.errors.length) {
        return reject({code: 405, message: "bad format", detail: check.errors});
      } else {
        return resolve(entry);
      }
    });
  }

  /**
   * add a new message to the queue
   *
   * @param message
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.addMsg = function (message) {
    var that = this;

    function resetStatus(msg) {
      var search = {subject: msg.subject};
      var update = {subject: msg.subject, server: msg.server, status: null};

      return new promise(function (resolve, reject) {
        if (!msg.init) {
          resolve(msg);
        } else {
          that.getHHR(msg.subject)
            .then(function (result) {
              logger.trace("reset status");
              that.db.collection('hhr').update(search, update, {upsert: true}, function (err, doc) {
                if (err) {
                  logger.emergency("Database error");
                  throw err;
                } else {
                  resolve(msg);
                }
              });
            });
        }
      });
    }

    return new promise(function (resolve, reject) {
      logger.trace("addMsg", message);
      checkSchema(message)
        .then(function (message) {
          message.datetime = moment.utc().toISOString();
          return resetStatus(message)
        })
        .then(function () {
          that.db.collection("messages").save(message, function (err, result) {
            if (err) {
              console.log('database error');
              reject(err);
            } else {
              message._id = result.id;
              that.sendToSserver();
              resolve(message);
            }
          });
        })
        .catch(function (err) {
          console.log(err);
          reject(err);
        })
    });
  };

  /**
   * get the list of messages
   *
   * by default send the list of message that are not yet push to SServer
   *
   * the list could be filtered by the `filter` param
   *
   *   - "all" : send back all messages
   *   - "sent" : list only sended messages
   *   - "error" : list of messages that received an error ( Typically 400 )
   *
   * @param pg         the page number ( 1 is the first page )
   * @param offset     number of items per page ( 20 by default )
   * @param filter     the filter see above
   * @returns {*}
   */
  this.getMessages = function (pg, offset, filter) {
    var search = {}, filter = filter || "none";
    switch (filter) {
      case "sent":
        search = {send: {$exists: 1}};
        break;
      case "all":
        search = {};
        break;
      case "error":
        search = {send: {$exists: 1}, code: 400};
        break;
      default:
        search = {send: {$exists: 0}};
    }
    var cursor = queue.db.collection("messages").find(search);
    var cursorSort = {datetime: -1};
    cursor = cursor.sort(cursorSort);
    return dbPromise.getList(cursor, pg, offset);
  };

  /**
   * delete a message from the queue or database
   *
   * @param msgID
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.del = function (msgID) {
    var that = this;
    return new promise(function (resolve, reject) {
      logger.trace("del", msgID);
      that.db.collection("messages").remove({_id: new ObjectID(msgID)}, function (err, nb) {
        if (err) {
          reject(err);
        } else {
          if (nb) {
            resolve();
          } else {
            reject({code: 404, message: "message not found"})
          }
        }
      })
    });
  };

  /**
   * clear the queue
   *
   * remove all messages not yet pushed to SServer
   *
   * @param msgID
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.clear = function (msgID) {
    var that = this;
    var flag = _sending;

    function clearQueue() {
      return new promise(function (resolve, reject) {
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

    return new promise(function (resolve, reject) {
      if (flag) {
        that.stop();
        eventEmitter.once("stop", function () {
          clearQueue().then(resolve)
        });
      } else {
        return clearQueue();
      }
    });
  };

  function getDatabase(server, gateway, appSri) {
    return new promise(function (resolve, reject) {
      var url = server + "/restUrl.rest?appSri=" + appSri + "&gateway=" + gateway;
      logger.trace("getDatabase", url);
      request(url, function (err, resp, body) {
        if (err) {
          logger.warning("Erreur getting database for " + gateway);
          reject();
        } else {
          var database = body.replace(/\"/g, '');
          logger.debug("status", resp.statusCode);
          if (resp.statusCode === 200 && database.length) {
            resolve(database);
          } else {
            reject(resp.statusCode);
          }

        }
      });
    });
  };

  /**
   * Push a message to SServer
   *
   * this method will ask first for the gateway of the given biomaster
   * then if the gateway is defined push the message.
   *
   * @param server
   * @param msg
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.sendMsg = function (server, msg) {
    var that = this;
    return new promise(function (resolve, reject) {
      logger.trace("sendMsg", msg.gateway);
      getDatabase(server, msg.gateway, that.config.appSri)
        .then(function (database) {
          switch (msg.method) {
            case "POST":
              request({
                  url    : server + database + "/database?gatseway=" + msg.gateway,
                  method : "POST",
                  headers: {"content-type": "text/plain"},
                  body   : JSON.stringify(msg.content)
                }, function (err, resp, body) {
                  if (err || resp.statusCode === 500) {
                    logger.warning("error 500 for gateway ", msg.gateway);
                    console.log("bad format ?", JSON.stringify(msg.content));
                    msg.send = moment.utc().toISOString();
                    msg.code = err || resp.statusCode;
                    reject(msg);
                  } else {
                    switch (resp.statusCode) {
                      case 404:
                      case 400:
                        logger.warning("error " + req.statusCode + " for gateway ", msg.gateway);
                        that.returnStatus(msg.server, msg.subject, false);
                        msg.send = moment.utc().toISOString();
                        msg.code = resp.statusCode;
                        resolve(msg);
                        break;
                      case 200:
                        that.returnStatus(msg.server, msg.subject, true);
                        msg.send = moment.utc().toISOString();
                        msg.code = resp.statusCode;
                        resolve(msg);
                        break;
                      default:
                        logger.warning("error " + req.statusCode + " for gateway ", msg.gateway);
                        reject(msg);
                    }
                  }
                }
              );
              break;
            case "DELETE":
              request({
                  url    : server + database + "/database?gateway=" + msg.gateway,
                  method : "DELETE",
                  headers: {"content-type": "text/plain"},
                  body   : JSON.stringify(msg.content)
                }, function (err, resp, body) {
                  if (err) {
                    reject(msg);
                  } else {
                    if (resp.statusCode === 500) {
                      logger.warning("error 500 for gateway ", msg.gateway);
                      msg.send = moment.utc().toISOString();
                      msg.code = err || resp.statusCode;
                      resolve(msg);
                    } else {
                      switch (resp.statusCode) {
                        case 404:
                        case 400:
                          logger.warning("error " + resp.statusCode + " for gateway ", msg.gateway);
                          that.returnStatus(msg.server, msg.subject, false);
                          msg.send = moment.utc().toISOString();
                          msg.code = resp.statusCode;
                          resolve(msg);
                          break;
                        case 200:
                          that.returnStatus(msg.server, msg.subject, true);
                          msg.send = moment.utc().toISOString();
                          msg.code = resp.statusCode;
                          resolve(msg);
                          break;
                        default:
                          logger.warning("error " + req.statusCode + " for gateway ", msg.gateway);
                          reject(msg);
                      }
                    }
                  }
                }
              );
              break;
            default:
              reject(msg);
          }
        })
        .catch(function (statusCode) {
          switch (statusCode) {
            case 200:
              logger.alert("no database for gateway " + msg.gateway);
              reject();
              break;
            case 400:
            case 404:
              logger.alert("get database error for gateway " + msg.gateway + " statuscode : ", statusCode);
              reject(msg);
              break;
            default :
              logger.warning("get database error for " + msg.gateway, statusCode);
              //if( msg.init ) {
              //	reject( )
              //} else {
              resolve(msg);
            //}
          }
        });
    });
  };

  /**
   * Search in the database the instance of HHR-pro for the given hhr identifier
   *
   * @param hhr
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.getHHR = function (hhr) {
    logger.trace("getHHR", hhr);
    var that = this;

    return new promise(function (resolve, reject) {
      var search = {subject: hhr};
      that.db.collection('hhr').findOne(search, function (err, result) {
        if (err) {
          logger.emergency("Database error");
          throw err;
        }
        if (result) {
          resolve(result);
        } else {
          logger.warning("hhr " + hhr + " not found");
          resolve(false);
        }
      });
    });
  };

  /**
   * return the status of the biomaster to the HHR-pro instance
   *
   * @param server
   * @param subject
   * @param status
   */
  this.returnStatus = function (server, subject, status) {
    logger.trace("returnStatus", {subject: subject, status: status, server: server});

    var that = this;
    var search = {subject: subject};
    var update = {subject: subject, server: server, status: status};

    this.getHHR(subject)
      .then(function (result) {
        if (result && result.status === status) {
          logger.info("status doesn't change");
          return;
        } else {
          that.db.collection('hhr').update(search, update, {upsert: true}, function (err, doc) {
            if (err) {
              logger.error("Database error");
            } else {
              logger.info("status updated ", doc);
              request({
                  url               : server + "/api/queue/status",
                  method            : "POST",
                  headers           : {"content-type": "text/plain"},
                  rejectUnauthorized: false,
                  body              : JSON.stringify({subject: subject, status: status})
                }, function (err, resp, body) {
                  if (err) {
                    logger.warning("-> error", err);
                  } else {
                    if (resp.statusCode !== 200) {
                      logger.warning("hhr pro ", server, resp.statusCode);
                    }
                  }
                }
              );
            }
          });
        }
      });
  };

  /**
   * count the number of messages not yet pushed to SServer
   *
   * @returns {*}
   */
  this.countInQueue = function () {
    var cursor = this.db.collection("messages").find({send: {$exists: 0}}).sort({datetime: 1});
    return dbPromise.count(cursor);
  };

  /**
   * the main loop of the queue
   *
   * This method push a message to SServer as soon as a message is received from a HHR-pro instance
   *
   * while the queue is stopped, messages are in waiting, then when the queue is started the loop send
   * all remaining messages to SServer.
   *
   * this loop is started at the launch of the service and runs untill the end of the service
   */
  this.sendToSserver = function () {
    var that = this;
    logger.trace("sendToSserver");
    that.countInQueue()
      .then(function (count) {
        // logger.trace(count, _start, _sending, _nbNew )
        if (!_start || _sending) {
          _new = (count > 0);
          _nbNew++;
          if (!_sending) {
            _nbSending = 0;
            _nbNew = count;
          }
          console.log("already sending");
          return;
        }
        _new = false;
        _nbNew = 0;
        if (count === 0) {
          _sending = false;
          console.log("count = 0");
          return;
        }
        logger.debug(count + " messages to send");
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
                _nbNew += count - indx;
                _nbSending = 0;
                eventEmitter.emit("stop");
                console.log("stop");
                return;
              }
              var message = messages[indx];
              that.sendMsg(that.config.server, message)
                .then(function (message) {
                  if (message.send === undefined) {
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
                  if (!message.init) {
                    logger.trace("bad message in queue, remove it");
                    // queue.db.collection("messages").remove(message, function (err, res) {
                    queue.db.collection("messages").save(message, function (err, res) {
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
                  } else {
                    console.log(indx, count);
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
            })();
          });
      })
      .catch(function (err) {
        console.log(err);
        if (err.stack) {
          console.log(err.stack);
        }
      });
  };

  /**
   * try resend received messages to HHR-Pro instance
   */
  this.sendToHHRPro = function () {
    logger.trace("sendToHHRPro");
    var that = this;
    // found all received messages that are not pushed to HHRPro
    var search = {
      'transfered': {'$exists': 0},
      datetime    : {'$lt': moment().subtract(that.config.retry, 'm').toISOString()}
    };
    that.db.collection("received").find(search).toArray(function (err, results) {
      results.forEach(function (item) {
        // resend the message;
        that.relayMsg(item.type, item.message, item);
      });
    })
  };

  /**
   * relays received messages from the SServer to the correct HHR-pro instance
   *
   * @param type
   * @param message
   * @returns {$$rsvp$promise$$default|RSVP.Promise|*|l|Dn}
   */
  this.relayMsg = function (type, message) {
    logger.trace("relayMsg");
    var that = this;

    function saveReceivedMessage(record) {
      logger.trace("saveReceivedMessage");
      return new promise(function (resolve, reject) {
        that.db.collection("received").save(record, function (err, doc) {
          resolve(doc);
        });
      });
    }

    /**
     * Mark a message sent to HHR-pro
     *
     * @param record
     * @returns {*|RSVP.Promise}
     */
    function updateReceivedMessage(record) {
      logger.trace("updateReceivedMessage");
      return new promise(function (resolve, reject) {
        record.transfered = true;
        record.transfertDate = moment().toISOString();
        that.db.collection("received").save(record, function (err, doc) {
          if (err) {
            logger.emergency("database error");
            throw err;
          }
          resolve(record);
        });
      });
    }

    function transmitMsg(server, record) {
      logger.trace("transmitMsg", server);
      return new promise(function (resolve, reject) {
        // remove timeout
        // timeout           : 10000,
        request({
            url               : server + "/api/queue/received",
            method            : "POST",
            headers           : {"content-type": "text/plain"},
            rejectUnauthorized: false,
            body              : JSON.stringify(record)
          }, function (err, resp, body) {
            if (err) {
              logger.warning("-> error", err);
              reject(err);
            } else {
              if (resp.statusCode !== 200) {
                logger.warning("hhrpro " + server, resp.statusCode);
                reject({code: resp.statusCode, message: body});
              } else {
                resolve(record);
              }
            }
          }
        );
      })
    }

    function checkSchema(type, message) {
      return new promise(function (resolve, reject) {
        logger.trace("relayMsg checkSchema ", type);
        var schema;

        switch (type) {
          case "messageRead":
            schema = {"$ref": "/messageRead"};
            break;
          case "measures":
            schema = {"$ref": "/MeasuresMessage"};
            break;
          case "symptomsSelf":
          case"symptoms":
            schema = {"$ref": "/SymptomsMessage"};
            break;
          default :
            schema = {"$ref": "/ReceivedMessage"};
        }

        var check = messageSchema.validator.validate(message, schema);
        if (check.errors.length) {
          logger.alert("received messages schema error ");
          logger.warning(check.errors);
          return reject({error: "bad format", detail: check.errors});
        } else {
          return resolve(message);
        }
      });
    }

    return new promise(function (resolve, reject) {
      var record = {
        datetime: moment().toISOString(),
        type    : type,
        message : message
      };

      saveReceivedMessage(record)
        .then(function () {
          return checkSchema(type, message)
        })
        .then(function (message) {
          return that.getHHR(record.message.hhr);
        })
        .then(function (hhr) {
          if (!hhr) {
            logger.warning("[relayMsg] unknown hhr");
            reject({code: 400, message: "[relayMsg] unknown hhr"});
          } else {
            return transmitMsg(hhr.server, record);
          }
        })
        .then(function (record) {
          return updateReceivedMessage(record);
        })
        .then(resolve)
        .catch(function (err) {
          if (err.code === 'ETIMEDOUT') {
            reject({code: 400, message: "[relayMsg] timeout"});
          } else {
            reject(err);
          }
        });
    });
  }
}

module.exports = Queue;