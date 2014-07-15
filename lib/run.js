var config = require('./config.js');
var git = require('gift');
var Q = require('q');
var path = require('path');
var fs = require('fs');
var spawn = require('child_process').spawn;

var runHandler = function(req, res) {
  /*
    Handler for the server process running on an EC2 instance.

    1. Clone repo
    2. Validate that HEAD is the startCommit
    3. Start child process
    4. Monitor child process

    req.body will be { endpoint, startCommit }
   */

  cloneEndpoint(req.body)
    .then(validateRepo)
    .then(start)
    .then(function() {
      res.send(201, "Starting process");
    });
    // .then(monitor);

};

var cloneEndpoint = function(obj) {
  var deferred = Q.defer();
  git.clone(obj.endpoint, config.repoPath, function(err, repo) {
    if (err) {
      deferred.reject(new Error(err));
    } else {
      deferred.resolve({ repo: repo, startCommit: obj.startCommit });
    }
  });
  return deferred.promise;
};

var validateRepo = function(obj) {
  var deferred = Q.defer();
  obj.repo.current_commit(function(err, commit) {
    if (err) {
      deferred.reject(new Error(err));
    } else if (commit.id !== obj.startCommit) {
      err = "Current commit is different than startCommit";
      deferred.reject(new Error(err));
    } else {
      deferred.resolve(obj.repo);
    }
  });
  return deferred.promise;
};

var start = function(repo) {
  var main = path.join(repo.path, 'scripts', 'main.R');
  var outputFile = path.join(repo.path, 'output', 'output.txt');
  // possibly need to remove outputFile with repo.remove
  var out = fs.createWriteStream(outputFile, 'a');
  var options = { cwd: path.dirname(main) };
  var process = spawn('Rscript', [main], options);
  process.stdout.on('data', function(data) {
    out.write(data);
  });
  process.stderr.on('data', function(data) {
    out.write(data);
  });
  process.on('end', function() {
    // POST to server
    out.end();
  });
};

module.exports = runHandler;
