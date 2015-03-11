/* jshint node:true */
'use strict';

var util = require('util');
var crypto = require('crypto');
var LocalStrategy = require('passport-local').Strategy;
var BadRequestError = require('./badrequesterror');

module.exports = function (schema, options) {
  options = options || {};
  options.saltlen = options.saltlen || 32;
  options.iterations = options.iterations || 25000;
  options.keylen = options.keylen || 512;
  options.encoding = options.encoding || 'hex';

  // Populate field names with defaults if not set
  options.usernameField = options.usernameField || 'username';
  options.usernameUnique = options.usernameUnique === undefined ? true : options.usernameUnique;

  options.emailField = options.emailField || 'email';

  // option to convert username to lowercase when finding
  options.usernameLowerCase = options.usernameLowerCase || false;

  options.hashField = options.hashField || 'hash';
  options.saltField = options.saltField || 'salt';

  if (options.limitAttempts) {
    options.lastLoginField = options.lastLoginField || 'last';
    options.attemptsField = options.attemptsField || 'attempts';
    options.interval = options.interval || 100; // 100 ms
    options.maxInterval = options.maxInterval || 300000; // 5 min
  }

  options.incorrectPasswordError = options.incorrectPasswordError || 'Incorrect password';
  options.incorrectUsernameError = options.incorrectUsernameError || 'Incorrect %s';
  options.missingUsernameError = options.missingUsernameError || 'Field %s is not set';
  options.missingEmailError = options.missingEmailError || 'Email is missing';
  options.missingPasswordError = options.missingPasswordError || 'Password argument not set!';
  options.userExistsError = options.userExistsError || 'User already exists with %s %s';
  options.noSaltValueStoredError = options.noSaltValueStoredError || 'Authentication not possible. No salt value stored in mongodb collection!';
  options.attemptTooSoonError = options.attemptTooSoonError || 'Login attempted too soon after previous attempt';

  var schemaFields = {};

  if (!schema.path(options.usernameField)) {
    schemaFields[options.usernameField] = {
      type: String,
      unique: options.usernameUnique
    };
  }
  if (!schema.path(options.emailField)) {
    schemaFields[options.emailField] = {
      type: String,
      unique: true
    };
  }
  schemaFields[options.hashField] = String;
  schemaFields[options.saltField] = String;

  if (options.limitAttempts) {
    schemaFields[options.attemptsField] = {
      type: Number,
      default: 0
    };
    schemaFields[options.lastLoginField] = {
      type: Date,
      default: Date.now
    };
  }

  schema.add(schemaFields);

  schema.pre('save', function (next) {
    // if specified, convert the username to lowercase
    if (options.usernameLowerCase) {
      this[options.usernameField] = this[options.usernameField].toLowerCase();
    }
    if (this[options.emailField]) {
      this[options.emailField] = this[options.emailField].toLowerCase();
    }

    next();
  });

  schema.methods.setPassword = function (password, cb) {
    if (!password) {
      return cb(new BadRequestError('missingPassword', options.missingPasswordError));
    }

    var self = this;

    crypto.randomBytes(options.saltlen, function (err, buf) {
      if (err) {
        return cb(err);
      }

      var salt = buf.toString(options.encoding);

      crypto.pbkdf2(password, salt, options.iterations, options.keylen, function (err, hashRaw) {
        if (err) {
          return cb(err);
        }

        self.set(options.hashField, new Buffer(hashRaw, 'binary').toString(options.encoding));
        self.set(options.saltField, salt);

        cb(null, self);
      });
    });
  };

  schema.methods.authenticate = function (password, cb) {
    var self = this;

    if (options.limitAttempts) {
      var attemptsInterval = Math.pow(options.interval, Math.log(this.get(options.attemptsField) + 1));
      var calculatedInterval = (attemptsInterval < options.maxInterval) ? attemptsInterval : options.maxInterval;

      if (Date.now() - this.get(options.lastLoginField) < calculatedInterval) {
        this.set(options.lastLoginField, Date.now());
        this.save();
        return cb(null, false, {
          message: options.attemptTooSoonError
        });
      }

    }

    if (!this.get(options.saltField)) {
      return cb(null, false, {
        message: options.noSaltValueStoredError
      });
    }

    crypto.pbkdf2(password, this.get(options.saltField), options.iterations, options.keylen, function (err, hashRaw) {
      if (err) {
        return cb(err);
      }

      var hash = new Buffer(hashRaw, 'binary').toString(options.encoding);

      if (hash === self.get(options.hashField)) {
        if (options.limitAttempts) {
          self.set(options.lastLoginField, Date.now());
          self.set(options.attemptsField, 0);
          self.save();
        }
        return cb(null, self);
      } else {
        if (options.limitAttempts) {
          self.set(options.lastLoginField, Date.now());
          self.set(options.attemptsField, self.get(options.attemptsField) + 1);
          self.save();
        }
        return cb(null, false, {
          result: 'incorrectPassword',
          message: options.incorrectPasswordError
        });
      }
    });
  };

  schema.statics.authenticate = function () {
    var self = this;

    return function (usernameOrEmail, password, cb) {
      self.findByUsername(usernameOrEmail, function (err, user) {
        if (err) {
          return cb(err);
        }

        if (user) {
          return user.authenticate(password, cb);
        }

        self.findByEmail(usernameOrEmail, function (err, user) {
          if (err) {
            return cb(err);
          }

          if (user) {
            return user.authenticate(password, cb);
          }

          return cb(null, false, {
            result: 'incorrectUsername',
            message: util.format(options.incorrectUsernameError, options.usernameField)
          });
        });
      });
    };
  };

  schema.statics.serializeUser = function () {
    return function (user, cb) {
      cb(null, user.get(options.usernameField));
    };
  };

  schema.statics.deserializeUser = function () {
    var self = this;

    return function (username, cb) {
      self.findByUsername(username, cb);
    };
  };

  schema.statics.register = function (user, password, cb) {
    // Create an instance of this in case user isn't already an instance
    if (!(user instanceof this)) {
      user = new this(user);
    }

    if (!user.get(options.usernameField)) {
      return cb(new BadRequestError('missingUsername', util.format(options.missingUsernameError, options.usernameField)));
    }

    if (!user.get(options.emailField)) {
      return cb(new BadRequestError('missingEmail', options.missingEmailError));
    }

    var self = this;
    self.findByUsername(user.get(options.usernameField), function (err, existingUser) {
      if (err) {
        return cb(err);
      }

      if (existingUser) {
        return cb(new BadRequestError('usernameExists', util.format(options.userExistsError, options.usernameField, user.get(options.usernameField))));
      }

      self.findByEmail(user.get(options.emailField), function (err, existingUser) {
        if (err) {
          return cb(err);
        }

        if (existingUser) {
          return cb(new BadRequestError('emailExists', util.format(options.userExistsError, options.emailField, user.get(options.emailField))));
        }

        user.setPassword(password, function (err, user) {
          if (err) {
            return cb(err);
          }

          user.save(function (err) {
            if (err) {
              return cb(err);
            }

            cb(null, user);
          });
        });
      });
    });
  };

  schema.statics.findByUsername = function (username, cb) {
    var queryParameters = {};

    // if specified, convert the username to lowercase
    if (username !== undefined && options.usernameLowerCase) {
      username = username.toLowerCase();
    }

    queryParameters[options.usernameField] = username;

    var query = this.findOne(queryParameters);
    if (options.selectFields) {
      query.select(options.selectFields);
    }

    if (options.populateFields) {
      query.populate(options.populateFields);
    }

    if (cb) {
      query.exec(cb);
    } else {
      return query;
    }
  };

  schema.statics.findByEmail = function (email, cb) {
    var queryParameters = {};

    // if specified, convert the username to lowercase
    if (email !== undefined) {
      email = email.toLowerCase();
    }

    queryParameters[options.emailField] = email;

    var query = this.findOne(queryParameters);
    if (options.selectFields) {
      query.select(options.selectFields);
    }

    if (options.populateFields) {
      query.populate(options.populateFields);
    }

    if (cb) {
      query.exec(cb);
    } else {
      return query;
    }
  };

  schema.statics.createStrategy = function () {
    return new LocalStrategy(options, this.authenticate());
  };
};