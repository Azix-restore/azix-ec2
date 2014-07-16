var config = require('../../config.js');
var git = require('gift');
var Q = require('q');
var path = require('path');
var fs = require('fs');
var request = require('request');
var spawn = require('child_process').spawn;

var runHandler = function(req, res) {
  /*
    Handler for the server process running on an EC2 instance.

    1. Clone repo
    2. Validate that HEAD is the startCommit
    3. Start child process
    4. Monitor child process

    req.body will be { instanceId, endpoint, startCommit }
   */

  cloneEndpoint(req.body)
    .then(validateRepo)
    .then(function(data) {
      res.send(201, "Starting process");
      return data;
    })
    .then(start)
    .then(addOutput)
    .then(commit)
    .then(push)
    .then(notifyServer)
    .catch(function(err) {
      res.send(500, err.message);
    });

};

var cloneEndpoint = function(obj) {
  var deferred = Q.defer();
  git.clone(obj.endpoint, config.ec2RepoPath, function(err, repo) {
    if (err) {
      deferred.reject(new Error(err));
    } else {
      deferred.resolve({ repo: repo, req: obj });
    }
  });
  return deferred.promise;
};

var validateRepo = function(obj) {
  var deferred = Q.defer();
  obj.repo.current_commit(function(err, commit) {
    if (err) {
      deferred.reject(new Error(err));
    } else if (commit.id !== obj.req.startCommit) {
      err = "Current commit is different than startCommit";
      deferred.reject(new Error(err));
    } else {
      deferred.resolve(obj);
    }
  });
  return deferred.promise;
};

var start = function(obj) {
  var repo = obj.repo;
  var deferred = Q.defer();
  var main = path.join(repo.path, 'scripts', 'main.R');
  var outputFile = path.join(repo.path, 'output', 'output.txt');
  var errFile = path.join(repo.path, 'output', 'err.txt');
  var out = fs.createWriteStream(outputFile, 'w');
  var err = fs.createWriteStream(errFile, 'w');
  var process = spawn('Rscript', [main], { cwd: path.dirname(main) });
  process.stdout.on('data', function(data) {
    out.write(data);
  });
  process.stderr.on('data', function(data) {
    err.write(data);
  });
  process.on('close', function() {
    err.end();
    out.end();
    deferred.resolve(obj);
  });
  return deferred.promise;
};

var addOutput = function(obj) {
  var deferred = Q.defer();
  obj.repo.add('output', function(err) {
    if (err) {
      deferred.reject(new Error(err));
    } else {
      deferred.resolve(obj);
    }
  });
  return deferred.promise;
};

var commit = function(obj) {
  var deferred = Q.defer();
  var msg = 'Azix process finished ' + new Date() + ' - ' + obj.req.startCommit;
  obj.repo.commit(msg, function(err) {
    if (err) {
      deferred.reject(new Error(err));
    } else {
      deferred.resolve(obj);
    }
  });
  return deferred.promise;
};

var push = function(obj) {
  var deferred = Q.defer();
  obj.repo.remote_push('origin', 'master', function(err) {
    if (err) {
      deferred.reject(new Error(err));
    } else {
      deferred.resolve(obj);
    }
  });
  return deferred.promise;
};

var notifyServer = function(obj) {
  var deferred = Q.defer();
  obj.repo.current_commit(function(err, commit) {
    if (err) {
      deferred.reject(new Error(err));
    } else {
      var data = {
        instanceId: obj.req.instanceId,
        completeCommit: commit.id,
        endpoint: obj.req.endpoint
      };
      var options = {
        method: 'POST',
        url: 'http://' + config.host + ':' + config.port + '/api/end',
        json: data
      };
      request(options, function(err, response) {
        if (err || response.statusCode !== 201) {
          deferred.reject(new Error(err || 'Bad request'));
        } else {
          deferred.resolve(obj);
        }
      });
    }
  });
  return deferred.promise;
};

module.exports = runHandler;
