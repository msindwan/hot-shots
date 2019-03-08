const execSync = require('child_process').execSync; // eslint-disable-line no-sync
const StatsD = require('../../index.js');
const assert = require('assert');
const helpers = require('./helpers/helpers.js');

const closeAll = helpers.closeAll;
const testTypes = helpers.testTypes;
const createServer = helpers.createServer;
const createHotShotsClient = helpers.createHotShotsClient;

const TIMER_BUFFER = 200;

describe('#timer', () => {
  let server;
  let statsd;

  afterEach(done => {
    closeAll(server, statsd, false, done);
  });

  testTypes().forEach(([description, serverType, clientType]) => {
    describe(description, () => {

      it('should send stat and time to execute to timing function', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          const testFn = (a, b) => {
            return a + b;
          };
          statsd.timer(testFn, 'test')(2, 2);
        });
        server.on('metrics', metrics => {
          // Search for a string similar to 'test:0.123|ms'
          const re = RegExp('(test:)([0-9]+.[0-9]+)\\|{1}(ms)');
          assert.equal(true, re.test(metrics));
          done();
        });
      });

      it('should send data with tags to timing function', done => {
        server = createServer(serverType, address => {
          statsd = createHotShotsClient({
            host: address.address,
            port: address.port,
            protocol: serverType
          }, clientType);
          const testFn = (a, b) => {
            return a + b;
          };
          statsd.timer(testFn, 'test', undefined, ['foo', 'bar'])(2, 2);
        });
        server.on('metrics', metrics => {
          // Search for a string similar to 'test:0.123|ms|#foo,bar'
          const re = RegExp('(test:)([0-9]+.[0-9]+)\\|{1}(ms)\\|{1}\\#(foo,bar)');
          assert.equal(true, re.test(metrics));
          done();
        });
      });
    });
  });

  it('should record "real" time of function call', () => {
    statsd = new StatsD({ mock:true });
    const instrumented = statsd.timer(sleep(100), 'blah');

    instrumented();

    const timeFromStatLine = statsd.mockBuffer[0].match(/blah:(\d+\.\d+)\|/)[1];

    assert.ok(timeFromStatLine >= 99);
    assert.ok(timeFromStatLine < (100 + TIMER_BUFFER));
  });

  it('should record "user time" of promise', () => {
    /* globals Promise */
    statsd = new StatsD({ mock:true });

    const onehundredMsFunc = () => { return delay(100); };

    const instrumented = statsd.asyncTimer(onehundredMsFunc, 'name-thingy');

    return instrumented().then(() => {

      const stat = statsd.mockBuffer[0];
      const name = stat.split(/:|\|/)[0];
      const time = stat.split(/:|\|/)[1];

      assert.equal(name, 'name-thingy');
      assert.ok(parseFloat(time) >= 99);
      assert.ok(parseFloat(time) < (100 + TIMER_BUFFER));
    });
  });
});

/**
 * Use system sleep for given milliseconds
 */
function sleep(ms) {
  return () => {
    execSync(`sleep ${ms / 1000}`);
  };
}

/**
 * Delay with a promise for given milliseconds
 */
function delay(n) {
  return new Promise((resolve) => {
    setTimeout(resolve, n);
  });
}
