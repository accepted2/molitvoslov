#!/usr/bin/env node
'use strict';
// Split alternate troparia/kontakia in all 36 locally packaged months,
// convert legacy UCS glyph encoding to real Church Slavonic Unicode,
// and tag those hymns for Ponomar. Do NOT translate or discard any hymn.
// Source remains local; Django, Bible readings, saints' lives, dates, icons,
// and ordinary already-readable hymns are untouched.
// --check: summary only; --stage: report and 36 candidate files under reports/;
// --apply: backup all original 36 files before installing safe candidates.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {transformFeast}=require('./lib/calendarHymnSplit20261123.cjs');
const root=path.resolve(__dirname,'..'),srcRoot=path.join(root,'src/data/calendar'),reports=path.join(root,'reports');
const stageDir=path.join(reports,'calendar-hymns-ponomar-stage-20261123');
const mode=process.argv.includes('--apply')?'apply':process.argv.includes('--stage')?'stage':'check';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const canonicalKey=card=>String(card.sync_uid||card.card_uid||card.source_uid||card.id||card.source_id||'');
const isBlagovest=card=>/^(?:uoc-)?blv[-_:]/i.test(canonicalKey(card));
const uniqueId=(card)=>canonicalKey(card)+'|'+String(card.source_id??'');
const changes=[],warnings=[],canonical=new Map(),monthRecords=[];
const summary={months:0,dayLocales:0,newCardOccurrences:0,uniqueNewCards:0,
  otherLegacyCardOccurrences:0,dayLocalesWithoutBlagovest:0,missingDayLocales:0,changedFields:0,splitTroparia:0,splitKontakia:0,
  unsafeCases:0,conflictingCanonicalRecords:0,rawHymnBytes:0};
fs.mkdirSync(reports,{recursive:true});
if(mode!=='check')fs.mkdirSync(stageDir,{recursive:true});
function convertCard(card,date,lang) {
  if(!card)return card;
  if(!isBlagovest(card)){
    summary.otherLegacyCardOccurrences++;
    return card;
  }
  summary.newCardOccurrences++;
  const identity=uniqueId(card)+'|'+lang;
  const transformed=transformFeast(card);
  const localChanges=transformed.changes;
  if(localChanges.length){
    summary.changedFields+=localChanges.length;
    if(localChanges.includes('troparion_alternate_content')||
       localChanges.includes('troparion_alternate_content_uk'))summary.splitTroparia++;
    if(localChanges.includes('kontakion_alternate_content')||
       localChanges.includes('kontakion_alternate_content_uk'))summary.splitKontakia++;
    if(changes.length<3000)changes.push({date,lang,id:identity,fields:localChanges,
      title:String(card.title||'').slice(0,90)});
  }
  for(const problem of transformed.warnings){
    summary.unsafeCases++;
    if(warnings.length<4000)warnings.push({date,lang,id:identity,
      title:String(card.title||'').slice(0,120),...problem});
  }
  // The same feast and language may occur on multiple years/days;
  // ensure the normalization result is content-consistent, not year-specific.
  const fingerprint=sha(JSON.stringify({
    troparion_title:transformed.card.troparion_title,
    troparion_content:transformed.card.troparion_content,
    kontakion_title:transformed.card.kontakion_title,
    kontakion_content:transformed.card.kontakion_content,
    troparion_title_uk:transformed.card.troparion_title_uk,
    troparion_content_uk:transformed.card.troparion_content_uk,
    kontakion_title_uk:transformed.card.kontakion_title_uk,
    kontakion_content_uk:transformed.card.kontakion_content_uk,
  }));
  if(canonical.has(identity)&&canonical.get(identity)!==fingerprint){
    summary.conflictingCanonicalRecords++;
    if(warnings.length<4000)warnings.push({date,lang,id:identity,
      issue:'same feast identity appears with differing hymn values; manual reconciliation needed'});
  } else canonical.set(identity,fingerprint);
  return transformed.card;
}
for(let year=2025;year<=2027;year++){
 for(let month=1;month<=12;month++){
  const key=year+'-'+String(month).padStart(2,'0');
  const file=path.join(srcRoot,key+'.json');
  if(!fs.existsSync(file))throw Error('Missing month JSON: '+file);
  const raw=fs.readFileSync(file,'utf8');
  const payload=JSON.parse(raw);
  if(payload.year!==year||payload.month!==month||!payload.days)
    throw Error('Invalid packaged month: '+key);
  const normalized={...payload,days:{...payload.days}};
  for(const [date,locales] of Object.entries(payload.days)){
    normalized.days[date]={...locales};
    for(const lang of ['ru','uk']){
      const day=locales?.[lang];
      if(!day){
        summary.missingDayLocales++;
        if(warnings.length<4000)warnings.push({date,lang,issue:'missing language locale'});
        continue;
      }
      summary.dayLocales++;
      const main=day.main_feast;
      const list=Array.isArray(day.all_feasts)?day.all_feasts:[];
      const original=[main,...list].filter(Boolean);
      const oldCards=original.filter(card=>!isBlagovest(card));
      summary.otherLegacyCardOccurrences+=new Set(oldCards.map(uniqueId)).size;
      const fresh=new Map();
      for(const card of original)if(isBlagovest(card)){
        const key=uniqueId(card);
        if(!fresh.has(key))fresh.set(key,card);
      }
      if(!fresh.size){
        summary.dayLocalesWithoutBlagovest++;
        if(warnings.length<4000)warnings.push({date,lang,
          issue:'no Blagovest replacement card; cannot remove old source for this locale'});
        normalized.days[date][lang]=day;
        continue;
      }
      const replacements=[...fresh.values()].map(card=>convertCard(card,date,lang));
      const byId=new Map(replacements.map(card=>[uniqueId(card),card]));
      const oldMainId=isBlagovest(main)?uniqueId(main):null;
      const finalMain=(oldMainId&&byId.get(oldMainId))||
        replacements.find(card=>card.is_main===true||card.date_type==='main')||
        replacements[0];
      normalized.days[date][lang]={...day,main_feast:finalMain,all_feasts:replacements};
    }
  }
  const text=JSON.stringify(normalized)+'\n';
  summary.rawHymnBytes+=Buffer.byteLength(text);
  const record={month:key,file,before_sha:sha(raw),after_sha:sha(text),changed:raw!==text};
  monthRecords.push(record);
  if(mode!=='check')fs.writeFileSync(path.join(stageDir,key+'.json'),text,'utf8');
  summary.months++;
 }
}
summary.uniqueNewCards=canonical.size;
const report={generated_at:new Date().toISOString(),mode,summary,months:monthRecords,
  warning:'Staged locale removes old cards when Blagovest exists. Full --apply blocks if ANY locale has no Blagovest source or a split conflict.',
  changes,warnings};
