var crypto = require('crypto');

var utils = require('../utils');
var Client = require('../client.js');
var Transformer = require('./transformer');

/* this has been binded to Server instance */
/* return <true> for upgrade_router's valid */
/* argument @req has been pre-setted */
module.exports = function (req, socket) {

  // ref to server
  var server = this;

  // socket is disconnected ?
  var closed = false;

  // create a instance for connecting client to restore vars and buffer
  var client = new Client(socket, server._sockets);
  var resKey, resHeaders;

  // references to recive raw data and resolved payload data 
  /*var _buffer = {
    r_queue: new Buffer(0),
    f_payload_data: []
  };*/
  // up to limit, throw exception
  if (server.getConnectCount() + 1 > server.MAX) {
    server.sysEmit('uptolimit', server.MAX);
    utils.error(new Error('can not handle this request, socket has been up to the MAX number'));
    return true;
  }

  resKey = crypto.createHash('sha1')
    .update(req.headers['sec-websocket-key'] + utils.MAGIC_STRING)
    .digest('base64');

  /* ws protocol handshake request head */
  resHeaders = ([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + resKey
  ]).concat('', '').join('\r\n');
  
  // for memory track use
  var ref = setInterval(memTrack, 10000, client);

  // for memory track use
  function memTrack(client) {
    var buffer = {
      r_queue: transformer.r_queue || new Buffer(0),
      f_payload_data: transformer.f_payload_data || []
    };
    console.log('=======', client && client.get('id'), ': Memory Tracker - Log =======');
    console.log('pending queue:', client && client.execQ.length);
    console.log('read queue:', buffer.r_queue.length / 1024, 'KB');
    console.log('fragment cache length:', buffer.f_payload_data.length);
    console.log('Heap Total:', process.memoryUsage().heapTotal / 1024 / 1024, 'MB');
    console.log('Heap Used:', process.memoryUsage().heapUsed / 1024 / 1024, 'MB');
    console.log('rss:', process.memoryUsage().rss / 1024 / 1024, 'MB');
    console.log('==================================================');
  }

  var transformer = new Transformer({ server: server, client: client });
  var onData = transformer.transform.bind(transformer);
  //var onData = datarecv_handler.bind(server, client, _buffer);

  function onFinish() {
    client.sysEmit('sessionend');
    server.sysEmit('sessionend', client);
    utils.log('server TCP socket ready to close');
    // clean memory
    cleanup();
  }

  function onEnd() {
    client.sysEmit('clientclose');
    server.sysEmit('clientclose', client);
    utils.log('client TCP socket ready to close');
    // clean memory
    cleanup();
  }

  function onClose(has_error) {
    // trigger 'disconnected' event
    client.sysEmit('disconnected');
    server.sysEmit('disconnected', client);
    utils.log('TCP connection closed');
    if (has_error)
      utils.error(new Error('some problems happened during TCP connection closing'));
    // clean memory
    cleanup();
  }

  function onDrain() {
    // once the internal buffer has been drained
    // resume emitting 'data' event
    socket.resume();
    // and go on executing the pended operations
    client.execQ.goon();
    client.sysEmit('drained', socket.bufferSize);
    server.sysEmit('drained', socket.bufferSize);
    utils.log('user space buffer-queue has been drained');
  }

  function onTimeout() {
    utils.log('connection closed by timeout');
    socket.end('connection closed by timeout');
    client.sysEmit('timeout');
    server.sysEmit('timeout');
  }

  function onError(err) {
    socket.destroy();
    client.sysEmit('exception', err);
    server.sysEmit('exception', err);
    utils.error(err);
  }

  function cleanup() {
    if (closed) 
      return;
    delete server._sockets[client.get('id')] && server.conns--;
    _buffer = null;
    //client = null;
    socket
      .removeListener('data', onData)
      .removeListener('finish', onFinish)
      .removeListener('end', onEnd)
      .removeListener('close', onClose)
      .removeListener('drain', onDrain)
      .removeListener('timeout', onTimeout)
      .removeListener('error', onError);

    // for memory track use
    clearInterval(ref);
    memTrack(_buffer);
    closed = true;
  }

  socket
    // on any data incomming
    .on('data', onData)
    // server TCP socket ready to close
    .on('finish', onFinish)
    // client TCP socket ready to close
    .on('end', onEnd)
    // underlying TCP socket has been closed
    .on('close', onClose)
    .on('drain', onDrain)
    .on('timeout', onTimeout)
    .on('error', onError);
    //.pipe(transformer);

  // add the client to clients-stack
  server.conns++;
  client._write(resHeaders);
  // on connection established
  server.sysEmit('connected', client);

  return true;
}