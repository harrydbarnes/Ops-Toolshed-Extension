/** Temporary authentication/transport probe. No spreadsheet data or writes. */
function doGet() {
  return reccieProbeResponse_({
    ok: true,
    service: 'ops-toolshed-reccies-probe',
    protocol: 1,
    writeEnabled: false
  });
}

function doPost() {
  return reccieProbeResponse_({
    ok: false,
    service: 'ops-toolshed-reccies-probe',
    error: 'READ_ONLY_PROBE',
    writeEnabled: false
  });
}

function reccieProbeResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