const reportPath=path.join(reports,'calendar-hymns-ponomar-report-20261123.json');
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
console.log('CALENDAR HYMNS: '+mode.toUpperCase());
console.log(JSON.stringify(summary,null,2));
console.log('Report: '+reportPath);
if(mode==='check'){console.log('No calendar files modified.');process.exit(0);}
console.log('Staged 36 candidates: '+stageDir);
if(mode==='stage'){console.log('Original calendar files unchanged.');process.exit(0);}
if(summary.unsafeCases||summary.conflictingCanonicalRecords||summary.dayLocalesWithoutBlagovest||summary.missingDayLocales)
 throw Error('Unsafe hymn split, missing Blagovest coverage or conflicting hymns. Refusing apply; inspect report.');
const backupDir=path.join(root,'..','build-backups','calendar-hymns-ponomar-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
for(const item of monthRecords){
 if(sha(fs.readFileSync(item.file,'utf8'))!==item.before_sha)
   throw Error('Month changed while preparing: '+item.month);
 fs.copyFileSync(item.file,path.join(backupDir,item.month+'.json'));
}
fs.copyFileSync(reportPath,path.join(backupDir,'report.json'));
console.log('Backup saved for ALL 36 months: '+backupDir);
const replaced=[];
try{
 for(const item of monthRecords){
  if(!item.changed)continue;
  const temp=item.file+'.hymns-20261123.tmp';
  fs.copyFileSync(path.join(stageDir,item.month+'.json'),temp);
  fs.renameSync(temp,item.file);
  replaced.push(item);
 }
}catch(e){
 for(const item of replaced)fs.copyFileSync(path.join(backupDir,item.month+'.json'),item.file);
 throw e;
}
console.log('APPLIED: '+replaced.length+' months updated; originals backed up.');
console.log('Next step: run tests and inspect SaintDetail on the Android emulator.');
