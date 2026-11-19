/** Manual tracker writer. Uses the existing private ALLOW_<email> registry. */
var WRITER_SERVICE_ = 'ops-toolshed-reccies-writer';
var TRACKER_ID_ = '1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU';
var MAX_ROWS_ = 100;
var RECORD_METADATA_KEY_ = 'or';
function recordIdentity_(item,month){return item.dNumber+'/'+item.campaignId+'/'+month;}
function recordMetadata_(sheet){
  var registry=auditBook_().getSheetByName('Records'),bindings={};
  if(registry)registry.getDataRange().getValues().slice(1).forEach(function(row){
    if(String(row[1])!==String(sheet.getSheetId()))return;
    if(bindings[row[0]]!==undefined)throw Error('DUPLICATE_RECORD_REGISTRY');bindings[row[0]]=String(row[2]);
  });
  var result=Sheets.Spreadsheets.DeveloperMetadata.search({dataFilters:[{developerMetadataLookup:{metadataKey:RECORD_METADATA_KEY_}}]},TRACKER_ID_);
  return (result.matchedDeveloperMetadata||[]).map(function(entry){return entry.developerMetadata;}).filter(function(tag){
    var range=tag.location&&tag.location.dimensionRange;
    return range&&range.sheetId===sheet.getSheetId()&&range.dimension==='ROWS'&&range.endIndex===range.startIndex+1;
  }).map(function(tag){return {id:tag.metadataId,row:tag.location.dimensionRange.startIndex+1,value:bindings[tag.metadataId]};});
}
function writeTagged_(snapshot,changes){
  var data=changes.map(function(change){
    var record=change.record,id=record.metadataId;
    if(!Number.isInteger(id)||id<0)throw Error('RECORD_IDENTIFIER_REQUIRED');
    var tag=snapshot.metadata.filter(function(item){return item.id===id;});
    if(tag.length!==1||tag[0].value!==recordIdentity_(record,record.month))throw Error('RECORD_IDENTIFIER_CHANGED');
    var width=Math.max(snapshot.columns.rec+1,change.commentColumn||0),values=Array(width).fill(null);
    values[snapshot.columns.rec]=change.status;
    if(change.commentColumn)values[change.commentColumn-1]=change.comments;
    return {dataFilter:{developerMetadataLookup:{metadataId:id}},majorDimension:'ROWS',values:[values]};
  });
  var response=Sheets.Spreadsheets.Values.batchUpdateByDataFilter({valueInputOption:'RAW',includeValuesInResponse:true,data:data},TRACKER_ID_);
  if(response.totalUpdatedRows!==changes.length||!response.responses||response.responses.length!==changes.length)throw Error('WRITE_NOT_CONFIRMED');
  SpreadsheetApp.flush();
}

/** Editor-only migration. Run during a coordinated pause in tracker edits.
 * Leaves new writes disabled until the owner verifies the logged results. */
