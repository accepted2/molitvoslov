#!/usr/bin/env node
'use strict';
/*
 * Safe offline calendar migration:
 * - Retain only Blagovest cards when a day has Blagovest source records.
 * - Split alternative troparia / kontakia into distinct named fields.
 * - Convert old font-encoded Church Slavonic to standard Church Slavonic
 *   Unicode for Ponomar. DO NOT transliterate to civil script.
 * - Preserve days, icons, lives, Scripture readings and feast IDs.
 *
 * --check (default): report only, no data edits
 * --stage: create preview under reports/; original calendar untouched
 * --apply: only with complete Blagovest coverage, backed up originals
 */
const fs=require('node:fs'), path=require('node:path'),crypto=require('node:crypto');
const {prepareCard,hasOldMixedGlyphs}=require('./lib/calendarHymnVariants20261123.cjs');
const root=path.resolve(__dirname,'..');
const calendarDir=path.join(root,'src/data/calendar');
const reportDir=path.join(root,'reports');
const stageDir=path.join(reportDir,'blagovest-hymn-variants-stage-20261123');
const opts=process.argv.slice(2);
if(opts.some(x=>!['--check','--stage','--apply'].includes(x)))
  throw Error('Usage: node tools/stage_blagovest_hymn_variants_20261123.cjs [--check|--stage|--apply]');
const stage=opts.includes('--stage')||opts.includes('--apply'),apply=opts.includes('--apply');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const SOURCE_PATTERN=/(?:^|[^a-z])(?:uoc-)?blv[-_:]/i;
const id=card=>String(card?.sync_uid||card?.card_uid||card?.source_uid||card?.id||card?.source_id||'');
const isNew=card=>{
  if(!card || typeof card!=='object')return false;
  return [card.sync_uid,card.card_uid,card.source_uid,card.id]
    .some(v=>v!=null&&SOURCE_PATTERN.test(String(v)));
};
const report={
  generated_at:new Date().toISOString(),
  strategy:'Blagovest canonical, separate alternative hymns, UCS8->Unicode Church Slavonic',
  summary:{months:0,days:0,dayLocales:0,cardAppearances:0,
    oldCardAppearancesExcluded:0,missingBlagovestDayLocales:0,
    alternativeHymnsCreated:0,changedHymnFields:0,conversionIssues:0,
    newMainFeastsSelected:0,inferredMainFeasts:0,missingMonthFiles:0},
  coverageGaps:[], unsafe:[],inferredMain:[],months:[],
};
const transformed=[];
const cardCache=new Map();
function processCard(card,date,lang) {
  const key=id(card)+'|'+lang+'|'+digest(JSON.stringify([
    card.troparion_title,card.troparion_content,card.kontakion_title,card.kontakion_content,
    card.troparion_title_uk,card.troparion_content_uk,card.kontakion_title_uk,card.kontakion_content_uk,
  ]));
  if(cardCache.has(key))return cardCache.get(key);
  const {card:modified,changed,issues}=prepareCard(card);
  report.summary.changedHymnFields+=changed;
  for(const field of ['troparion_alt_content','troparion_alt_content_uk','kontakion_alt_content','kontakion_alt_content_uk']){
    if(modified[field]&&!card[field])report.summary.alternativeHymnsCreated++;
  }
  for(const entry of issues){
    report.summary.conversionIssues++;
    report.unsafe.push({date,lang,card:id(card),title:card.title,...entry});
  }
  cardCache.set(key,modified);
  return modified;
}
function processDay(day,date,lang) {
  const listed=[day.main_feast,...(Array.isArray(day.all_feasts)?day.all_feasts:[])].filter(Boolean);
  const chosen=[],seen=new Set();
  for(const feast of listed) {
    if(!isNew(feast)){
      report.summary.oldCardAppearancesExcluded++;
      continue;
    }
    const key=id(feast);
    if(seen.has(key))continue;
    seen.add(key);
    chosen.push(feast);
  }
  report.summary.dayLocales++;
  if(!chosen.length){
    report.summary.missingBlagovestDayLocales++;
    report.coverageGaps.push({date,lang,names:listed.slice(0,5).map(x=>x.title)});
    return day; // never publish an empty day as if it were complete
  }
  report.summary.cardAppearances+=chosen.length;
  const cards=chosen.map(x=>processCard(x,date,lang));
  const mainId=isNew(day.main_feast)?id(day.main_feast):null;
  let main=mainId?cards.find(x=>id(x)===mainId):null;
  if(!main){
    const flagged=cards.filter(x=>x.is_main===true||x.date_type==='main');
    if(flagged.length===1)main=flagged[0];
    else {
      main=cards[0];
      report.summary.inferredMainFeasts++;
      report.inferredMain.push({date,lang,source:day.main_feast?.title||null,
        suggested:main?.title||null,candidates:cards.map(x=>x.title)});
    }
    report.summary.newMainFeastsSelected++;
  }
  return {...day,main_feast:main,all_feasts:cards};
}
for(let year=2025;year<=2027;year++){
  for(let month=1;month<=12;month++){
    const monthName=year+'-'+String(month).padStart(2,'0');
    const filename=path.join(calendarDir,monthName+'.json');
    if(!fs.existsSync(filename)){
      report.summary.missingMonthFiles++;
      report.unsafe.push({month:monthName,issue:'month missing'});
      continue;
    }
    const raw=fs.readFileSync(filename,'utf8');
    const data=JSON.parse(raw);
    if(data.year!==year||data.month!==month||!data.days){
      report.unsafe.push({month:monthName,issue:'calendar structure mismatch'});
      report.summary.conversionIssues++;
      continue;
    }
    const result={...data,days:{}};
    for(const [date,languages] of Object.entries(data.days)){
      report.summary.days++;
      result.days[date]={...languages};
      for(const lang of ['ru','uk']){
        if(!languages?.[lang]){
          report.summary.missingBlagovestDayLocales++;
          report.coverageGaps.push({date,lang,reason:'localized day missing'});
          continue;
        }
        result.days[date][lang]=processDay(languages[lang],date,lang);
      }
    }
    const formatted=JSON.stringify(result,null,2)+'\n';
    transformed.push({monthName,filename,raw,formatted});
    report.months.push({name:monthName,shaBefore:digest(raw),
      shaAfter:digest(formatted),bytesBefore:Buffer.byteLength(raw),
      bytesAfter:Buffer.byteLength(formatted)});
  }
}
report.summary.months=transformed.length;
fs.mkdirSync(reportDir,{recursive:true});
const reportPath=path.join(reportDir,'blagovest-hymn-variants-audit-20261123.json');
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
console.log('BLAGOVEST HYMN VARIANTS: '+(apply?'APPLY':stage?'STAGE':'CHECK'));
console.log(JSON.stringify(report.summary,null,2));
console.log('Report: '+reportPath);
const gate=report.summary.missingMonthFiles+report.summary.missingBlagovestDayLocales+
  report.summary.conversionIssues+report.summary.inferredMainFeasts;
