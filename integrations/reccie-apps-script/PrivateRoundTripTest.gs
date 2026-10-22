/** Private, single-cell round-trip test. Not a general tracker writer. */
function doGet() {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('reccie-test:' + token, 'pending', 120);
  return reccieTestResponse_({ok:true,service:'ops-toolshed-reccies-write-test',
    writeEnabled:false, testOnly:true, target:'Reccie report!Q208', token:token});
}

function doPost(e) {
  var input;
  try { input = JSON.parse(e && e.postData && e.postData.contents || '{}'); }
  catch (_) { return reccieTestResponse_({ok:false,error:'INVALID_REQUEST'}); }
  if (input.operation !== 'roundTrip' || typeof input.token !== 'string' ||
      !/^[a-zA-Z0-9-]{20,80}$/.test(input.token)) {
    return reccieTestResponse_({ok:false,error:'INVALID_REQUEST'});
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return reccieTestResponse_({ok:false,error:'BUSY'});
  try {
    var cache = CacheService.getScriptCache(), cacheKey = 'reccie-test:' + input.token;
    if (cache.get(cacheKey) !== 'pending') return reccieTestResponse_({ok:false,error:'TOKEN_EXPIRED_OR_USED'});
    cache.remove(cacheKey);
    return reccieTestResponse_(reccieRoundTrip_());
  } catch (error) { return reccieTestResponse_({ok:false,error:String(error.message)}); }
  finally { lock.releaseLock(); }
}

function reccieRoundTrip_() {
  var book = SpreadsheetApp.openById('1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU');
  var sheet = book.getSheetByName('Reccie report');
  if (!sheet) throw new Error('REPORT_NOT_FOUND');
  var headers = sheet.getRange('B1:Q1').getDisplayValues()[0];
  var row = sheet.getRange('B208:Q208').getDisplayValues()[0];
  if (headers[0] !== 'Serial Number' || headers[5] !== 'Campaign ID Mediaocean' || headers[15] !== 'Reccied' ||
      row[0] !== 'D03120200' || row[5] !== 'CP3G9KS' || row[7] !== '06/09/2026') {
    throw new Error('TARGET_CHANGED_NO_WRITE');
  }
  var cell = sheet.getRange('Q208');
  if (cell.getFormula() || cell.getValue() !== 'No') throw new Error('ORIGINAL_NOT_NO_NO_WRITE');
  var rule = cell.getDataValidation();
  if (rule && (rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST ||
      !rule.getCriteriaValues()[0].includes('Yes') || !rule.getCriteriaValues()[0].includes('No'))) {
    throw new Error('VALIDATION_CHANGED_NO_WRITE');
  }
  var failure = '', restored = false;
  try {
    cell.setValue('Yes'); SpreadsheetApp.flush();
    if (cell.getValue() !== 'Yes') throw new Error('YES_NOT_CONFIRMED');
  } catch (error) { failure = String(error.message); }
  finally {
    // Always restore the captured/validated original, including after a failed Yes write.
    try { cell.setValue('No'); SpreadsheetApp.flush(); restored = cell.getValue() === 'No'; }
    catch (error) { failure += '; restore: ' + String(error.message); }
  }
  return {ok:!failure && restored,testOnly:true,target:'Reccie report!Q208',
    dNumber:'D03120200',original:'No',restored:restored,
    error:restored ? failure : 'RESTORE_FAILED: ' + failure};
}

function reccieTestResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
