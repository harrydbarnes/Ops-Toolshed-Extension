/** Manual tracker writer. Uses the existing private ALLOW_<email> registry. */
var WRITER_SERVICE_ = 'ops-toolshed-reccies-writer';
var TRACKER_ID_ = '1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU';
var MAX_ROWS_ = 100;
function doGet(e) {
  try { var actor = actor_(); return reply_({ok:true,email:actor,manualEnabled:enabled_()}); }
  catch (error) { return fail_(error); }
}
function doPost(e) {
  var lock, acquired = false;
  try {
    var actor = actor_(), input;
    try { input = JSON.parse(e && e.postData && e.postData.contents || '{}'); } catch (_) { throw Error('INVALID_REQUEST'); }
    if (!input || !['preview','commit','status'].includes(input.operation)) throw Error('INVALID_REQUEST');
    if (input.operation === 'status') return reply_(receipt_(input.requestId,actor));
    if (!enabled_()) throw Error('MANUAL_WRITES_DISABLED');
    lock = LockService.getScriptLock(); acquired = lock.tryLock(10000);
    if (!acquired) throw Error('BUSY_TRY_AGAIN');
    actor_(); if (!enabled_()) throw Error('MANUAL_WRITES_DISABLED');
    if (input.operation === 'preview') return reply_(preview_(input,actor));
    return reply_(commit_(input,actor));
  } catch (error) { return fail_(error); }
  finally { if (acquired) lock.releaseLock(); }
}
function actor_() {
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw Error('IDENTITY_UNAVAILABLE');
  if (PropertiesService.getScriptProperties().getProperty('ALLOW_' + email) !== 'true') throw Error('ACCESS_DENIED');
  return email;
}
function enabled_() { return PropertiesService.getScriptProperties().getProperty('MANUAL_WRITES_ENABLED') === 'true'; }
function validId_(id) { return typeof id === 'string' && /^[a-zA-Z0-9-]{20,80}$/.test(id); }
function validate_(input) {
  if (!['main','early'].includes(input.mode) || !/^20\d\d-(0[1-9]|1[0-2])$/.test(input.month || '') ||
      !Array.isArray(input.rows) || !input.rows.length || input.rows.length > MAX_ROWS_) throw Error('INVALID_SELECTION');
  var seen = {};
  return input.rows.map(function(row) {
    if (!row || !/^D\d{5,15}$/.test(row.dNumber || '') || !/^CP[A-Z0-9]{3,20}$/.test(row.campaignId || '')) throw Error('INVALID_SELECTION');
    var key = row.dNumber + '/' + row.campaignId;
    if (seen[key]) throw Error('DUPLICATE_SELECTION'); seen[key] = true;
    return {dNumber:row.dNumber,campaignId:row.campaignId};
  });
}
function month_(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  var m, year, month, day;
  if ((m = text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})(?:T.*)?$/))) { year=+m[1];month=+m[2];day=+m[3]; }
  else if ((m = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}|\d{2})$/))) { day=+m[1];month=+m[2];year=+m[3];if(year<100)year+=2000; }
  else return null;
  var d = new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year && d.getUTCMonth()===month-1 && d.getUTCDate()===day ? year+'-'+('0'+month).slice(-2) : null;
}
function snapshot_(mode) {
  var sheet = SpreadsheetApp.openById(TRACKER_ID_).getSheetByName(mode==='early'?'Early Reccie report':'Reccie report');
  if (!sheet) throw Error('REPORT_NOT_FOUND');
  var range=sheet.getDataRange(), display=range.getDisplayValues(), values=range.getValues(), formulas=range.getFormulas();
  var headers=(display[0] || []).map(function(value){return String(value).trim().toLowerCase();});
  if(headers.indexOf('campaign id mediaocean')<0 && headers.indexOf('campaign id')>=0)headers[headers.indexOf('campaign id')]='campaign id mediaocean';
  function col(name){if(headers.filter(function(value){return value===name;}).length!==1)throw Error('HEADERS_CHANGED');return headers.indexOf(name);}
  var columns={d:col('serial number'),c:col('campaign id mediaocean'),date:col('booking end date'),rec:col('reccied')};
  var months={},invalid=false;
  for(var i=1;i<display.length;i++){
    var date=values[i][columns.date], month=date instanceof Date ? Utilities.formatDate(date,sheet.getParent().getSpreadsheetTimeZone(),'yyyy-MM') : month_(display[i][columns.date]);
    if(month===null)invalid=true; if(month)months[month]=true;
  }
  var uniform=Object.keys(months).length===1&&!invalid?Object.keys(months)[0]:null;
  return {sheet:sheet,display:display,values:values,formulas:formulas,columns:columns,uniform:uniform};
}
function match_(snapshot,item,month) {
  var s=snapshot,c=s.columns,matches=[];
  for(var i=1;i<s.display.length;i++){
    if(String(s.display[i][c.d]).trim().toUpperCase()!==item.dNumber || String(s.display[i][c.c]).trim().toUpperCase()!==item.campaignId)continue;
    var raw=s.values[i][c.date], actual=raw instanceof Date ? Utilities.formatDate(raw,s.sheet.getParent().getSpreadsheetTimeZone(),'yyyy-MM') : month_(s.display[i][c.date]);
    if((actual || (actual===''?s.uniform:null))===month)matches.push(i);
  }
  var result={dNumber:item.dNumber,campaignId:item.campaignId,month:month};
  if(matches.length!==1)return Object.assign(result,{state:'skipped',reason:matches.length?'Duplicate tracker match':'No unique match for this report month'});
  var index=matches[0],before=s.values[index][c.rec];
  if(s.formulas[index][c.rec])return Object.assign(result,{state:'skipped',reason:'Tracker value is a formula'});
  if(typeof before!=='string')return Object.assign(result,{state:'skipped',reason:'Unexpected tracker value'});
  result.before=before;result.row=index+1;
  if(before.trim().toLowerCase()==='yes')return Object.assign(result,{state:'already_yes',after:'Yes',confirmed:true});
  if(!['','no'].includes(before.trim().toLowerCase()))return Object.assign(result,{state:'skipped',reason:'Unexpected tracker value'});
  return Object.assign(result,{state:'eligible'});
}
function preview_(input,actor) {
  var rows=validate_(input),snapshot=snapshot_(input.mode),id=Utilities.getUuid(),token=Utilities.getUuid();
  var results=rows.map(function(row){return match_(snapshot,row,input.month);});
  var record={actor:actor,mode:input.mode,month:input.month,results:results,token:token};
  CacheService.getScriptCache().put('manual:'+id,JSON.stringify(record),120);
  return {ok:true,requestId:id,token:token,expiresInSeconds:120,mode:input.mode,month:input.month,results:results};
}
function auditBook_() {
  var id=PropertiesService.getScriptProperties().getProperty('AUDIT_SPREADSHEET_ID');
  if(!id)throw Error('AUDIT_NOT_CONFIGURED');
  var book=SpreadsheetApp.openById(id);
  if(!book.getSheetByName('Requests')||!book.getSheetByName('Changes'))throw Error('AUDIT_NOT_CONFIGURED');
  return book;
}
function requestRow_(sheet,id,actor) {
  if(!validId_(id))throw Error('INVALID_REQUEST_ID');
  var rows=sheet.getDataRange().getValues();
  for(var i=1;i<rows.length;i++)if(rows[i][0]===id){if(rows[i][1]!==actor)throw Error('ACCESS_DENIED');return {row:i+1,values:rows[i]};}
  return null;
}
function receipt_(id,actor,insideCommit) {
  var book=auditBook_(),sheet=book.getSheetByName('Requests'),row=requestRow_(sheet,id,actor);
  if(!row)return {ok:true,requestId:id,state:'not_started',results:[]};
  if(row.values[5]==='pending'&&!insideCommit){
    var recoveryLock=LockService.getScriptLock(),acquired=recoveryLock.tryLock(1);
    if(acquired)try{
      row=requestRow_(sheet,id,actor);
      if(row.values[5]==='pending'){
        var current=snapshot_(row.values[2]),pending=JSON.parse(row.values[6]);
        var recovered=pending.map(function(prior){
          if(!['eligible','already_yes'].includes(prior.state))return prior;
          var fresh=match_(current,prior,row.values[3]);
          return Object.assign({},prior,{state:fresh.state==='already_yes'?'already_yes':'failed',after:fresh.state==='already_yes'?'Yes':null,confirmed:fresh.state==='already_yes',reason:fresh.state==='already_yes'?'Recovered: current tracker Yes confirmed':'Interrupted save: no saved Yes confirmed; refresh before retrying'});
        });
        journal_(book.getSheetByName('Changes'),recovered.map(function(r){return [new Date().toISOString(),id,actor,row.values[2],row.values[3],r.dNumber,r.campaignId,r.before||'',r.after||'',r.state,'Recovery: '+(r.reason||'')];}));
        sheet.getRange(row.row,6,1,2).setValues([['complete',JSON.stringify(recovered)]]);SpreadsheetApp.flush();
        row=requestRow_(sheet,id,actor);
      }
    }finally{recoveryLock.releaseLock();}
  }
  return {ok:true,requestId:id,mode:row.values[2],month:row.values[3],state:row.values[5],results:row.values[6]?JSON.parse(row.values[6]):[]};
}
function journal_(sheet,rows) { if(rows.length){sheet.getRange(sheet.getLastRow()+1,1,rows.length,11).setValues(rows);SpreadsheetApp.flush();} }
function commit_(input,actor) {
  if(!validId_(input.requestId))throw Error('INVALID_REQUEST_ID');
  var book=auditBook_(),requests=book.getSheetByName('Requests'),existing=requestRow_(requests,input.requestId,actor);
  if(existing)return receipt_(input.requestId,actor,true); // Idempotent: no second write for a request ID.
  var cache=CacheService.getScriptCache(),raw=cache.get('manual:'+input.requestId),record=raw?JSON.parse(raw):null;
  if(!record||record.actor!==actor||typeof input.token!=='string'||record.token!==input.token)throw Error('PREVIEW_EXPIRED_OR_WRONG_USER');
  cache.remove('manual:'+input.requestId);
  var requestRow=requests.getLastRow()+1,stamp=new Date().toISOString();
  requests.getRange(requestRow,1,1,7).setValues([[input.requestId,actor,record.mode,record.month,stamp,'pending',JSON.stringify(record.results)]]);SpreadsheetApp.flush();
  var results=record.results.map(function(row){return Object.assign({},row);}), changes=book.getSheetByName('Changes');
  var snapshot=snapshot_(record.mode),eligible=[];
  results.forEach(function(result,index){
    if(!['eligible','already_yes'].includes(result.state))return;
    var fresh=match_(snapshot,result,record.month);
    if(fresh.state==='already_yes'){results[index]=fresh;return;}
    if(result.state!=='eligible'||fresh.state!=='eligible'||fresh.before!==result.before){results[index]=Object.assign(fresh,{state:'skipped',confirmed:false,reason:'Tracker changed since preview'});return;}
    var cell=snapshot.sheet.getRange(fresh.row,snapshot.columns.rec+1),rule=cell.getDataValidation();
    if(rule&&(rule.getCriteriaType()!==SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST||!rule.getCriteriaValues()[0].includes('Yes'))){results[index]=Object.assign(fresh,{state:'skipped',reason:'Tracker validation needs review'});return;}
    results[index]=fresh;eligible.push(index);
  });
  journal_(changes,eligible.map(function(index){var r=results[index];return [stamp,input.requestId,actor,record.mode,record.month,r.dNumber,r.campaignId,r.before,'Yes','intent','Manual confirmation'];}));
  var writeError=false;
  try {
    // Audit storage can take time: rematch once more immediately before writing.
    snapshot=snapshot_(record.mode);
    eligible=eligible.filter(function(index){
      var fresh=match_(snapshot,results[index],record.month);
      if(fresh.state==='already_yes'){results[index]=fresh;return false;}
      if(fresh.state!=='eligible'||fresh.before!==results[index].before){results[index]=Object.assign(fresh,{state:'skipped',confirmed:false,reason:'Tracker changed before saving'});return false;}
      var rule=snapshot.sheet.getRange(fresh.row,snapshot.columns.rec+1).getDataValidation();
      if(rule&&(rule.getCriteriaType()!==SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST||!rule.getCriteriaValues()[0].includes('Yes'))){results[index]=Object.assign(fresh,{state:'skipped',confirmed:false,reason:'Tracker validation needs review'});return false;}
      results[index]=fresh;return true;
    });
    if(eligible.length){snapshot.sheet.getRangeList(eligible.map(function(index){return snapshot.sheet.getRange(results[index].row,snapshot.columns.rec+1).getA1Notation();})).setValue('Yes');SpreadsheetApp.flush();}
  } catch (_) {writeError=true;}
  var readback;
  try {readback=snapshot_(record.mode);}catch(_){readback=null;}
  results.forEach(function(result,index){
    if(!eligible.includes(index)&&result.state!=='already_yes')return;
    var wasWritten=eligible.includes(index);
    var before=results[index],after=readback?match_(readback,before,record.month):null;
    results[index]=Object.assign({},before,{state:after&&after.state==='already_yes'?(wasWritten?'updated':'already_yes'):'failed',after:after&&after.state==='already_yes'?'Yes':null,confirmed:!!after&&after.state==='already_yes',reason:after&&after.state==='already_yes'?'':writeError?'Write failed; refresh the tracker before retrying':'Could not confirm saved Yes; refresh the tracker'});
  });
  journal_(changes,results.map(function(r){return [new Date().toISOString(),input.requestId,actor,record.mode,record.month,r.dNumber,r.campaignId,r.before||'',r.after||'',r.state,r.reason||''];}));
  requests.getRange(requestRow,6,1,2).setValues([['complete',JSON.stringify(results)]]);SpreadsheetApp.flush();
  return {ok:true,requestId:input.requestId,mode:record.mode,month:record.month,state:'complete',results:results};
}
function reply_(body){body.service=WRITER_SERVICE_;body.protocol=1;return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);}
function fail_(error){var message=/^[A-Z_]+$/.test(String(error.message))?error.message:'SERVICE_ERROR_CHECK_SAVE_STATUS';console.error(message);return reply_({ok:false,error:message});}

/** Editor-only storage setup. Does not enable manual writes or edit the tracker. */
function setupAudit_(){
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty('AUDIT_SPREADSHEET_ID'))return {id:props.getProperty('AUDIT_SPREADSHEET_ID'),created:false};
  var book=SpreadsheetApp.create('Ops Toolshed Reccie Update Audit'),changes=book.getSheets()[0];changes.setName('Changes');
  changes.getRange(1,1,1,11).setValues([['Timestamp','Request ID','Actor','Mode','Report month','D number','Campaign ID','Before','After','Outcome','Detail']]);changes.setFrozenRows(1);
  var requests=book.insertSheet('Requests');requests.getRange(1,1,1,7).setValues([['Request ID','Actor','Mode','Report month','Started','State','Results JSON']]);requests.setFrozenRows(1);
  props.setProperty('AUDIT_SPREADSHEET_ID',book.getId());props.setProperty('MANUAL_WRITES_ENABLED','false');props.setProperty('WRITE_TEST_ENABLED','false');
  return {id:book.getId(),created:true};
}
