const unixDgram = require('unix-dgram');
const helpers = require('./helpers');
const dgram = require('dgram');
const dns = require('dns');
const net = require('net');

/**
 * @description Creates a socket with the arguments provided
 * @param {object} args
 * @param {string} host - The host to use for the socket
 * @param {number} port - The port to use for the socket
 * @param {number} port - The port to use for the socket
 * @throws Error if it fails to create the socket
 */
function createSocket(args) {
  let socket;

  if (args.protocol === 'tcp') {
    socket = net.connect(args.port, args.host);
    socket.setKeepAlive(true);
  } else if (args.protocol === 'unix_dgram') {
    socket = unixDgram.createSocket('unix_dgram');
    socket.connect(args.path);
  } else {
    socket = dgram.createSocket('udp4');
  }

  return socket;
}

/**
 * StatsD Transport
 * @description Base class for transporting StatsD Messages
 * @throws Error if it fails to create the socket
 * NOTE: Adding new parameters to the constructor is deprecated- please use the
 * constructor as one options object.
 */
class Transport {
  constructor(
    host,
    port,
    prefix,
    suffix,
    globalize,
    cacheDns,
    mock,
    globalTags,
    maxBufferSize,
    bufferFlushInterval,
    telegraf,
    sampleRate,
    protocol
  ) {
    let options = host || {};
    const self = this;

    // Adding options below is DEPRECATED.  Use the options object instead.
    if (arguments.length > 1 || typeof(host) === 'string') {
      options = {
        host        : host,
        port        : port,
        prefix      : prefix,
        suffix      : suffix,
        globalize   : globalize,
        cacheDns    : cacheDns,
        mock        : mock === true,
        globalTags  : globalTags,
        maxBufferSize : maxBufferSize,
        bufferFlushInterval: bufferFlushInterval,
        telegraf    : telegraf,
        sampleRate  : sampleRate,
        protocol    : protocol
      };
    }

    // hidden global_tags option for backwards compatibility
    options.globalTags = options.globalTags || options.global_tags;

    this.protocol    = (options.protocol && options.protocol.toLowerCase());
    this.host        = options.host || 'localhost';
    this.port        = options.port || 8125;
    this.path        = options.path || '';
    this.prefix      = options.prefix || '';
    this.suffix      = options.suffix || '';
    this.mock        = options.mock === true;
    this.globalTags  = typeof options.globalTags === 'object' ?
        helpers.formatTags(options.globalTags, options.telegraf) : [];
    this.telegraf    = options.telegraf || false;
    this.maxBufferSize = options.maxBufferSize || 0;
    this.sampleRate  = typeof options.sampleRate === 'number' ? options.sampleRate : 1;
    this.bufferFlushInterval = options.bufferFlushInterval || 1000;
    this.bufferHolder = options.isChild ? options.bufferHolder : { buffer: '' };
    this.errorHandler = options.errorHandler;

    // If we're mocking the client, create a buffer to record the outgoing calls.
    if (this.mock) {
      this.mockBuffer = [];
    } else {
      this.socket = options.isChild ? options.socket : createSocket({
        host: this.host,
        path: this.path,
        port: this.port,
        protocol: this.protocol
      });

      if (!options.isChild && options.errorHandler) {
        this.socket.on('error', options.errorHandler);
      }
    }

    // We only want a single flush event per parent and all its child clients
    if (!options.isChild && this.maxBufferSize > 0) {
      this.intervalHandle = setInterval(this.onBufferFlushInterval.bind(this), this.bufferFlushInterval);
    }

    if (options.isChild) {
      if (options.dnsError) {
        this.dnsError = options.dnsError;
      }
    } else if (options.cacheDns === true) {
      dns.lookup(options.host, (err, address) => {
        if (err === null) {
          self.host = address;
        } else {
          self.dnsError = err;
        }
      });
    }

    if (options.globalize) {
      global.statsd = this;
    }

    if (options.useDefaultRoute) {
      const defaultRoute = helpers.getDefaultRoute();
      if (defaultRoute) {
        this.host = defaultRoute;
      }
    }

    this.messagesInFlight = 0;
    this.CHECKS = {
      OK: 0,
      WARNING: 1,
      CRITICAL: 2,
      UNKNOWN: 3,
    };
  }

