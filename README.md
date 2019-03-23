# hot-shots-posix

A StatsD client forked from https://github.com/brightcove/hot-shots with additional support for POSIX-compliant systems.

[![npm version](https://badge.fury.io/js/hot-shots-posix.svg)](https://badge.fury.io/js/hot-shots-posix)

[API Documentation and usage](https://msindwan.github.io/hot-shots-posix/)

## Quick Start

```js
const StatsD = require('hot-shots-posix');

// Create the client
const client = new StatsD({
  path: '/path/to/uds',
  protocol: 'unix_dgram',
  errorHandler: (err) => {
    console.error(err);
  }
});

// Start emitting metrics.
client.incremment('my.stat');
client.decrement('my.stat');
```

## Requirements

* Node.js >= 6.0.0

## Development

To bootstrap your development environment:

1. Clone hot-shots-posix
2. Run `npm install`

## Tests

- `npm run test` - runs all tests
- `npm run test-unit` - runs unit tests
- `npm run test-integration` - runs integration tests
- `npm run lint` - runs linter

## License

hot-shots-posix is licensed under the MIT license.
