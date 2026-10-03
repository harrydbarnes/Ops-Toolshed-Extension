module.exports = {
  testEnvironment: "node",
  setupFiles: ["./tests/mocks/chrome.js", "./tests/mocks/document.js"],
  setupFilesAfterEnv: ["./tests/helpers/cleanup.js"],
  moduleNameMapper: { '^jsdom$': '<rootDir>/tests/helpers/jsdom.js' },
  globals: { __collectScriptCoverage: process.argv.includes('--coverage') },
  collectCoverage: false,
  coverageReporters: ["json", "lcov", "text", "clover"],
  coverageDirectory: "coverage",
  transform: {
    "^.+\\.js$": "babel-jest",
  },
};