  /**
   * Checks if stats is an array and sends all stats calling back once all have sent
   * @param stat {String|Array} The stat(s) to send
   * @param value The value to send
   * @param type The type of the metric
   * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
   * @param tags {Array=} The Array of tags to add to metrics. Optional.
   * @param callback {Function=} Callback when message is done being delivered. Optional.
   */
  sendAll(stat, value, type, sampleRate, tags, callback) {
    let completed = 0;
    let calledback = false;
    let sentBytes = 0;
    const self = this;

    if (sampleRate && typeof sampleRate !== 'number') {
      callback = tags;
      tags = sampleRate;
      sampleRate = undefined;
    }

    if (tags && typeof tags !== 'object') {
      callback = tags;
      tags = undefined;
    }

    /**
     * Gets called once for each callback, when all callbacks return we will
     * call back from the function
     * @private
     */
    function onSend(error, bytes) {
      completed += 1;
      if (calledback) {
        return;
      }

      if (error) {
        if (typeof callback === 'function') {
          calledback = true;
          callback(error);
        } else if (self.errorHandler) {
          calledback = true;
          self.errorHandler(error);
        }
        return;
      }

      if (bytes) {
        sentBytes += bytes;
      }

      if (completed === stat.length && typeof callback === 'function') {
        callback(null, sentBytes);
      }
    }

    if (Array.isArray(stat)) {
      stat.forEach(item => {
        self.sendStat(item, value, type, sampleRate, tags, onSend);
      });
    } else {
      this.sendStat(stat, value, type, sampleRate, tags, callback);
    }
  }

  /**
   * Sends a stat across the wire
   * @param stat {String|Array} The stat(s) to send
   * @param value The value to send
   * @param type {String} The type of message to send to statsd
   * @param sampleRate {Number} The Number of times to sample (0 to 1)
   * @param tags {Array} The Array of tags to add to metrics
   * @param callback {Function=} Callback when message is done being delivered. Optional.
   */
  sendStat(stat, value, type, sampleRate, tags, callback) {
    let message = `${this.prefix + stat + this.suffix}:${value}|${type}`;
    sampleRate = typeof sampleRate === 'number' ? sampleRate : this.sampleRate;
    if (sampleRate < 1) {
      if (Math.random() < sampleRate) {
        message += `|@${sampleRate}`;
      } else {
        // don't want to send if we don't meet the sample ratio
        return callback ? callback() : undefined;
      }
    }
    this.send(message, tags, callback);
  }

  /**
   * Send a stat or event across the wire
   * @param message {String} The constructed message without tags
   * @param tags {Array} The tags to include (along with global tags). Optional.
   * @param callback {Function=} Callback when message is done being delivered (only if maxBufferSize == 0). Optional.
   */
  send(message, tags, callback) {
    let mergedTags = this.globalTags;
    if (tags && typeof tags === 'object') {
      mergedTags = helpers.overrideTags(mergedTags, tags, this.telegraf);
    }
    if (mergedTags.length > 0) {
      if (this.telegraf) {
        message = message.split(':');
        message = `${message[0]},${mergedTags.join(',').replace(/:/g, '=')}:${message.slice(1).join(':')}`;
      } else {
        message += `|#${mergedTags.join(',')}`;
      }
    }

    this._send(message, callback);
  }

  /**
   * Send a stat or event across the wire
   * @param message {String} The constructed message without tags
   * @param callback {Function=} Callback when message is done being delivered (only if maxBufferSize == 0). Optional.
   */
  _send(message, callback) {
    // we may have a cached error rather than a cached lookup, so
    // throw it on
    if (this.dnsError) {
      if (callback) {
        return callback(this.dnsError);
      } else if (this.errorHandler) {
        return this.errorHandler(this.dnsError);
      }
      throw this.dnsError;
    }

    // Only send this stat if we're not a mock Client.
    if (!this.mock) {
      if (this.maxBufferSize === 0) {
        this.sendMessage(message, callback);
      } else {
        this.enqueue(message, callback);
      }
    } else {
      this.mockBuffer.push(message);
      if (typeof callback === 'function') {
        callback(null, 0);
      }
    }
  }

