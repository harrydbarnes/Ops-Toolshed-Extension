// Jest's upstream preset supports old Babel releases by installing syntax-only
// plugins with Babel 7 peers. Both Babel versions used here already parse the
// ECMAScript syntax supported by Node 24 without those legacy plugins.
module.exports = api => {
  api.assertVersion('^7.29.7 || ^8.0.0');
  return {};
};
