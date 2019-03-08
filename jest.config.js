module.exports = {
  testRegex: '(/unit/.*|(\\.|/)(test|spec))\\.js$',
  moduleFileExtensions: ['js', 'json', 'node'],
  testEnvironment: 'node',
  cache: false,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/'],
};
