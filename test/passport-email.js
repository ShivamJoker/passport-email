var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var BadRequestError = require('../lib/badrequesterror');
var passportEmail = require('../lib/passport-email');
var assert = require('assert');
var expect = require('chai').expect;
var mongotest = require('./mongotest');

var DefaultUserSchema = new Schema();
DefaultUserSchema.plugin(passportEmail);
var DefaultUser = mongoose.model('DefaultUser', DefaultUserSchema);

var setPasswordAndAuthenticate = function (user, passwordToSet, passwordToAuthenticate, cb) {
  user.setPassword(passwordToSet, function (err) {
    if (err) {
      return cb(err);
    }

    user.authenticate(passwordToAuthenticate, cb);
  });
};

describe('passportEmail', function () {
  describe('#plugin()', function () {
    it('should add "username" field to model', function () {
      var user = new DefaultUser({
        username: 'username'
      });

      assert.equal('username', user.username);
    });

    it('should add "salt" field to model', function () {
      var user = new DefaultUser({
        salt: 'salt'
      });

      assert.equal('salt', user.salt);
    });

    it('should add "hash" field to model', function () {
      var user = new DefaultUser({
        hash: 'hash'
      });

      assert.equal('hash', user.hash);
    });

    it('should add "setPassword" function to model', function () {
      var user = new DefaultUser({});

      assert.equal('function', typeof (user.setPassword));
    });

    it('should add "authenticate" function to model', function () {
      var user = new DefaultUser();
      assert.equal('function', typeof (user.authenticate));
    });

    it('should add static "authenticate" function', function () {
      assert.equal('function', typeof (DefaultUser.authenticate));
    });

    it('should allow overriding "username" field name', function () {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        usernameField: 'email'
      });

      var User = mongoose.model('UsernameOverriddenUser', UserSchema);
      var user = new User();

      assert.ok(user.schema.path('email'));
    });

    it('should allow overriding "salt" field name', function () {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        saltField: 'passwordSalt'
      });

      var User = mongoose.model('SaltOverriddenUser', UserSchema);
      var user = new User();

      assert.ok(user.schema.path('passwordSalt'));
    });

    it('should allow overriding "hash" field name', function () {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        saltField: 'passwordHash'
      });

      var User = mongoose.model('HashOverriddenUser', UserSchema);
      var user = new User();

      assert.ok(user.schema.path('passwordHash'));
    });

    it('should allow overriding "limitAttempts" option', function () {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        limitAttempts: true
      });

      var User = mongoose.model('LimitOverriddenUser', UserSchema);
      var user = new User();

      assert.ok(user.schema.path('attempts'));
    });

    it('should allow overriding "attempts" field name', function () {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        limitAttempts: true,
        attemptsField: 'failures'
      });

      var User = mongoose.model('AttemptsOverriddenUser', UserSchema);
      var user = new User();

      assert.ok(user.schema.path('failures'));
    });

    it('should preserve "username" field if already defined in the schema', function () {
      var usernameField = {
        type: String,
        required: true,
        unique: false
      };

      var UserSchema = new Schema({
        username: usernameField
      });
      UserSchema.plugin(passportEmail);

      expect(UserSchema.path('username').options).to.deep.equal(usernameField);
    });

    it('should add "username" field to as unique model per default', function () {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail);

      assert.strictEqual(true, UserSchema.path('username').options.unique);
    });

    it('should add "username" field to as non unique if specified by option', function () {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        usernameUnique: false
      });

      assert.strictEqual(false, UserSchema.path('username').options.unique);
    });
  });

  describe('#setPassword()', function () {
    it('should set yield an error if password is undefined', function (done) {
      var user = new DefaultUser();

      user.setPassword(undefined, function (err) {
        assert.ok(err);
        done();
      });
    });

    it('should set salt and hash', function (done) {
      this.timeout(5000); // Five seconds - heavy crypto in background

      var user = new DefaultUser();

      user.setPassword('password', function (err) {
        assert.ifError(err);
        assert.ok(user.hash);
        assert.ok(user.salt);

        done();
      });
    });

    it('should authenticate user with arguments supplied to setPassword', function (done) {
      this.timeout(5000); // Five seconds - heavy crypto in background

      var user = new DefaultUser();

      setPasswordAndAuthenticate(user, 'password', 'password', function (err, result) {
        assert.ifError(err);
        assert.equal(user, result);

        done();
      });
    });
  });

  describe('#authenticate()', function () {
    it('should yield false in case user cannot be authenticated', function (done) {
      this.timeout(5000); // Five seconds - heavy crypto in background

      var user = new DefaultUser();

      setPasswordAndAuthenticate(user, 'password', 'nopassword', function (err, result) {
        assert.ifError(err);
        assert.ok(result === false);

        done();
      });
    });

    it('should supply a message when authentication fails', function (done) {
      this.timeout(5000); // Five seconds - heavy crypto in background

      var user = new DefaultUser();

      setPasswordAndAuthenticate(user, 'password', 'nopassword', function (err, result, options) {
        assert.ifError(err);
        assert.ok(options.message);

        done();
      });
    });
  });

  describe('static #authenticate()', function () {
    beforeEach(mongotest.prepareDb('mongodb://localhost/passportemailtests'));
    afterEach(mongotest.disconnect());

    it('should yield false with message option for authenticate', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      DefaultUser.authenticate()('user', 'password', function (err, result, options) {
        assert.ifError(err);
        assert.ok(result === false);
        assert.ok(options.message);

        done();
      });
    });

    it('should authenticate existing user with matching password', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var user = new DefaultUser({
        username: 'user',
        email: 'email'
      });
      user.setPassword('password', function (err) {
        assert.ifError(err);

        user.save(function (err) {
          assert.ifError(err);

          DefaultUser.authenticate()('user', 'password', function (err, result) {
            assert.ifError(err);

            assert.ok(result instanceof DefaultUser);
            assert.equal(user.username, result.username);
            assert.equal(user.salt, result.salt);
            assert.equal(user.hash, result.hash);

            done();
          });
        });
      });
    });

    it('should authenticate existing user with case insensitive username with matching password', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var UserSchema = new Schema();
      UserSchema.plugin(passportEmail, {
        usernameLowerCase: true
      });
      var User = mongoose.model('AuthenticateWithCaseInsensitiveUsername', UserSchema);

      var username = 'userName';
      User.register({
        username: username,
        email: 'email'
      }, 'password', function (err, user) {
        assert.ifError(err);

        User.authenticate()('username', 'password', function (err, result) {
          assert.ifError(err);

          assert.ok(result instanceof User);
          assert.equal(result.username, 'username');

          done();
        });
      });
    });

    it('should authenticate existing user with matching password with field overrides', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var UserSchema = new Schema();
      UserSchema.plugin(passportEmail, {
        usernameField: 'usernameNew',
        hashField: 'hashValue',
        saltField: 'saltValue'
      });
      var User = mongoose.model('AuthenticateWithFieldOverrides', UserSchema);

      var usernameNew = 'usernameUsedAsUsername';
      User.register({
        usernameNew: usernameNew,
        email: 'email'
      }, 'password', function (err, user) {
        assert.ifError(err);

        User.authenticate()(usernameNew, 'password', function (err, result) {
          assert.ifError(err);

          assert.ok(result instanceof User);
          assert.equal(user.usernameNew, result.usernameNew);
          assert.equal(user.saltValue, result.saltValue);
          assert.equal(user.hashValue, result.hashValue);

          done();
        });
      });
    });

    it('should not authenticate existing user with non matching password', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var user = new DefaultUser({
        username: 'user',
        email: 'email'
      });
      user.setPassword('password', function (err) {
        assert.ifError(err);

        user.save(function (err) {
          assert.ifError(err);

          DefaultUser.authenticate()('user', 'wrongpassword', function (err, result, options) {
            assert.ifError(err);
            assert.equal(result, false);
            assert.ok(options.message);

            done();
          });
        });
      });
    });

    it('should lock authenticate after too many login attempts', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        limitAttempts: true,
        interval: 20000
      }); // High initial value for test

      var User = mongoose.model('LockUserAfterLimitAttempts', UserSchema);

      var user = new User({
        username: 'user',
        email: 'email'
      });
      user.setPassword('password', function (err) {
        assert.ifError(err);

        user.save(function (err) {
          assert.ifError(err);

          User.authenticate()('user', 'WRONGpassword', function (err, result, message) {
            expect(err).to.not.exist;
            expect(result).to.be.false;

            User.authenticate()('user', 'WRONGpassword', function (err, result, message) {
              expect(err).to.not.exist;
              expect(result).to.be.false;

              User.authenticate()('user', 'WRONGpassword', function (err, result, message) {
                expect(err).to.not.exist;
                expect(result).to.be.false;

                // Last login attempt should lock the user!
                User.authenticate()('user', 'password', function (err, result, message) {
                  debugger;
                  expect(err).to.not.exist;
                  expect(result).to.be.false;

                  done();
                });
              });
            });
          });
        });
      });
    });
  });


  describe('static #serializeUser()', function () {
    it('should define a static serializeUser function for passport', function () {
      assert.ok(DefaultUser.serializeUser);
    });

    it('should serialize existing user by username field', function (done) {
      var user = new DefaultUser({
        username: 'user',
        email: 'email'
      });

      DefaultUser.serializeUser()(user, function (err, username) {
        assert.equal('user', username);

        done();
      });
    });

    it('should serialize existing user by username field override', function (done) {
      var UserSchema = new Schema();
      UserSchema.plugin(passportEmail, {
        usernameField: 'email'
      });
      var User = mongoose.model('SerializeUserWithOverride', UserSchema);

      var user = new User({
        email: 'emailUsedForUsername'
      });

      User.serializeUser()(user, function (err, username) {
        assert.equal('emailUsedForUsername', username);

        done();
      });
    });
  });

  describe('static #deserializeUser()', function () {
    beforeEach(mongotest.prepareDb('mongodb://localhost/passportemailtests'));
    afterEach(mongotest.disconnect());

    it('should define a static deserializeUser function for passport', function () {
      assert.ok(DefaultUser.deserializeUser);
    });

    it('should deserialize users by retrieving users from mongodb', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      DefaultUser.register({
        username: 'user',
        email: 'email'
      }, 'password', function (err, user) {
        assert.ifError(err);

        DefaultUser.deserializeUser()('user', function (err, loadedUser) {
          assert.ifError(err);
          assert.equal(user.username, loadedUser.username);

          done();
        });
      });
    });

    it('should deserialize users by retrieving users from mongodb with username override', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var UserSchema = new Schema();
      UserSchema.plugin(passportEmail, {
        usernameField: 'usernameOverride'
      });
      var User = mongoose.model('DeserializeUserWithOverride', UserSchema);

      var usernameOverrideValue = 'valueUsedForUsername';
      User.register({
        usernameOverride: usernameOverrideValue,
        email: 'email'
      }, 'password', function (err) {
        assert.ifError(err);

        User.deserializeUser()(usernameOverrideValue, function (err, loadedUser) {
          assert.ifError(err);
          assert.equal(usernameOverrideValue, loadedUser.usernameOverride);

          done();
        });
      });
    });
  });

  describe('static #findByUsername()', function () {
    beforeEach(mongotest.prepareDb('mongodb://localhost/passportemailtests'));
    afterEach(mongotest.disconnect());

    it('should define static findByUsername helper function', function () {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {});
      var User = mongoose.model('FindByUsernameDefined', UserSchema);

      assert.ok(User.findByUsername);
    });

    it('should retrieve saved user with findByUsername helper function', function (done) {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {});
      var User = mongoose.model('FindByUsername', UserSchema);

      var user = new User({
        username: 'hugo',
        email: 'email'
      });
      user.save(function (err) {
        assert.ifError(err);

        User.findByUsername('hugo', function (err, user) {
          assert.ifError(err);
          assert.ok(user);
          assert.equal(user.username, 'hugo');

          done();
        });
      });
    });

    it('should return a query object when no callback is specified', function (done) {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {});
      var User = mongoose.model('FindByUsernameQueryObject', UserSchema);

      var user = new User({
        username: 'hugo',
        email: 'email'
      });
      user.save(function (err) {
        assert.ifError(err);

        var query = User.findByUsername('hugo')

        assert.ok(query);

        query.exec(function (err, user) {
          assert.ifError(err);
          assert.ok(user);
          assert.equal(user.username, 'hugo');

          done();
        });
      });
    });

    it('should select all fields', function (done) {
      var UserSchema = new Schema({
        department: {
          type: String,
          required: true
        }
      });
      UserSchema.plugin(passportEmail, {});
      var User = mongoose.model('FindByUsernameWithAllFields', UserSchema);

      var user = new User({
        username: 'hugo',
        department: 'DevOps',
        email: 'email'
      });
      user.save(function (err) {
        assert.ifError(err);

        User.findByUsername('hugo', function (err, user) {
          assert.ifError(err);
          assert.ok(user);
          assert.equal(user.username, 'hugo');
          assert.equal(user.department, 'DevOps');

          done();
        });
      });
    });

    it('should select fields specified by selectFields option', function (done) {
      var UserSchema = new Schema({
        department: {
          type: String,
          required: true
        }
      });
      UserSchema.plugin(passportEmail, {
        selectFields: 'username'
      });
      var User = mongoose.model('FindByUsernameWithSelectFieldsOption', UserSchema);

      var user = new User({
        username: 'hugo',
        department: 'DevOps',
        email: 'email'
      });
      user.save(function (err) {
        assert.ifError(err);

        User.findByUsername('hugo', function (err, user) {
          assert.ifError(err);
          assert.ok(user);
          assert.equal(user.username, 'hugo');
          assert.equal(user.department, undefined);

          done();
        });
      });
    });

    it('should retrieve saved user with findByUsername helper function with username field override', function (done) {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        usernameField: 'usernameOverride'
      });
      var User = mongoose.model('FindByUsernameWithOverride', UserSchema);

      var usernameOverrideValue = 'usedForUsernameOverride';
      var user = new User({
        usernameOverride: usernameOverrideValue,
        email: 'email'
      });

      user.save(function (err) {
        assert.ifError(err);

        User.findByUsername(usernameOverrideValue, function (err, user) {
          assert.ifError(err);
          assert.ok(user);
          assert.equal(user.usernameOverride, usernameOverrideValue);

          done();
        });
      });
    });

    it('should not throw if lowercase option is specified and no username is supplied', function (done) {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        usernameLowerCase: true
      });
      var User = mongoose.model('FindByUsernameWithUndefinedUsername', UserSchema);

      User.findByUsername(undefined, function (err) {
        assert.ifError(err);
        done();
      });
    });
  });

  describe('static #register()', function () {
    beforeEach(mongotest.prepareDb('mongodb://localhost/passportemailtests'));
    afterEach(mongotest.disconnect());

    it('should define static register helper function', function () {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {});
      var User = mongoose.model('RegisterDefined', UserSchema);

      assert.ok(User.register);
    });

    it('should register user', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {});
      var User = mongoose.model('RegisterUser', UserSchema);

      User.register({
        username: 'hugo',
        email: 'email'
      }, 'password', function (err, user) {
        assert.ifError(err);
        assert.ok(user);

        User.findByUsername('hugo', function (err, user) {
          assert.ifError(err);
          assert.ok(user);
          done();
        });
      });
    });

    it('should check for duplicate user name', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {});
      var User = mongoose.model('RegisterDuplicateUser', UserSchema);

      User.register({
        username: 'hugo',
        email: 'email'
      }, 'password', function (err) {
        assert.ifError(err);

        User.register({
          username: 'hugo',
          email: 'email2'
        }, 'password', function (err) {
          assert.ok(err);
          done();
        });
      });
    });

    it('should authenticate registered user', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        iterations: 1
      }); // 1 iteration - safes time in tests
      var User = mongoose.model('RegisterAndAuthenticateUser', UserSchema);

      User.register({
        username: 'hugo',
        email: 'email'
      }, 'password', function (err) {
        assert.ifError(err);

        User.authenticate()('hugo', 'password', function (err, user, message) {
          assert.ifError(err);
          assert.ok(user);
          assert.ok(!message);

          done();
        });
      });
    });

    it('should not authenticate registered user with wrong password', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        iterations: 1
      }); // 1 iteration - safes time in tests
      var User = mongoose.model('RegisterAndNotAuthenticateUser', UserSchema);

      User.register({
        username: 'hugo',
        email: 'email'
      }, 'password', function (err) {
        assert.ifError(err);

        User.authenticate()('hugo', 'wrong_password', function (err, user, message) {
          assert.ifError(err);
          assert.ok(!user);
          assert.ok(message);

          done();
        });
      });
    });

    it('it should add username existing user without username', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {});
      var User = mongoose.model('RegisterExistingUser', UserSchema);

      var existingUser = new User({});
      existingUser.save(function (err, user) {
        assert.ifError(err);
        assert.ok(user);
        user.username = 'hugo';
        user.email = 'email';
        User.register(user, 'password', function (err, user) {
          assert.ifError(err);
          assert.ok(user);

          User.findByUsername('hugo', function (err, user) {
            assert.ifError(err);
            assert.ok(user);
            done();
          });
        });
      });
    });

    it('should result in BadRequest error in case no username was given', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {});
      var User = mongoose.model('RegisterUserWithoutUsername', UserSchema);

      User.register({}, 'password', function (err) {
        expect(err).to.be.instanceof(BadRequestError);
        done();
      });
    });

    it('should result in BadRequest error in case no password was given', function (done) {
      this.timeout(5000); // Five seconds - mongo db access needed

      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {});
      var User = mongoose.model('RegisterUserWithoutPassword', UserSchema);

      User.register({
        username: 'hugo',
        email: 'email'
      }, undefined, function (err) {
        expect(err).to.be.instanceof(BadRequestError);
        done();
      });
    });
  });

  describe('static #createStrategy()', function () {
    it('should create strategy', function () {
      var UserSchema = new Schema({});
      UserSchema.plugin(passportEmail, {
        usernameField: 'email'
      });
      var User = mongoose.model('CreateStrategy', UserSchema);

      var strategy = User.createStrategy();
      assert.ok(strategy);
    });
  });
});