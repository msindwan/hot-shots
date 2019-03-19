const StatsD = require('../../index');

jest.mock(
  'unix-dgram',
  () => {
    return {
      createSocket() {
        return {
          connect: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
          on: jest.fn(),
        };
      },
    };
  },
  { virtual: true }
);

describe('statsd with unix_dgram protocol', () => {
  const originalMathRandom = global.Math.random;
  let client;

  beforeAll(() => {
    global.Math.random = () => 0.3;
  });

  afterAll(() => {
    global.Math.random = originalMathRandom;
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (client) {
      client.close();
      client = null;
    }
  });

  test('mock disables emitting stats', () => {
    client = new StatsD({ maxBufferSize: 0, protocol: 'unix_dgram', mock: true });
    expect(client.mock).toEqual(true);

    client.increment('my.stat');
    expect(client.socket).toBeUndefined();
  });

  test('setting the sampling rate to 0 disables emitting stats', () => {
    client = new StatsD({ maxBufferSize: 0, protocol: 'unix_dgram', sampleRate: 0, mock: false });

    client.increment('my.stat');
    expect(client.socket.send).toHaveBeenCalledTimes(0);
  });

  test('emitted stats include sampling rate if < 1', () => {
    client = new StatsD({
      maxBufferSize: 0,
      protocol: 'unix_dgram',
      sampleRate: 0.5,
      mock: false,
      path: '/var/run/datadog/dsd.socket'
    });

    client.increment('my.stat');
    const buffer = Buffer.from('my.stat:1|c|@0.5');

    expect(client.socket.send).toHaveBeenCalledTimes(1);
    expect(client.socket.send).toHaveBeenCalledWith(
      buffer,
      expect.any(Function)
    );
  });

  test('emitted stats include custom tags', () => {
    client = new StatsD({
      maxBufferSize: 0,
      mock: false,
      protocol: 'unix_dgram',
      path: '/var/run/datadog/dsd.socket'
    });

    client.increment('my.stat', 5, ['a:tag', 'b:otherTag']);
    const buffer = Buffer.from('my.stat:5|c|#a:tag,b:otherTag');

    expect(client.socket.send).toHaveBeenCalledTimes(1);
    expect(client.socket.send).toHaveBeenCalledWith(
      buffer,
      expect.any(Function)
    );
  });

  test('emitted stats include global prefix', () => {
    client = new StatsD({
      maxBufferSize: 0,
      mock: false,
      prefix: 'myPrefix.',
      protocol: 'unix_dgram',
      path: '/var/run/datadog/dsd.socket'
    });

    client.increment('my.stat', 5, ['a:tag', 'b:otherTag']);
    const buffer = Buffer.from('myPrefix.my.stat:5|c|#a:tag,b:otherTag');

    expect(client.socket.send).toHaveBeenCalledTimes(1);
    expect(client.socket.send).toHaveBeenCalledWith(
      buffer,
      expect.any(Function)
    );
  });

  test('stats are emitted if the in-memory buffer is disabled', () => {
    client = new StatsD({
      maxBufferSize: 0,
      mock: false,
      protocol: 'unix_dgram',
      path: '/var/run/datadog/dsd.socket'
    });
    client.increment('inc1.stat');
    client.increment('inc2.stat');
    client.decrement('dec1.stat');
    client.decrement('dec2.stat');

    expect(client.socket.send).toHaveBeenCalledTimes(4);

    [
      Buffer.from('inc1.stat:1|c'),
      Buffer.from('inc2.stat:1|c'),
      Buffer.from('dec1.stat:-1|c'),
      Buffer.from('dec2.stat:-1|c'),
    ].forEach((buffer, index) => {
      expect(client.socket.send).toHaveBeenNthCalledWith(
        index + 1,
        buffer,
        expect.any(Function)
      );
    });
  });

  test('stats are emitted if the in-memory buffer is enabled', done => {
    client = new StatsD({
      maxBufferSize: 150,
      flushInterval: 500,
      mock: false,
      protocol: 'unix_dgram',
      path: '/var/run/datadog/dsd.socket'
    });
    client.increment('inc1.stat');
    client.increment('inc2.stat');
    client.decrement('dec1.stat');
    client.decrement('dec2.stat');

    setTimeout(() => {
      const buffer = Buffer.from('inc1.stat:1|c\ninc2.stat:1|c\ndec1.stat:-1|c\ndec2.stat:-1|c\n');
      expect(client.socket.send).toHaveBeenCalledTimes(1);
      expect(client.socket.send).toHaveBeenCalledWith(
        buffer,
        expect.any(Function)
      );
      done();
    }, 1000);
  });

  test('stats are emitted if the in-memory buffer is full', () => {
    client = new StatsD({
      maxBufferSize: 30,
      flushInterval: 5000,
      mock: false,
      protocol: 'unix_dgram',
      path: '/var/run/datadog/dsd.socket'
    });
    client.increment('inc1.stat');
    client.increment('inc2.stat');
    client.increment('inc3.stat');

    const buffer = Buffer.from('inc1.stat:1|c\ninc2.stat:1|c\n');
    expect(client.socket.send).toHaveBeenCalledTimes(1);
    expect(client.socket.send).toHaveBeenCalledWith(
      buffer,
      expect.any(Function)
    );
  });

  test('stats are not emitted if the in-memory buffer is empty', done => {
    client = new StatsD({
      maxBufferSize: 30,
      flushInterval: 100,
      mock: false,
      protocol: 'unix_dgram',
      path: '/var/run/datadog/dsd.socket'
    });
    setTimeout(() => {
      expect(client.socket.send).toHaveBeenCalledTimes(0);
      done();
    }, 200);
  });

  test('closing the client emits anything remaning in the buffer', done => {
    client = new StatsD({
      maxBufferSize: 150,
      flushInterval: 500,
      mock: false,
      protocol: 'unix_dgram',
      path: '/var/run/datadog/dsd.socket'
    });
    client.increment('inc1.stat');
    client.close();

    expect(client.socket.send).toHaveBeenCalledTimes(1);
    expect(client.socket.send).toHaveBeenCalledTimes(1);
    setTimeout(() => {
      expect(client.socket.send).toHaveBeenCalledTimes(1);
      done();
    }, 1000);
  });
});
