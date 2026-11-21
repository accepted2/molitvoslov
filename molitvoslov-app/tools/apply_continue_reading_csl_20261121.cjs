#!/usr/bin/env node
'use strict';
// Apply translation and typography for "Continue Reading", preserving
// independently edited local catalog, reader and language files.
// Three-way merge; conflicts STOP without touching sources.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {parse}=require('@babel/parser');

const app=path.resolve(__dirname,'..');
const root=path.resolve(app,'..');
const baseRef='971630c776a76ec2feb2a6ff3c9ea54cfed76730';
const targetRef='ea8dbae4f94bc6ccb14cd556a31acef08778ffce';
const dry=process.argv.includes('--dry-run');
const existingFiles=[
  'src/screens/MenuScreen.js',
  'src/screens/ContinueReadingScreen.js',
  'src/i18n/translations.js',
  'src/i18n/traditionalUi.js',
];
const addedFiles=['src/services/continueReadingDisplay.js'];
const paths=[...existingFiles,...addedFiles];
function check(value,why){if(!value)throw Error(why)}
function gitShow(ref,file){
  const result=spawnSync('git',['-C',root,'show',
    ref+':molitvoslov-app/'+file],
    {encoding:'utf8',maxBuffer:12*1024*1024,windowsHide:true});
  check(result.status===0,
    'Git snapshot '+ref+' for '+file+' unavailable. Fetch the branch first. '+(result.stderr||''));
  return result.stdout.replace(/\r\n/g,'\n');
}
function merge(current,baseline,updated,file){
  if(current===updated)return current;
  if(current===baseline)return updated;
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'molitvoslov-progress-'));
  const own=path.join(temp,'ours'),base=path.join(temp,'base'),other=path.join(temp,'theirs');
  try{
    fs.writeFileSync(own,current,'utf8');
    fs.writeFileSync(base,baseline,'utf8');
    fs.writeFileSync(other,updated,'utf8');
    const r=spawnSync('git',['merge-file','-p',
      '-L','local','-L','baseline','-L','updated',own,base,other],
      {encoding:'utf8',windowsHide:true,maxBuffer:15*1024*1024});
    check(r.status===0,
      'Changes overlap in '+file+'. NO FILES CHANGED. Share this STOP message.');
    return r.stdout;
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
}
// Apply only the Continue Reading edits in MenuScreen.js.
// The home screen is edited independently by calendar, quotes and account work;
// a whole-file three-way merge can conflict even though these edits are unrelated.
function replaceOneOrKeep(source, oldText, newText, label) {
  if (source.includes(newText)) return source;
  const count = source.split(oldText).length - 1;
  check(count === 1, 'Cannot safely locate ' + label + ' in MenuScreen.js. NO FILES CHANGED.');
  return source.replace(oldText, newText);
}
function ensureReadingTextStyle(source, marker, extra, label) {
  const lines = source.split('\n');
  const indexes = lines.map((line, index) => line.includes(marker) && line.includes('<Text') ? index : -1).filter(index => index >= 0);
  check(indexes.length === 1, 'Cannot safely locate ' + label + ' JSX. NO FILES CHANGED.');
  const index = indexes[0];
  if (lines[index].includes(extra)) return source;
  // A complete single-line JSX style is required; never rewrite unfamiliar markup.
  const pattern = /style=\{(\[[^\n]*\]|styles\.[\w.]+)\}/;
  const match = lines[index].match(pattern);
  check(match, 'Unrecognized style for ' + label + '. NO FILES CHANGED.');
  const next = match[1].startsWith('[')
    ? match[1].slice(0, -1) + ', ' + extra + ']'
    : '[' + match[1] + ', ' + extra + ']';
  lines[index] = lines[index].replace(pattern, 'style={' + next + '}');
  return lines.join('\n');
}
function patchHome(current) {
  let result = current;
  result = replaceOneOrKeep(
    result,
    "import {getLocalizedField} from '../services/localizedContent';",
    "import {getLocalizedField} from '../services/localizedContent';\nimport {getProgressEntityTitle, getProgressSectionTitle} from '../services/continueReadingDisplay';",
    'localized display import'
  );
  result = replaceOneOrKeep(
    result,
    "const position = ruleItem?.text?.title || ruleItem?.title || t('reading.continueRule');",
    "const position = getProgressSectionTitle(ruleItem, calendarLanguage) || t('reading.continueRule');",
    'prayer rule position'
  );
  result = replaceOneOrKeep(
    result,
    "title: getLocalizedField(rule, 'name', calendarLanguage),",
    "title: getProgressEntityTitle(rule, 'name', calendarLanguage, t),",
    'prayer rule title'
  );
  const styles = [
    ['styles.readingSectionTitle', 'traditionalUiTextStyle(calendarLanguage, 17 * uiScale, 25 * uiScale)', 'reading header'],
    ['styles.openReadingsText', 'traditionalUiTextStyle(calendarLanguage, 13 * uiScale, 20 * uiScale)', 'open label'],
    ['styles.latestReadingTitle', 'traditionalUiTextStyle(calendarLanguage, 16 * uiScale, 24 * uiScale)', 'last reading title'],
    ['styles.latestReadingPosition', 'traditionalUiTextStyle(calendarLanguage, 12 * uiScale, 19 * uiScale)', 'last reading position'],
    ['styles.emptyReadingTitle', 'traditionalUiTextStyle(calendarLanguage, 15 * uiScale, 22 * uiScale)', 'empty reading title'],
    ['styles.emptyReadingText', 'traditionalUiTextStyle(calendarLanguage, 12 * uiScale, 20 * uiScale)', 'empty reading help'],
  ];
  for (const [marker, extra, label] of styles) {
    result = ensureReadingTextStyle(result, marker, extra, label);
  }
  return result;
}
function verify(results){
  const get=file=>results.find(x=>x.name===file)?.after||'';
  const home=get('src/screens/MenuScreen.js');
  const inside=get('src/screens/ContinueReadingScreen.js');
  const tr=get('src/i18n/traditionalUi.js');
  const messages=get('src/i18n/translations.js');
  const helper=get('src/services/continueReadingDisplay.js');
  check(home.includes("getProgressEntityTitle(rule, 'name', calendarLanguage, t)") &&
        home.includes("traditionalUiTextStyle(calendarLanguage, 17 * uiScale"),
    'Home Continue Reading translation or traditional typography incomplete');
  check(inside.includes("title={t('continueReading.title')}") &&
        inside.includes("type: t('reading.prayerRule')") &&
        inside.includes("getCslBibleBookName(book)") &&
        inside.includes("getProgressEntityTitle(rule, 'name', language, t)"),
    'Inside Continue Reading translation incomplete');
  check(inside.includes("t('continueReading.emptyTitle')") &&
        inside.includes("t('continueReading.emptyText')"),
    'Localized empty-state view missing');
  check(messages.includes("emptyTitle: 'Начатых чтений пока нет'") &&
        messages.includes("emptyTitle: 'Розпочатих читань поки немає'") &&
        tr.includes("emptyTitle:'Нача́тыхъ чте́нїй ещѐ нѣ́сть'"),
    'Missing RU, UK or CS translations');
  check(helper.includes("posledovanie-ko-svyatomu-prichashcheniyu") &&
        helper.includes("t('communion.sequence')"),
    'Localized Communion prayer rule title missing');
  check(home.includes("getReadingProgress()") &&
        inside.includes("getReadingProgress()") &&
        inside.includes("navigation.navigate('PrayerRule', {slug: rule.slug})"),
    'Saved progress loading or navigation changed unexpectedly');
}
const jobs=[];
try{
  for(const name of paths){
    const full=path.join(app,name);
    const current=fs.existsSync(full)?fs.readFileSync(full,'utf8'):null;
    const target=gitShow(targetRef,name);
    let normalized;
    if(existingFiles.includes(name)){
      check(current!==null,'Missing project file: '+name);
      normalized=name==='src/screens/MenuScreen.js'
        ?patchHome(current.replace(/\r\n/g,'\n'))
        :merge(current.replace(/\r\n/g,'\n'),gitShow(baseRef,name),target,name);
    }else{
      check(current===null||current.replace(/\r\n/g,'\n')===target,
        'Unexpected existing file: '+name);
      normalized=target;
    }
    parse(normalized,{sourceType:'module',plugins:['jsx']});
    const after=current!==null&&current.includes('\r\n')
      ?normalized.replace(/\n/g,'\r\n'):normalized;
    jobs.push({name,full,before:current,after,changed:current!==after});
  }
  verify(jobs);
}catch(error){
  console.error('STOP:',error.message);
  console.error('NO SOURCE FILES MODIFIED.');
  process.exit(1);
}
console.log('PASS: RU/UK/CS translations, both Continue Reading screens, original progress/navigation.');
console.log('TO UPDATE:',jobs.filter(j=>j.changed).map(j=>j.name).join(', ')||'none');
if(dry){console.log('DRY RUN. NO SOURCE FILES MODIFIED.');process.exit(0)}
const changed=jobs.filter(j=>j.changed);
if(!changed.length){console.log('ALREADY APPLIED.');process.exit(0)}
const backup=path.join(root,'build-backups',
  'continue-reading-csl-'+new Date().toISOString().replace(/[:.]/g,'-'));
try{
  for(const j of changed)if(j.before!==null){
    const dest=path.join(backup,j.name);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,j.before,'utf8');
  }
  for(const j of changed){
    fs.mkdirSync(path.dirname(j.full),{recursive:true});
    fs.writeFileSync(j.full,j.after,'utf8');
  }
  for(const j of jobs){
    const actual=fs.readFileSync(j.full,'utf8').replace(/\r\n/g,'\n');
    parse(actual,{sourceType:'module',plugins:['jsx']});
  }
}catch(error){
  for(const j of changed){
    if(j.before===null){if(fs.existsSync(j.full))fs.unlinkSync(j.full)}
    else fs.writeFileSync(j.full,j.before,'utf8');
  }
  console.error('FAILED. ORIGINALS RESTORED:',error.message);
  console.error('BACKUP:',backup);
  process.exit(1);
}
console.log('SUCCESS: Continue Reading is localized on the home page and inside.');
console.log('BACKUP:',backup);