if(!stage){
  console.log('No calendar JSON changed.');
  if(gate)console.log('PUBLISH GATE: BLOCKED ('+gate+' gaps/ambiguous cases)');
  process.exit(0);
}
fs.mkdirSync(stageDir,{recursive:true});
for(const x of transformed)fs.writeFileSync(path.join(stageDir,x.monthName+'.json'),x.formatted,'utf8');
console.log('Staged JSON: '+stageDir);
if(!apply){console.log('Original files unchanged. Review coverage and differences first.');process.exit(0)}
if(gate)throw Error('Refusing to apply calendar migration until '+gate+' gaps/ambiguities are resolved.');
const backupDir=path.join(root,'..','build-backups','calendar-hymns-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
for(const x of transformed){
  if(digest(fs.readFileSync(x.filename,'utf8'))!==digest(x.raw))
    throw Error('Source calendar changed during staging: '+x.filename);
  fs.copyFileSync(x.filename,path.join(backupDir,x.monthName+'.json'));
}
fs.writeFileSync(path.join(backupDir,'manifest.json'),JSON.stringify(report,null,2));
const changed=[];
try {
  for(const x of transformed){
    const temp=x.filename+'.new-hymns-20261123.tmp';
    fs.writeFileSync(temp,x.formatted,'utf8');
    fs.renameSync(temp,x.filename);
    changed.push(x);
  }
}catch(e) {
  for(const x of changed)fs.copyFileSync(path.join(backupDir,x.monthName+'.json'),x.filename);
  throw e;
}
console.log('COMPLETE: all months installed with Blagovest hymns; BACKUP: '+backupDir);
