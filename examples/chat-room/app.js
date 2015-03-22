#!/usr/bin/env node

var fs = require('fs'),
    util = require('util'),
    http = require('http'),
    path = require('path');
var wsf = require('../../index.js'),
    WServer = wsf.Server;

// statics hash
var statics = {
  '/': './chat.html',
  '/event.js': '../../node_modules/event.js/event.js',
  '/wsf.js': '../../lib/browser/wsf.js'
}

// http server
var httpd = http.createServer(function(req, res) {
  var dir = statics[req.url] || statics['/'];
  fs.readFile(path.join(__dirname, dir), function (err, file) {
    res.end(file);
  });
});

var ws = new WServer(httpd, { namespace: '/socket' });
var ws2 = new WServer(httpd, { namespace: '/all' });

var clients = {};
var messages = [];
var conn_num = 0;

var handler = function (socket) {
  // manual set the timeout to 10s
  socket.setTimeout(0);
  // on receive message
  socket.on('data', function (data) {
    var id = data.id;
    var message = data.body;
    console.log('Client ' + id + ':' + message);
    messages.push(message);
    clients[id] = socket;
    conn_num ++;
    publishMessage(data);
  });
  socket.on('disconnected', function(info) {
    delete clients[socket.id];
  });
};

var publishMessage = function publishMessage(data) {
  for (id in clients) {
    socket = clients[id];
    socket.send(data);
  }
};

var handler2 = function (socket) {
  socket.setTimeout(0);
  socket.send(messages);
};

ws.on('connected', handler);
ws2.on('connected', handler2);

// listen on websocket request
wsf.listen(httpd, function(){
  util.log('wsf server start');
  console.log('server listen on http://localhost:3000');
})

// start the http server
httpd.listen(3000);
