const { default: Environment } = require('@jest/environment-jsdom-abstract');
const jsdom = require('../node_modules/jsdom');

module.exports = class extends Environment {
    constructor(config, context) {
        super(config, context, jsdom);
    }
};
