/** Editor-only one-time setup. Remove this seed file before web deployment. */
function seedAccess_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('ACL_INITIALIZED')) throw new Error('ACCESS_LIST_ALREADY_INITIALIZED');
  var emails = [
    'akashsingh.bisht@wppmedia.com','ellie.vigors@wppmedia.com','harry.barnes@wppmedia.com',
    'isobel.shaw@wppmedia.com','jett.hudson@wppmedia.com','lauren.pringle@wppmedia.com',
    'm.lupu@wppmedia.com','matt.akerman@wppmedia.com','rita.bressi@wppmedia.com',
    'santiago.feberero@wppmedia.com','scott.moore@wppmedia.com','shreya.gurung@wppmedia.com',
    'steve.conway@wppmedia.com','trish.costa@wppmedia.com','meghana.ms@wppmedia.com',
    'jaisree.am@wppmedia.com','isobel.shaw@groupm.com','santiago.feberero@groupm.com',
    'trish.costa@groupm.com','frank.savidge@wppmedia.com'
  ];
  var values = {ACL_INITIALIZED:'true',TESTER_EMAIL:'harry.barnes@wppmedia.com',WRITE_TEST_ENABLED:'false'};
  emails.forEach(function(email) { values['ALLOW_' + email] = 'true'; });
  props.setProperties(values,false);
  return {configuredUsers:emails.length,writeTestEnabled:false};
}
