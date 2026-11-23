#!/usr/bin/env node
'use strict';
/*
 * Stage / install a Blagovest-only, civil-script calendar for the 36 locally
 * packaged months (2025-2027).
 *
 * DEFAULT: --check (read-only against all bundled data).
 * --stage: write prepared files ONLY to reports/, not the app.
 * --apply: requires zero coverage gaps and zero unsafe conversions; first backs
 *          up ALL 36 original month files outside the application.
 *
 * Updates only feast lists, their selected main feast, and hymn title/content
 * fields; does not touch day dates, icons, readings, biographies or Bible links.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {looksLegacyUcs,convertLegacyUcsToCivil}=require('./lib/calendarUcsCivic20261123.cjs');
const root=path.resolve(__dirname,'..'),srcRoot=path.join(root,'src/data/calendar');
const reports=path.join(root,'reports'),stageDir=path.join(reports,'blagovest-civic-stage-20261123');
const args=process.argv.slice(2);
if(args.some(x=>!['--check','--stage','--apply'].includes(x)))throw Error('Usage: node tools/prepare_blagovest_civic_calendar_20261123.cjs [--check|--stage|--apply]');
const apply=args.includes('--apply'),stage=args.includes('--stage')||apply;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const uids=card=>[card?.sync_uid,card?.card_uid,card?.source_uid,card?.id].filter(x=>x!=null).map(String);
const isBlagovest=card=>card&&uids(card).some(x=>/(?:^|[^a-z])(?:uoc-)?blv[-_:]/i.test(x));
const uid=card=>uids(card)[0]||String(card?.source_id||'');
const hymnBases=['troparion_title','troparion_content','kontakion_title','kontakion_content'];
const months=[],prepared=[],risky=[];
const counts={
  months:0,dayLocales:0,newCards:0,discardedOldCardAppearances:0,
  noNewSourceDayLocales:0,deduplicatedNewCards:0,
  hymnFieldsConverted:0,unresolvedHymns:0,mainFeastsReplaced:0,
};
const cache=new Map();
function convertCard(original,date,lang) {
  const card={...original};
  for(const base of hymnBases) {
    for(const field of [base,base+'_uk']){
      if(typeof card[field]!=='string'||!card[field])continue;
      if(!looksLegacyUcs(card[field]))continue;
      const key=uid(card)+'|'+field+'|'+sha(card[field]);
      let converted=cache.get(key);
      if(!converted) {
        converted=convertLegacyUcsToCivil(card[field]);
        cache.set(key,converted);
      }
      if(converted.problems.length) {
        counts.unresolvedHymns++;
        if(risky.length<1000)risky.push({date,lang,uid:uid(card),title:card.title,
          field,problems:converted.problems,
          before:card[field].slice(0,110),candidate:converted.text.slice(0,130)});
        // Original remains in staged output so missing transformations cannot
        // be mistaken for a successful clean release.
        continue;
      }
      card[field]=converted.text;
      counts.hymnFieldsConverted++;
    }
  }
  return card;
}
function transformDay(day,date,lang) {
  counts.dayLocales++;
  const listed=[day.main_feast,...(Array.isArray(day.all_feasts)?day.all_feasts:[])].filter(Boolean);
  const seen=new Map(),sourceOrder=[];
  for(const card of listed){
    if(!isBlagovest(card)){
      counts.discardedOldCardAppearances++;
      continue;
    }
    const key=uid(card);
    if(seen.has(key)){counts.deduplicatedNewCards++;continue;}
    seen.set(key,card);
    sourceOrder.push(card);
  }
  if(!sourceOrder.length){
    counts.noNewSourceDayLocales++;
    if(risky.length<1000)risky.push({date,lang,issue:'no Blagovest card. Do not drop old records until imported'});
    // Produce a stage for inspection but never allow --apply with this gap.
    return {...day,main_feast:null,all_feasts:[]};
  }
  const newCards=sourceOrder.map(x=>convertCard(x,date,lang));
  counts.newCards+=newCards.length;
  // Keep original source main if it is already Blagovest.
  let main=isBlagovest(day.main_feast)?
    newCards.find(x=>uid(x)===uid(day.main_feast)):null;
  if(!main){
    // Otherwise prefer explicitly tagged main Blagovest feast; only then use
    // the first source order. Never revive the old numeric feast.
    main=newCards.find(x=>x.is_main===true||x.date_type==='main')||newCards[0];
    if(day.main_feast)counts.mainFeastsReplaced++;
  }
  return {...day,main_feast:main,all_feasts:newCards};
}
for(let year=2025;year<=2027;year++){
 for(let month=1;month<=12;month++){
  const monthKey=year+'-'+String(month).padStart(2,'0');
  const file=path.join(srcRoot,monthKey+'.json');
  if(!fs.existsSync(file))throw Error('Missing month: '+file);
  const raw=fs.readFileSync(file,'utf8');
  const data=JSON.parse(raw);
  if(data.year!==year||data.month!==month||!data.days)
    throw Error('Invalid bundled calendar format: '+file);
  const clone={...data,days:{...data.days}};
  for(const [date,locales] of Object.entries(data.days)){
    clone.days[date]={...locales};
    for(const lang of ['ru','uk']){
      if(!locales?.[lang]){
        counts.noNewSourceDayLocales++;
        if(risky.length<1000)risky.push({date,lang,issue:'missing localized day'});
        continue;
      }
      clone.days[date][lang]=transformDay(locales[lang],date,lang);
    }
  }
  const after=JSON.stringify(clone,null,2)+'\n';
  months.push({month:monthKey,source:file,bytes_before:Buffer.byteLength(raw),
    bytes_after:Buffer.byteLength(after),sha_before:sha(raw),sha_after:sha(after)});
  prepared.push({key:monthKey,file,content:after});
 }
}
counts.months=months.length;
const manifest={generated_at:new Date().toISOString(),
  warning:'STAGED ONLY until all unresolved flags and coverage gaps are zero',
  counts,months,issues:risky};
fs.mkdirSync(reports,{recursive:true});
const report=path.join(reports,'blagovest-civic-preparation-20261123.json');
fs.writeFileSync(report,JSON.stringify(manifest,null,2)+'\n','utf8');
console.log('BLAGOVEST CIVIC PREPARATION — '+(apply?'APPLY':stage?'STAGE':'CHECK'));
console.log(JSON.stringify(counts,null,2));
console.log('Report: '+report);
const gateIssues=counts.noNewSourceDayLocales+counts.unresolvedHymns;
if(!stage){
  console.log('No bundled data were changed. Run --stage to preview generated output.');
  if(gateIssues)console.log('RELEASE GATE: BLOCKED by '+gateIssues+' incomplete card/encoding issues.');
  process.exit(0);
}
fs.mkdirSync(stageDir,{recursive:true});
for(const item of prepared)fs.writeFileSync(path.join(stageDir,item.key+'.json'),item.content,'utf8');
console.log('Preview months created outside app: '+stageDir);
if(!apply){
  console.log('Original bundled JSON untouched. Inspect report before --apply.');
  if(gateIssues)console.log('RELEASE GATE: BLOCKED by '+gateIssues+' incomplete card/encoding issues.');
  process.exit(0);
}
if(gateIssues)throw Error('Refusing to modify packaged calendar: '+gateIssues+' missing/blurry source data. See report.');
const oldBackupRoot=path.join(root,'..','build-backups');
const backupDir=path.join(oldBackupRoot,'blagovest-civic-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
for(const m of months){
  const raw=fs.readFileSync(m.source);
  if(sha(raw)!==m.sha_before)throw Error('Calendar changed during preparation: '+m.month);
  fs.copyFileSync(m.source,path.join(backupDir,m.month+'.json'));
}
fs.writeFileSync(path.join(backupDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log('Full backup of all 36 original month JSON files: '+backupDir);
const replaced=[];
try {
  for(const item of prepared){
    const tmp=item.file+'.civic-preview-20261123.tmp';
    fs.writeFileSync(tmp,item.content,'utf8');
    fs.renameSync(tmp,item.file);
    replaced.push(item);
  }
}catch(error){
  for(const item of replaced)fs.copyFileSync(path.join(backupDir,item.key+'.json'),item.file);
  throw error;
}
console.log('APPLIED all 36 months. Old numeric feast entries removed from day cards.');
console.log('Only Blagovest cards retained, and recognized UCS hymns converted to civic script.');
console.log('All source days/readings/icons/lives preserved. Validate APK before release.');
