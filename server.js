var run = require('./lib/run.js');
var express = require('express');
var bodyParser = require('body-parser');
var logger = require('morgan');
var app = express();

app.use(logger());
app.use(bodyParser.json());

app.post('/run', run);

app.listen(process.env.PORT || 8001);

console.log('listening on port ', process.env.PORT || 8001);