function setupSortSafeTracker(){
  actor_();
  var props=PropertiesService.getScriptProperties();props.setProperty('MANUAL_WRITES_ENABLED','false');
  var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('BUSY_TRY_AGAIN');
  try{
    var audit=auditBook_(),registry=audit.getSheetByName('Records');
    if(!registry){registry=audit.insertSheet('Records');registry.getRange(1,1,1,3).setValues([['Metadata ID','Sheet ID','Record identity']]);}
    var summary=[];
    ['main','early'].forEach(function(mode){
      var snapshot=snapshot_(mode),requests=[],expected=[],counts={},skipped=0;
      var identities=snapshot.display.map(function(row,index){
        if(!index)return null;
        var d=String(row[snapshot.columns.d]).trim().toUpperCase(),c=String(row[snapshot.columns.c]).trim().toUpperCase();
        var month=snapshot.rowMonths[index]||snapshot.uniform;
        if(!/^D\d{5,15}$/.test(d)||!/^CP[A-Z0-9]{3,20}$/.test(c)||!month)return null;
        var key=recordIdentity_({dNumber:d,campaignId:c},month);counts[key]=(counts[key]||0)+1;return key;
      });
      for(var i=1;i<snapshot.display.length;i++){
        var d=String(snapshot.display[i][snapshot.columns.d]).trim().toUpperCase(),c=String(snapshot.display[i][snapshot.columns.c]).trim().toUpperCase();
        var month=snapshot.rowMonths[i]||snapshot.uniform;
        if(!/^D\d{5,15}$/.test(d)||!/^CP[A-Z0-9]{3,20}$/.test(c)||!month)continue;
        var identity=recordIdentity_({dNumber:d,campaignId:c},month),tags=snapshot.metadata.filter(function(tag){return tag.row===i+1;});
        if(counts[identities[i]]!==1){skipped++;continue;}
        if(tags.length>1||(tags.length===1&&tags[0].value!==identity))throw Error('RECORD_IDENTIFIER_CHANGED');
        expected.push({dNumber:d,campaignId:c,month:month});
        if(!tags.length)requests.push({identity:identity,request:{createDeveloperMetadata:{developerMetadata:{metadataKey:RECORD_METADATA_KEY_,visibility:'DOCUMENT',location:{dimensionRange:{sheetId:snapshot.sheet.getSheetId(),dimension:'ROWS',startIndex:i,endIndex:i+1}}}}}});
      }
      for(var offset=0;offset<requests.length;offset+=200){
        var batch=requests.slice(offset,offset+200),response=Sheets.Spreadsheets.batchUpdate({requests:batch.map(function(item){return item.request;})},TRACKER_ID_);
        var rows=response.replies.map(function(reply,index){return [reply.createDeveloperMetadata.developerMetadata.metadataId,snapshot.sheet.getSheetId(),batch[index].identity];});
        registry.getRange(registry.getLastRow()+1,1,rows.length,3).setValues(rows);SpreadsheetApp.flush();
      }
      var verified=snapshot_(mode);
      if(expected.some(function(item){return match_(verified,item,item.month).metadataId===undefined;}))throw Error('RECORD_SETUP_NOT_CONFIRMED');
      var headers=verified.display[0].map(function(v){return String(v).trim().toLowerCase();}),comment=headers.indexOf('comments');
      if(comment>=0&&headers.lastIndexOf('comments')!==comment)throw Error('COMMENTS_HEADER_CHANGED');
      if(comment>=0){
      var letter='',column=comment+1;while(column){column--;letter=String.fromCharCode(65+column%26)+letter;column=Math.floor(column/26);}
      var formula='=LEN(TRIM($'+letter+'2))>0',rules=verified.sheet.getConditionalFormatRules();
      rules=rules.filter(function(rule){var condition=rule.getBooleanCondition();return !condition||condition.getCriteriaValues()[0]!==formula;});
      rules.unshift(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula).setBackground('#fff2cc').setRanges([verified.sheet.getRange(2,1,verified.sheet.getMaxRows()-1,headers.length)]).build());
      verified.sheet.setConditionalFormatRules(rules);
      }
      summary.push({mode:mode,identified:expected.length,created:requests.length,ambiguousSkipped:skipped,comments:comment>=0});
    });
    console.log(JSON.stringify({writesEnabled:false,summary:summary}));return summary;
  }finally{lock.releaseLock();}
}
/** Editor-only activation repeats migration verification before accepting saves. */
function enableSortSafeTracker(){setupSortSafeTracker();PropertiesService.getScriptProperties().setProperty('MANUAL_WRITES_ENABLED','true');console.log('Sort-safe writes enabled');}
function doGet(e) {
  try { var actor = actor_(); if(e&&e.parameter&&e.parameter.connect)return reply_(writerConnection_(e.parameter.mode)); return reply_({ok:true,email:actor,manualEnabled:enabled_()}); }
  catch (error) { return fail_(error); }
}
function doPost(e) {
  var lock, acquired = false;
  try {
    var actor = actor_(), input;
    try { input = JSON.parse(e && e.postData && e.postData.contents || '{}'); } catch (_) { throw Error('INVALID_REQUEST'); }
    if (!input || !['preview','previewEdit','commit','status','connection','activatePerUser'].includes(input.operation)) throw Error('INVALID_REQUEST');
    if(input.operation!=='connection'&&input.expectedEmail&&String(input.expectedEmail).trim().toLowerCase()!==actor)throw Error('ACCOUNT_CHANGED');
    if(input.operation==='connection')return reply_(writerConnection_(input.mode));
    if(input.operation==='activatePerUser'){
      lock=LockService.getScriptLock();acquired=lock.tryLock(10000);if(!acquired)throw Error('BUSY_TRY_AGAIN');
      var connection=writerConnection_(input.mode);
      if(!connection.perUser||!connection.ready)throw Error('PER_USER_ACCESS_REQUIRED');
      PropertiesService.getScriptProperties().setProperty('REQUIRE_PER_USER_'+actor,'true');
      connection.enforced=true;return reply_(connection);
    }
    if(input.requirePerUser===true){
      if(String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase()!==actor)throw Error('PER_USER_REQUIRED');
      if(PropertiesService.getScriptProperties().getProperty('REQUIRE_PER_USER_'+actor)!=='true')throw Error('PER_USER_SETUP_REQUIRED');
      if(!writerConnection_(input.mode).ready)throw Error('PER_USER_ACCESS_REQUIRED');
    }
    if (input.operation === 'status') return reply_(receipt_(input.requestId,actor));
    if (!enabled_()) throw Error('MANUAL_WRITES_DISABLED');
    // Previews only read live rows and create a private cache token. Commits revalidate under the writer lock.
    if (input.operation === 'previewEdit') return reply_(previewEdit_(input,actor));
    if (input.operation === 'preview') return reply_(preview_(input,actor));
    lock = LockService.getScriptLock(); acquired = lock.tryLock(10000);
    if (!acquired) throw Error('BUSY_TRY_AGAIN');
    actor_(); if (!enabled_()) throw Error('MANUAL_WRITES_DISABLED');
    return reply_(commit_(input,actor));
  } catch (error) { return fail_(error); }
  finally { if (acquired) lock.releaseLock(); }
}
function actor_() {
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw Error('IDENTITY_UNAVAILABLE');
  if (PropertiesService.getScriptProperties().getProperty('ALLOW_' + email) !== 'true') throw Error('ACCESS_DENIED');
  if(PropertiesService.getScriptProperties().getProperty('REQUIRE_PER_USER_'+email)==='true'&&String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase()!==email)throw Error('PER_USER_REQUIRED');
  return email;
}
/** Read-only readiness check under the actual executing Google account. */
function writerConnection_(mode){
  var actor=actor_(),effective=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase(),problems=[];
  var access={trackerRead:false,trackerEdit:false,auditRead:false,auditEdit:false},auditId=PropertiesService.getScriptProperties().getProperty('AUDIT_SPREADSHEET_ID');
  try{
    var report=SpreadsheetApp.openById(TRACKER_ID_).getSheetByName(mode==='early'?'Early Reccie report':'Reccie report');
    var headers=report.getRange(1,1,1,report.getLastColumn()).getDisplayValues()[0].map(function(value){return String(value).trim().toLowerCase();});
    var status=headers.indexOf('reccied'),comments=headers.indexOf('comments');
    access.trackerRead=status>=0;
    access.trackerEdit=status>=0&&comments>=0&&report.getRange(2,status+1,Math.max(1,report.getLastRow()-1),1).canEdit()&&report.getRange(2,comments+1,Math.max(1,report.getLastRow()-1),1).canEdit();
  }catch(_){problems.push('Ask for access to the Reccie Tracker using this Google account.');}
  if(access.trackerRead&&!access.trackerEdit)problems.push('You need edit access to the tracker status and comments columns.');
  try{
    var audit=auditBook_(),requests=audit.getSheetByName('Requests'),changes=audit.getSheetByName('Changes'),records=audit.getSheetByName('Records');
    if(!records)throw Error('AUDIT_NOT_CONFIGURED');
    records.getRange(1,1,1,3).getValues();access.auditRead=true;
    access.auditEdit=requests.getRange(2,1,Math.max(1,requests.getMaxRows()-1),7).canEdit()&&changes.getRange(2,1,Math.max(1,changes.getMaxRows()-1),11).canEdit();
  }catch(_){problems.push('Ask Harry for Editor access to the separate save-record spreadsheet.');}
  if(access.auditRead&&!access.auditEdit)problems.push('You need Editor access to the separate save-record spreadsheet.');
  if(!enabled_())problems.push('Tracker updates are currently paused by Harry.');
  if(actor!==effective)problems.unshift('Open the per-user authorisation link. This request is still running under the owner account.');
  return {ok:true,email:actor,effectiveEmail:effective,perUser:actor===effective,ready:enabled_()&&actor===effective&&access.trackerRead&&access.trackerEdit&&access.auditRead&&access.auditEdit,access:access,problems:problems,auditUrl:auditId?'https://docs.google.com/spreadsheets/d/'+auditId+'/edit':'',enforced:PropertiesService.getScriptProperties().getProperty('REQUIRE_PER_USER_'+actor)==='true'};
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
  var months={},invalid=false,rowMonths=[],dateMonths={},timezone=sheet.getParent().getSpreadsheetTimeZone();
  for(var i=1;i<display.length;i++){
    var date=values[i][columns.date], month=date instanceof Date ? (dateMonths[date.getTime()]||(dateMonths[date.getTime()]=Utilities.formatDate(date,timezone,'yyyy-MM'))) : month_(display[i][columns.date]);
    rowMonths[i]=month;
    if(month===null)invalid=true; if(month)months[month]=true;
  }
  var uniform=Object.keys(months).length===1&&!invalid?Object.keys(months)[0]:null;
  return {sheet:sheet,display:display,values:values,formulas:formulas,columns:columns,uniform:uniform,rowMonths:rowMonths,metadata:recordMetadata_(sheet)};
}
function match_(snapshot,item,month) {
  var s=snapshot,c=s.columns,matches=[];
  for(var i=1;i<s.display.length;i++){
    if(String(s.display[i][c.d]).trim().toUpperCase()!==item.dNumber || String(s.display[i][c.c]).trim().toUpperCase()!==item.campaignId)continue;
    var actual=s.rowMonths[i];
    if((actual || (actual===''?s.uniform:null))===month)matches.push(i);
  }
  var result={dNumber:item.dNumber,campaignId:item.campaignId,month:month};
  if(matches.length!==1)return Object.assign(result,{state:'skipped',reason:matches.length?'Duplicate tracker match':'No unique match for this report month'});
  var index=matches[0],before=s.values[index][c.rec];
  result.before=before;result.row=index+1;
  var tags=s.metadata.filter(function(tag){return tag.row===result.row;});
  if(tags.length!==1||tags[0].value!==recordIdentity_(result,month)||
     (item.metadataId!==undefined&&item.metadataId!==tags[0].id))return Object.assign(result,{state:'skipped',confirmed:false,reason:'Record identifier missing or changed. Refresh the tracker; owner setup may be required.'});
  result.metadataId=tags[0].id;
  if(s.formulas[index][c.rec])return Object.assign(result,{state:'skipped',reason:'Tracker value is a formula'});
  if(typeof before!=='string')return Object.assign(result,{state:'skipped',reason:'Unexpected tracker value'});
  if(before.trim().toLowerCase()==='yes')return Object.assign(result,{state:'already_yes',after:'Yes',confirmed:true});
  if(!['','no'].includes(before.trim().toLowerCase()))return Object.assign(result,{state:'skipped',reason:'Unexpected tracker value'});
  return Object.assign(result,{state:'eligible'});
}
function preview_(input,actor) {
  var rows=validate_(input),snapshot=snapshot_(input.mode),id=Utilities.getUuid(),token=Utilities.getUuid();
  var clearing=input.clearComments===true,headers=snapshot.display[0].map(function(value){return String(value).trim().toLowerCase();}),commentColumn=headers.indexOf('comments');
  var results=rows.map(function(row){
    if(clearing)return editMatch_(snapshot,{dNumber:row.dNumber,campaignId:row.campaignId,after:'Yes',commentsAfter:''},input.month);
    var result=match_(snapshot,row,input.month);
    if(result.row&&commentColumn>=0){var comment=String(snapshot.values[result.row-1][commentColumn]||'');result.hasComment=!!comment.trim();result.commentPreview=comment.slice(0,200);}
    return result;
  });
  var record={writerVersion:2,actor:actor,mode:input.mode,month:input.month,results:results,token:token,cause:input.cause==='verified'?'Client verified Prisma statuses':'Manual confirmation'};
  if(clearing)record.kind='edit';
  var serialized=JSON.stringify(record);if(serialized.length>30000)throw Error('NOTES_TOO_LARGE_NARROW_SELECTION');
  CacheService.getScriptCache().put('manual:'+id,serialized,600);
  return {ok:true,requestId:id,token:token,expiresInSeconds:600,mode:input.mode,month:input.month,clearComments:clearing,kind:clearing?'edit':'status',results:results};
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
          if(prior.kind==='edit')return confirmEdit_(current,prior,row.values[3]);
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
  if(record.writerVersion!==2)throw Error('PREVIEW_EXPIRED_OR_WRONG_USER');
  if(record.kind==='edit')return commitEdit_(input,actor,record,book);
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
  journal_(changes,eligible.map(function(index){var r=results[index];return [stamp,input.requestId,actor,record.mode,record.month,r.dNumber,r.campaignId,r.before,'Yes','intent',record.cause||'Manual confirmation'];}));
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
    if(eligible.length)writeTagged_(snapshot,eligible.map(function(index){return {record:results[index],status:'Yes'};}));
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

/** Notes and manual Yes/No updates share identity, preview and durable receipt guards. */
function editMatch_(snapshot,item,month) {
  var result=match_(snapshot,item,month),headers=snapshot.display[0].map(function(v){return String(v).trim().toLowerCase();});
  var col=headers.indexOf('comments');
  if(col<0||headers.lastIndexOf('comments')!==col)throw Error('COMMENTS_HEADER_CHANGED');
  if(!result.row||result.state==='skipped')return Object.assign(result,{kind:'edit',after:item.after,commentsAfter:item.commentsAfter});
  if(snapshot.formulas[result.row-1][col])return Object.assign(result,{state:'skipped',reason:'Comment is a formula',kind:'edit',after:item.after,commentsAfter:item.commentsAfter});
  return Object.assign(result,{state:'eligible',kind:'edit',after:item.after,commentsAfter:item.commentsAfter,commentsBefore:String(snapshot.values[result.row-1][col]||''),commentColumn:col+1});
}
function previewEdit_(input,actor) {
  var identities=validate_(input),snapshot=snapshot_(input.mode),id=Utilities.getUuid(),token=Utilities.getUuid();
  var results=identities.map(function(identity,index){
    var item=input.rows[index];
    if(!['Yes','No'].includes(item.after)||typeof item.commentsAfter!=='string'||item.commentsAfter.length>2000||/^\s*=/.test(item.commentsAfter)||typeof item.commentsBefore!=='string'||typeof item.before!=='string')throw Error('INVALID_EDIT');
    var result=editMatch_(snapshot,item,input.month);
    if(result.state==='eligible'&&(result.before!==item.before||result.commentsBefore!==item.commentsBefore))result=Object.assign(result,{state:'skipped',reason:'Tracker changed. Read the report again before editing.'});
    return result;
  });
  var record=JSON.stringify({writerVersion:2,actor:actor,mode:input.mode,month:input.month,results:results,token:token,kind:'edit'});
  if(record.length>30000)throw Error('NOTES_TOO_LARGE_NARROW_SELECTION');
  CacheService.getScriptCache().put('manual:'+id,record,600);
  return {ok:true,kind:'edit',requestId:id,token:token,expiresInSeconds:600,mode:input.mode,month:input.month,results:results};
}
function confirmEdit_(snapshot,prior,month) {
  if(prior.state==='skipped')return prior;
  var fresh=editMatch_(snapshot,prior,month),confirmed=fresh.state==='eligible'&&fresh.before===prior.after&&fresh.commentsBefore===prior.commentsAfter;
  return Object.assign({},prior,{state:confirmed?'updated':'failed',confirmed:confirmed,reason:confirmed?'':'Could not confirm saved fields. Read the tracker before retrying.'});
}
function commitEdit_(input,actor,record,book) {
  var requests=book.getSheetByName('Requests'),changes=book.getSheetByName('Changes'),row=requests.getLastRow()+1,stamp=new Date().toISOString();
  CacheService.getScriptCache().remove('manual:'+input.requestId);
  requests.getRange(row,1,1,7).setValues([[input.requestId,actor,record.mode,record.month,stamp,'pending',JSON.stringify(record.results)]]);SpreadsheetApp.flush();
  journal_(changes,record.results.map(function(r){return [stamp,input.requestId,actor,record.mode,record.month,r.dNumber,r.campaignId,JSON.stringify({reccied:r.before,comments:r.commentsBefore}),JSON.stringify({reccied:r.after,comments:r.commentsAfter}),r.state==='eligible'?'intent':'skipped',record.cause||'Manual note/status; yellow for non-empty note'];}));
  // Validate and write the selection together so automatic comment removal does not reread the entire report for each row.
  var snapshot=snapshot_(record.mode),eligible=[];
  var results=record.results.map(function(prior,index){
    if(prior.state!=='eligible')return prior;
    var fresh=editMatch_(snapshot,prior,record.month);
    if(fresh.state!=='eligible'||fresh.before!==prior.before||fresh.commentsBefore!==prior.commentsBefore)return Object.assign({},prior,{state:'skipped',confirmed:false,reason:'Tracker changed since preview'});
    var rule=snapshot.sheet.getRange(fresh.row,snapshot.columns.rec+1).getDataValidation();
    if(rule&&(rule.getCriteriaType()!==SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST||!rule.getCriteriaValues()[0].includes(prior.after)))return Object.assign({},prior,{state:'skipped',confirmed:false,reason:'Tracker validation needs review'});
    eligible.push(index);return fresh;
  });
  try {
    if(eligible.length)writeTagged_(snapshot,eligible.map(function(index){var r=results[index];return {record:r,status:r.after,comments:r.commentsAfter,commentColumn:r.commentColumn};}));
  }catch(_){ /* Readback establishes each outcome even after a partial batch failure. */ }
  var readback;
  try{readback=snapshot_(record.mode);}catch(_){readback=null;}
  eligible.forEach(function(index){results[index]=readback?confirmEdit_(readback,results[index],record.month):Object.assign({},results[index],{state:'failed',confirmed:false,reason:'Save could not be confirmed. Read the tracker before retrying.'});});
  journal_(changes,results.map(function(r){return [new Date().toISOString(),input.requestId,actor,record.mode,record.month,r.dNumber,r.campaignId,JSON.stringify({reccied:r.before,comments:r.commentsBefore}),JSON.stringify({reccied:r.after,comments:r.commentsAfter}),r.state,r.reason||''];}));
  requests.getRange(row,6,1,2).setValues([['complete',JSON.stringify(results)]]);SpreadsheetApp.flush();
  return {ok:true,requestId:input.requestId,mode:record.mode,month:record.month,state:'complete',results:results};
}