  /**
   * Add the message to the buffer and flush the buffer if needed
   *
   * @param message {String} The constructed message without tags
   */
  enqueue(message, callback) {
    message += '\n';

    if (this.bufferHolder.buffer.length + message.length > this.maxBufferSize) {
      this.flushQueue(callback);
      this.bufferHolder.buffer += message;
    }
    else {
      this.bufferHolder.buffer += message;
      if (callback) {
        callback(null);
      }
    }
  }

  /**
   * Flush the buffer, sending on the messages
   */
  flushQueue(callback) {
    this.sendMessage(this.bufferHolder.buffer, callback);
    this.bufferHolder.buffer = '';
  }

  /**
   * Send on the message through the socket
   *
   * @param message {String} The constructed message without tags
   * @param callback {Function=} Callback when message is done being delivered. Optional.
   */
  sendMessage(message, callback) {
    // don't waste the time if we aren't sending anything
    if (message === '' || this.mock) {
      if (callback) {
        callback(null);
      }
      return;
    }

    if (this.protocol === 'tcp' && message.lastIndexOf('\n') !== message.length - 1) {
      message += '\n';
    }

    const handleCallback = (err) => {
      this.messagesInFlight--;
      const errFormatted = err ? new Error(`Error sending hot-shots message: ${err}`) : null;
      if (errFormatted) {
        errFormatted.code = err.code;
      }
      if (callback) {
        callback(errFormatted);
      } else if (errFormatted) {
        if (this.errorHandler) {
          this.errorHandler(errFormatted);
        } else {
          // emit error ourselves on the socket for backwards compatibility
          this.socket.emit('error', errFormatted);
        }
      }
    };

    const buf = Buffer.from(message);
    try {
      this.messagesInFlight++;
      if (this.protocol === 'tcp') {
        this.socket.write(buf, 'ascii', handleCallback);
      } else if (this.protocol === 'unix_dgram') {
        this.socket.send(buf, handleCallback);
      } else {
        this.socket.send(buf, 0, buf.length, this.port, this.host, handleCallback);
      }
    } catch (err) {
      handleCallback(err);
    }
  }

  /**
   * Called every bufferFlushInterval to flush any buffer that is around
   */
  onBufferFlushInterval() {
    this.flushQueue();
  }

  /**
   * Close the underlying socket and stop listening for data on it.
   */
  close(callback) {
    // stop trying to flush the queue on an interval
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }

    // flush the queue one last time, if needed
    this.flushQueue((err) => {
      if (err) {
        if (callback) {
          callback(err);
        }
        return;
      }

      // FIXME: we have entered callback hell, and this whole file is in need of an async rework

      // wait until there are no more messages in flight before really closing the socket
      let intervalAttempts = 0;
      const waitForMessages = setInterval(() => {
        intervalAttempts++;
        if (intervalAttempts > 10) {
          this.messagesInFlight = 0;
        }
        if (this.messagesInFlight <= 0) {
          clearInterval(waitForMessages);
          this._close(callback);
        }
      }, 50);
    });
  }

  /**
   * Really close the socket and handle any errors related to it
   */
  _close(callback) {
    // error function to use in callback and catch below
    let handledError = false;
    const handleErr = (err) => {
      const errMessage = `Error closing hot-shots socket: ${err}`;
      if (!handledError) {
        // The combination of catch and error can lead to some errors
        // showing up twice.  So we just show one of the errors that occur
        // on close.
        handledError = true;

        if (callback) {
          callback(new Error(errMessage));
        } else if (this.errorHandler) {
          this.errorHandler(new Error(errMessage));
        }
      }
    };

    if (!this.mock) {
      if (this.errorHandler) {
        this.socket.removeListener('error', this.errorHandler);
      }

      // handle error and close events
      this.socket.on('error', handleErr);
      if (callback) {
        this.socket.on('close', err => {
          if (! handledError && callback) {
            callback(err);
          }
        });
      }

      try {
        if (this.protocol === 'tcp') {
          this.socket.destroy();
        } else {
          this.socket.close();
        }
      } catch (err) {
        handleErr(err);
      }
    } else if (callback) {
      return callback(null);
    }
  }
}

module.exports = Transport;
