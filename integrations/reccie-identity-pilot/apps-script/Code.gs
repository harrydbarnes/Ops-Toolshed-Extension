/** Identity-only pilot: no spreadsheet services, IDs or write operations. */
function doGet(e) {
  var nonce = String(e && e.parameter && e.parameter.nonce || '');
  if (!/^[a-zA-Z0-9-]{20,80}$/.test(nonce)) return reply_({ok:false,error:'INVALID_NONCE',writeEnabled:false});
  // Never use an email supplied in the URL or body to identify the caller.
  var email = Session.getActiveUser().getEmail();
  return reply_({
    ok:!!email, service:'ops-toolshed-identity-pilot', protocol:1,
    nonce:nonce, identityAvailable:!!email, activeEmail:email || null,
    writeEnabled:false, error:email ? null : 'IDENTITY_UNAVAILABLE'
  });
}
function doPost() {
  return reply_({ok:false,service:'ops-toolshed-identity-pilot',protocol:1,error:'READ_ONLY_PROBE',writeEnabled:false});
}
function reply_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
