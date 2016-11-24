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

/* jslint node:true */
"use strict";

var MongoClient = require("mongodb").MongoClient,
  promise = require("rsvp").Promise;


module.exports = {

  /**
   * connect to the database
   * the database to connect is given by an uri
   * ex : "mongodb://127.0.0.1/physioDOM"
   *
   * @param uri
   * @returns {promise}
   */
  connect: function (uri) {
    return new promise(function (resolve, reject) {
      MongoClient.connect(uri, function (err, dbClient) {
        if (err) {
          reject(err);
        } else {
          resolve(dbClient);
        }
      });
    });
  },

  count: function (cursor) {
    return new promise(function (resolve, reject) {
      cursor.count(function (err, count) {
        resolve(count);
      });
    });
  },

  getList: function (cursor, pg, offset) {
    var that = this;
    return new promise(function (resolve, reject) {
      that.count(cursor)
        .then(function (nb) {
          var list = {nb: nb, pg: pg || 1, offset: offset || 20, items: []};
          cursor.skip((list.pg - 1) * list.offset).limit(list.offset).toArray(function (err, results) {
            if (err) {
              reject(err);
            } else {
              list.items = results;
              resolve(list);
            }
          });
        });
    });
  },

  getArray: function (cursor) {
    var that = this;
    return new promise(function (resolve, reject) {
      cursor.toArray(function (err, results) {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  },

  findOne: function (db, collectionName, criteria, projection) {
    return new promise(function (resolve, reject) {
      db.collection(collectionName).findOne(criteria, projection, function (err, doc) {
        if (err) {
          throw err;
        }
        resolve(doc);
      });
    });
  },

  nextObject: function (cursor) {
    var that = this;
    return new promise(function (resolve, reject) {
      cursor.nextObject(function (err, result) {
        if (err) {
          reject(err);
        } else {
          if (result) {
            resolve(result);
          } else {
            reject();
          }
        }
      });
    });
  }
};