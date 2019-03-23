const Transport = require('./transport');
const helpers = require('./helpers');

/**
 * StatsD Client
 * @description The main entry-point for hot-shots.
 */
class StatsD extends Transport {

  /**
   * @constructor
   * @param {object} options - The options to use for the client.
   * @param {string} options.host - The host to send metrics to. Required for TCP and UDP protocols.
   * @param {number} options.port - The port that StatsD is listening on. Required for TCP and UDP protocols.
   * @param {string} options.path - The UDS path to connect to. Required for UNIX_DGRAM protocol.
   * @param {string} options.prefix - Global prefix string to append to all stats. Optional
   * @param {string} options.suffix - Global suffix string to append to all stats. Optional
   * @param {boolean} options.globalize - Assigns the client to a global instance. Optional
   * @param {boolean} options.cacheDns - Whether or not to cache the DNS for subsequent requests. Optional
   * @param {boolean} options.mock - Whether or not to mock the client. Optional
   * @param {string[]|object} options.globalTags - Tags to include for every metroc. Optional
   * @param {number} options.maxBufferSize - The maximum size of the in-memory buffer. Optional
   * @param {number} options.bufferFlushInterval - How often the buffer is sent to StatsD. Optional
   * @param {boolean} options.telegraf - Flag to indicate telegraf support. Optional
   * @param {number} option.sampleRate - The sample rate to use fo stats. Optional
   * @param {string} options.protocol - The protocol to use for sending stats. Optional
   */
  constructor(...args) {
    super(...args);
  }

