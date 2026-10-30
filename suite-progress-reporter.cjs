const fs = require('fs');
module.exports = class {
  onTestStart(test) { fs.appendFileSync('suite-progress.log', 'START ' + test.path + '\n'); }
  onTestResult(test, result) { fs.appendFileSync('suite-progress.log', 'END ' + test.path + ' failures=' + result.numFailingTests + '\n'); }
};
