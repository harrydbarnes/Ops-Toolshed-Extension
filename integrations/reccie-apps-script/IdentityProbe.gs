/** Private identity probe. No tracker access or writes. Deploy Only myself. */
function doGet() {
  var email = Session.getActiveUser().getEmail();
  return identityResponse_({
    ok: !!email,
    service: 'ops-toolshed-reccies-identity-probe',
    protocol: 1,
    writeEnabled: false,
    identityAvailable: !!email,
    activeEmail: email || null,
    error: email ? null : 'IDENTITY_UNAVAILABLE'
  });
}

function doPost() {
  return identityResponse_({ok:false,error:'READ_ONLY_PROBE',writeEnabled:false});
}

function identityResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