  /**
   * Represents the timing stat
   * @param {string|string[]} stat - The stat(s) to send
   * @param {number} time - The time in milliseconds to send
   * @param {number} sampleRate - The Number of times to sample (0 to 1). Optional.
   * @param {string[]|object} tags - The Array of tags to add to metrics. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  timing(stat, time, sampleRate, tags, callback) {
    this.sendAll(stat, time, 'ms', sampleRate, tags, callback);
  }

  /**
   * Represents the timing stat by recording the duration a function takes to run (in milliseconds)
   * @param {function} func - The function to run
   * @param {string|string[]} stat - The stat(s) to send
   * @param {number} sampleRate - The Number of times to sample (0 to 1). Optional.
   * @param {string[]|object} tags - The Array of tags to add to metrics. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  timer(func, stat, sampleRate, tags, callback) {
    return (...args) => {
      const start = process.hrtime();
      try {
        return func(...args);
      } finally {
        // get duration in milliseconds
        const durationComponents = process.hrtime(start);
        const seconds = durationComponents[0];
        const nanoseconds = durationComponents[1];
        const duration = (seconds * 1000) + (nanoseconds / 1E6);

        this.timing(
          stat,
          duration,
          sampleRate,
          tags,
          callback
        );
      }
    };
  }

  /**
   * Decorates an async function with timing recording behaviour.
   *
   * This version of `timer` will record the time take for the asyncronus action returned by `func`
   * not just the execution time of `func` itself.
   *
   * @param {function} func The function to run
   * @param {string|string[]} stat - The stat(s) to send
   * @param {number} sampleRate - The Number of times to sample (0 to 1). Optional.
   * @param {string[]|object} tags - The Array of tags to add to metrics. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  asyncTimer(func, stat, sampleRate, tags, callback) {
    return (...args) => {
      const end = helpers.createHrTimer();
      const p = func(...args);
      const recordStat = () => { this.timing(stat, end(), sampleRate, tags, callback); };
      p.then(recordStat, recordStat);
      return p;
    };
  }

  /**
   * Increments a stat by a specified amount
   * @param {string|string[]} stat - The stat(s) to send
   * @param {number} value - The value to send
   * @param {number} sampleRate - The Number of times to sample (0 to 1). Optional.
   * @param {string[]|object} tags - The Array of tags to add to metrics. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  increment(stat, value, sampleRate, tags, callback) {
    // allow use of tags without explicit value or sampleRate
    if (arguments.length < 3) {
      if (typeof value !== 'number') {
        tags = value;
        value = undefined;
      }
    }

    // we explicitly check for undefined and null (and don't do a "! value" check)
    // so that 0 values are allowed and sent through as-is
    if (value === undefined || value === null) {
      value = 1;
    }
    this.sendAll(stat, value, 'c', sampleRate, tags, callback);
  }

  /**
   * Decrements a stat by a specified amount
   * @param {string|string[]} stat - The stat(s) to send
   * @param {number} value - The value to send
   * @param {number} sampleRate - The Number of times to sample (0 to 1). Optional.
   * @param {string[]|object} tags - The Array of tags to add to metrics. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  decrement(stat, value, sampleRate, tags, callback) {
    this.sendAll(stat, -value || -1, 'c', sampleRate, tags, callback);
  }

  /**
   * Represents the histogram stat
   * @param {string|string[]} stat - The stat(s) to send
   * @param {number} value - The value to send
   * @param {number} sampleRate - The Number of times to sample (0 to 1). Optional.
   * @param {string[]|object} tags - The Array of tags to add to metrics. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  histogram(stat, value, sampleRate, tags, callback) {
    this.sendAll(stat, value, 'h', sampleRate, tags, callback);
  }

  /**
   * Represents the distribution stat
   * @param {string|string[]} stat - The stat(s) to send
   * @param {number} value - The value to send
   * @param {number} sampleRate - The Number of times to sample (0 to 1). Optional.
   * @param {string[]|object} tags - The Array of tags to add to metrics. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  distribution(stat, value, sampleRate, tags, callback) {
    this.sendAll(stat, value, 'd', sampleRate, tags, callback);
  }

  /**
   * Gauges a stat by a specified amount
   * @param {string|string[]} stat - The stat(s) to send
   * @param {number} value - The value to send
   * @param {number} sampleRate - The Number of times to sample (0 to 1). Optional.
   * @param {string[]|object} tags - The Array of tags to add to metrics. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  gauge(stat, value, sampleRate, tags, callback) {
    this.sendAll(stat, value, 'g', sampleRate, tags, callback);
  }

  /**
   * Counts unique values by a specified amount
   * @param {string|string[]} stat - The stat(s) to send
   * @param {number} value - The value to send
   * @param {number} sampleRate - The Number of times to sample (0 to 1). Optional.
   * @param {string[]|object} tags - The Array of tags to add to metrics. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  unique(stat, value, sampleRate, tags, callback) {
    this.sendAll(stat, value, 's', sampleRate, tags, callback);
  }

  /**
   * Counts unique values by a specified amount
   * @param {string|string[]} stat - The stat(s) to send
   * @param {number} value - The value to send
   * @param {number} sampleRate - The Number of times to sample (0 to 1). Optional.
   * @param {string[]|object} tags - The Array of tags to add to metrics. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  set(stat, value, sampleRate, tags, callback) {
    this.sendAll(stat, value, 's', sampleRate, tags, callback);
  }

  /**
   * Send a service check
   * @param {string} name - The name of the service check
   * @param {number} status - The status of the service check (0 to 3).
   * @param {object} options - Additional options
   * @param {Date} options.date_happened - Assign a timestamp to the event. Default is now.
   * @param {string} options.hostname - Assign a hostname to the check.
   * @param {string} options.message - Assign a message to the check.
   * @param {string[]|object} tags - The Array of tags to add to the check. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  check(name, status, options, tags, callback) {
    if (this.telegraf) {
      const err = new Error('Not supported by Telegraf / InfluxDB');
      if (callback) {
        return callback(err);
      } else if (this.errorHandler) {
        return this.errorHandler(err);
      }

      throw err;
    }

    const check = ['_sc', this.prefix + name + this.suffix, status], metadata = options || {};

    if (metadata.date_happened) {
      const timestamp = helpers.formatDate(metadata.date_happened);
      if (timestamp) {
        check.push(`d:${timestamp}`);
      }
    }
    if (metadata.hostname) {
      check.push(`h:${metadata.hostname}`);
    }

    let mergedTags = this.globalTags;
    if (tags && typeof(tags) === 'object') {
      mergedTags = helpers.overrideTags(mergedTags, tags, this.telegraf);
    }
    if (mergedTags.length > 0) {
      check.push(`#${mergedTags.join(',')}`);
    }

    // message has to be the last part of a service check
    if (metadata.message) {
      check.push(`m:${metadata.message}`);
    }

    // allow for tags to be omitted and callback to be used in its place
    if (typeof tags === 'function' && callback === undefined) {
      callback = tags;
    }

    const message = check.join('|');
    // Service checks are unique in that message has to be the last element in
    // the stat if provided, so we can't append tags like other checks. This
    // directly calls the `_send` method to avoid appending tags, since we've
    // already added them.
    this._send(message, callback);
  }

  /**
   * Send on an event
   * @param {string} title - The title of the event
   * @param {string} text - The description of the event.  Optional- title is used if not given.
   * @param {object} options - Additional options
   * @param {Date} options.date_happened - Assign a timestamp to the event. Default is now.
   * @param {string} options.hostname - Assign a hostname to the event.
   * @param {string} options.aggregation_key - Assign an aggregation key to the event, to group it with some others.
   * @param {string} options.priority - Can be ‘normal’ or ‘low’. Default is 'normal'.
   * @param {string} options.source_type_name - Assign a source type to the event.
   * @param {string} options.alert_type - Can be ‘error’, ‘warning’, ‘info’ or ‘success’. Default is 'info'.
   * @param {string[]|object} tags - options.tags The Array of tags to add to metrics. Optional.
   * @param {function} callback - Callback when message is done being delivered. Optional.
   */
  event(title, text, options, tags, callback) {
    if (this.telegraf) {
      const err = new Error('Not supported by Telegraf / InfluxDB');
      if (callback) {
        return callback(err);
      }
      else if (this.errorHandler) {
        return this.errorHandler(err);
      }

      throw err;
    }

    // Convert to strings
    let message;

    const msgTitle = String(title ? title : '');
    let msgText = String(text ? text : msgTitle);
    // Escape new lines (unescaping is supported by DataDog)
    msgText = msgText.replace(/\n/g, '\\n');

    // start out the message with the event-specific title and text info
    message = `_e{${msgTitle.length},${msgText.length}}:${msgTitle}|${msgText}`;

    // add in the event-specific options
    if (options) {
      if (options.date_happened) {
        const timestamp = helpers.formatDate(options.date_happened);
        if (timestamp) {
          message += `|d:${timestamp}`;
        }
      }
      if (options.hostname) {
        message += `|h:${options.hostname}`;
      }
      if (options.aggregation_key) {
        message += `|k:${options.aggregation_key}`;
      }
      if (options.priority) {
        message += `|p:${options.priority}`;
      }
      if (options.source_type_name) {
        message += `|s:${options.source_type_name}`;
      }
      if (options.alert_type) {
        message += `|t:${options.alert_type}`;
      }
    }

    // allow for tags to be omitted and callback to be used in its place
    if (typeof tags === 'function' && callback === undefined) {
      callback = tags;
    }

    this.send(message, tags, callback);
  }

