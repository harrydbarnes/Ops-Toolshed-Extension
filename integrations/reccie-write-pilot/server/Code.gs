/** Guarded pilot only. Remote access registry; one-shot round trip, never general writes. */
var SERVICE_ = 'ops-toolshed-write-pilot';
function doGet(e) {
  try {
    var email = authorisedUser_();
    var nonce = String(e && e.parameter && e.parameter.nonce || '');
    if (!/^[a-zA-Z0-9-]{20,80}$/.test(nonce)) throw new Error('INVALID_NONCE');
    var props = PropertiesService.getScriptProperties();
    var tester = email === props.getProperty('TESTER_EMAIL');
    return reply_({ok:true,email:email,nonce:nonce,allowed:true,tester:tester,
      testEnabled:tester && props.getProperty('WRITE_TEST_ENABLED') === 'true'});
  } catch (error) { return failure_(error); }
}
function doPost(e) {
  var lock, acquired = false;
  try {
    var email = authorisedUser_(); // Always reread the remote registry, including after preparation.
    var input;
    try { input = JSON.parse(e && e.postData && e.postData.contents || '{}'); }
    catch (_) { throw new Error('INVALID_REQUEST'); }
    if (!input || !['prepare','roundTrip'].includes(input.operation)) throw new Error('INVALID_REQUEST');
    var props = PropertiesService.getScriptProperties();
    if (email !== props.getProperty('TESTER_EMAIL') || props.getProperty('WRITE_TEST_ENABLED') !== 'true') throw new Error('WRITE_TEST_DISABLED');
    lock = LockService.getScriptLock(); acquired = lock.tryLock(10000);
    if (!acquired) throw new Error('BUSY');
    authorisedUser_();
    if (email !== props.getProperty('TESTER_EMAIL') || props.getProperty('WRITE_TEST_ENABLED') !== 'true') throw new Error('WRITE_TEST_DISABLED');
    var cache = CacheService.getScriptCache();
    if (input.operation === 'prepare') {
      var target = findTarget_();
      if (target.cell.getFormula() || target.cell.getValue() !== 'No') throw new Error('ORIGINAL_NOT_NO_NO_WRITE');
      var token = Utilities.getUuid();
      cache.put('roundtrip:' + token, email, 120);
      return reply_({ok:true,testOnly:true,token:token,expiresInSeconds:120,
        dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09',sheet:'Reccie report',
        row:target.row,original:'No',sequence:['No','Yes','No']});
    }
    if (typeof input.token !== 'string' || !/^[a-zA-Z0-9-]{20,80}$/.test(input.token) || cache.get('roundtrip:' + input.token) !== email) throw new Error('TOKEN_EXPIRED_USED_OR_WRONG_USER');
    cache.remove('roundtrip:' + input.token);
    // One execution per explicit arm, including failures. Re-arm privately for another test.
    props.setProperty('WRITE_TEST_ENABLED','false');
    var result = roundTrip_(email);
    console.log(JSON.stringify({event:'reccieRoundTrip',at:new Date().toISOString(),email:email,result:result}));
    return reply_(result);
  } catch (error) { return failure_(error); }
  finally { if (acquired) lock.releaseLock(); }
}
function authorisedUser_() {
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw new Error('IDENTITY_UNAVAILABLE');
  if (PropertiesService.getScriptProperties().getProperty('ALLOW_' + email) !== 'true') throw new Error('ACCESS_DENIED');
  return email;
}
function findTarget_() {
  // This pilot accepts no tracker ID, tab, D number, campaign or range from a client.
  var sheet = SpreadsheetApp.openById('1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU').getSheetByName('Reccie report');
  if (!sheet) throw new Error('REPORT_NOT_FOUND');
  var rows = sheet.getDataRange().getDisplayValues(), headers = rows[0] || [];
  function column(name) {
    if (headers.filter(function(value) { return value === name; }).length !== 1) throw new Error('HEADERS_CHANGED_NO_WRITE');
    return headers.indexOf(name);
  }
  var d = column('Serial Number'), c = column('Campaign ID Mediaocean'), date = column('Booking End Date'), rec = column('Reccied');
  var matches = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][d]).trim().toUpperCase() === 'D03120200' && String(rows[i][c]).trim().toUpperCase() === 'CP3G9KS' && rows[i][date] === '06/09/2026') matches.push(i + 1);
  }
  if (matches.length !== 1) throw new Error('TARGET_NOT_UNIQUE_NO_WRITE');
  return {cell:sheet.getRange(matches[0],rec + 1),row:matches[0]};
}
function roundTrip_(email) {
  var target = findTarget_(), cell = target.cell;
  if (cell.getFormula() || cell.getValue() !== 'No') throw new Error('ORIGINAL_NOT_NO_NO_WRITE');
  var rule = cell.getDataValidation();
  if (rule && (rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST ||
      !rule.getCriteriaValues()[0].includes('Yes') || !rule.getCriteriaValues()[0].includes('No'))) throw new Error('VALIDATION_CHANGED_NO_WRITE');
  var failure = '', yesConfirmed = false, restored = false;
  try {
    cell.setValue('Yes'); SpreadsheetApp.flush();
    var after = findTarget_();
    yesConfirmed = !after.cell.getFormula() && after.cell.getValue() === 'Yes';
    if (!yesConfirmed) throw new Error('YES_NOT_CONFIRMED');
  } catch (_) { failure = 'YES_WRITE_OR_CONFIRM_FAILED'; }
  finally {
    try {
      var restore = findTarget_();
      if (restore.cell.getFormula() || !['No','Yes'].includes(restore.cell.getValue())) throw new Error('TARGET_CHANGED');
      restore.cell.setValue('No'); SpreadsheetApp.flush();
      var readback = findTarget_();
      restored = !readback.cell.getFormula() && readback.cell.getValue() === 'No';
    } catch (_) { failure = 'RESTORE_FAILED_CHECK_TRACKER'; }
  }
  return {ok:yesConfirmed && restored && !failure,testOnly:true,email:email,dNumber:'D03120200',
    campaignId:'CP3G9KS',month:'2026-09',original:'No',yesConfirmed:yesConfirmed,restored:restored,
    initialRow:target.row,error:restored ? failure : 'RESTORE_FAILED_CHECK_TRACKER'};
}
function failure_(error) {
  var code = /^[A-Z_]+$/.test(String(error.message)) ? error.message : 'SERVICE_ERROR';
  console.error(code);
  return reply_({ok:false,error:code});
}
function reply_(body) {
  body.service = SERVICE_; body.protocol = 1;
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
