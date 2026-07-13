module.exports = {
  testEnvironment: "node",
  setupFiles: ["./tests/mocks/chrome.js", "./tests/mocks/document.js"],
  collectCoverage: false,
  coverageReporters: ["json", "lcov", "text", "clover"],
  coverageDirectory: "coverage",
  transform: {
    "^.+\\.js$": "babel-jest",
  },
};