  /**
   * Creates a child client that adds prefix, suffix and/or tags to this client. Child client can itself have children.
   * @param {object} options
   * @param {string} options.prefix - An optional prefix to assign to each stat name sent
   * @param {string} options.suffix - An optional suffix to assign to each stat name sent
   * @param {string[]|object} options.globalTags - Optional tags that will be added to every metric
   */
  childClient(options) {
    return new StatsD({
      isChild     : true,
      socket      : this.socket, // Child inherits socket from parent. Parent itself can be a child.
      // All children and parent share the same buffer via sharing an object (cannot mutate strings)
      bufferHolder: this.bufferHolder,
      dnsError    : this.dnsError, // Child inherits an error from parent (if it is there)
      errorHandler: options.errorHandler || this.errorHandler, // Handler for callback errors
      host        : this.host,
      port        : this.port,
      prefix      : (options.prefix || '') + this.prefix, // Child has its prefix prepended to parent's prefix
      suffix      : this.suffix + (options.suffix || ''), // Child has its suffix appended to parent's suffix
      globalize   : false, // Only 'root' client can be global
      mock        : this.mock,
      // Append child's tags to parent's tags
      globalTags  : typeof options.globalTags === 'object' ?
          helpers.overrideTags(this.globalTags, options.globalTags, this.telegraf) : this.globalTags,
      maxBufferSize : this.maxBufferSize,
      bufferFlushInterval: this.bufferFlushInterval,
      telegraf    : this.telegraf,
      protocol    : this.protocol
    });
  }
}

module.exports = StatsD;
