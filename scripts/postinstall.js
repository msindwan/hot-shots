/**
 * Verifies the installation of optional dependencies for supported platforms.
 */
if (process.platform !== 'win32') {
  try {
    require('unix-dgram');
  } catch (ex) {
    throw new Error('Failed to install unix-dgram on supported platform.', ex);
  }
}
