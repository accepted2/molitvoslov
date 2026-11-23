#!/usr/bin/env node
'use strict';
// Safely patch existing LOCAL customized screens, never overwrite from GitHub.
// Both screens remain unchanged unless --apply; backups are created first.
const fs=require('node:fs'),path=require('node:path'),parser=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const files=['src/screens/SaintDetailScreen.js','src/screens/ChurchCalendarScreen.js'];
const apply=process.argv.includes('--apply');
const parse=s=>parser.parse(s,{sourceType:'module',plugins:['jsx']});
const hymnImport="import {isCalendarHymnCsl, getLocalizedHymnField} from '../services/calendarHymnDisplay';";
const changes=[];
function replaceOne(input,search,replacement,label){
 const n=(input.match(search)||[]).length;
 if(n!==1)throw Error(label+': expected 1 match; got '+n);
 return input.replace(search,replacement);
}
function insertImport(source){
 const needle="import {useLanguage} from '../context/LanguageContext';";
 return replaceOne(source,/import \{useLanguage\} from '\.\.\/context\/LanguageContext';/g,
    needle+'\n'+hymnImport,'language import');
}
function getComponents(source,tag,section){
 const program=parse(source).program,out=[];
 function walk(x){
  if(!x||typeof x!=='object')return;
  if(x.type==='JSXElement'&&x.openingElement?.name?.name===tag&&
     x.openingElement.attributes.some(a=>a.type==='JSXAttribute'&&
       a.name?.name==='section'&&a.value?.value===section))out.push(x);
  for(const [k,v] of Object.entries(x)){
   if(k==='loc'||k==='tokens'||k==='comments'||k==='extra')continue;
   if(Array.isArray(v)){for(const item of v)if(item&&typeof item==='object')walk(item);}
   else if(v&&typeof v==='object')walk(v);
  }
 }
 walk(program);
 return out;
}
function insertAll(s,items){
 for(const e of items.sort((a,b)=>b.at-a.at))s=s.slice(0,e.at)+e.text+s.slice(e.at);
 return s;
}
function saint(original){
 let s=insertImport(original);
 s=replaceOne(s,/sourceTitle,\s*\r?\n\}\) => \{/g,
  'sourceTitle,\n  cslFont = false,\n}) => {','saint Accordion props');
 s=replaceOne(s,/fontFamily: styles\.body\.fontFamily,/g,
  "fontFamily: cslFont ? 'Ponomar' : styles.body.fontFamily,",'saint save font');
 s=replaceOne(s,/textStyle=\{styles\.body\}/g,
  "textStyle={[styles.body, cslFont && {fontFamily:'Ponomar',fontSize:19,lineHeight:34,fontWeight:'400'}]}",
  'saint body style');
 s=replaceOne(s,/\{!!subtitle && <Text style=\{styles\.subtitle\}>\{subtitle\}<\/Text>\}/g,
  "{!!subtitle && <Text style={[styles.subtitle,cslFont && {fontFamily:'Ponomar',fontSize:16,lineHeight:27}]}>{subtitle}</Text>}",
  'saint subtitle');
 s=replaceOne(s,/const resolvedFeast = calendarFeast \|\| feast \|\| \{\};/g,
  "const resolvedFeast = calendarFeast || feast || {};\n"+
  "  const additionalTroparion = getLocalizedHymnField(resolvedFeast,'troparion_alternate_content',language);\n"+
  "  const additionalKontakion = getLocalizedHymnField(resolvedFeast,'kontakion_alternate_content',language);",
  'saint canonical feast');
 for(const hymn of ['troparion','kontakion']){
  const original="subtitle={resolvedFeast?."+hymn+"_echo ? 'Глас ' + resolvedFeast."+hymn+"_echo : resolvedFeast?."+hymn+"_title}";
  const prefer="subtitle={getLocalizedHymnField(resolvedFeast,'"+hymn+"_title',language) || (resolvedFeast?."+hymn+"_echo ? 'Глас ' + resolvedFeast."+hymn+"_echo : '')}";
  if(s.includes(original))s=s.replace(original,prefer);
 }
 const edits=[];
 for(const kind of ['troparion','kontakion']){
  const found=getComponents(s,'Accordion',kind);
  if(found.length!==1||!found[0].openingElement.selfClosing)
   throw Error('Cannot identify unique '+kind+' Saint accordion');
  const x=found[0],other=kind==='troparion'?'additionalTroparion':'additionalKontakion';
  edits.push({at:x.openingElement.end-2,text:
   "\n          cslFont={isCalendarHymnCsl("+kind+",getLocalizedHymnField(resolvedFeast,'"+kind+"_script',language))}"});
  const title=kind==='troparion'
    ? "{uk ? 'Інший тропар' : 'Иной тропарь'}"
    : "{uk ? 'Інший кондак' : 'Иной кондак'}";
  const markup=[
   '',
   '        {!!'+other+' && (',
   '          <Accordion',
   '            title='+title,
   '            feast={resolvedFeast}',
   '            date={date}',
   '            sourceTitle={title}',
   '            section="'+kind+'_alternate"',
   "            focusHighlight={focusSection === '"+kind+"_alternate'}",
   '            icon="♪"',
   '            text={'+other+'}',
   "            subtitle={getLocalizedHymnField(resolvedFeast,'"+kind+"_alternate_title',language)}",
   '            cslFont={isCalendarHymnCsl('+other+',',
   "              getLocalizedHymnField(resolvedFeast,'"+kind+"_alternate_script',language))}",
   '          />',
   '        )}',
  ].join('\n');
  edits.push({at:x.end,text:markup});
 }
 s=insertAll(s,edits);parse(s);return s;
}
function calendar(original){
 let s=insertImport(original);
 s=replaceOne(s,
  /const ExpandableTextBlock = \(\{title, subtitle, text, life = false, feast, date, section, sourceTitle\}\) => \{/g,
  'const ExpandableTextBlock = ({title, subtitle, text, life = false, feast, date, section, sourceTitle, cslFont = false}) => {',
  'calendar ExpandableTextBlock');
 s=replaceOne(s,/fontFamily: styles\.textBlockParagraph\.fontFamily,/g,
   "fontFamily: cslFont ? 'Ponomar' : styles.textBlockParagraph.fontFamily,",
   'calendar save font');
 const style='textStyle={styles.textBlockParagraph}';
 const cnt=s.split(style).length-1;
 if(cnt!==2)throw Error('Calendar paragraph style occurrences: '+cnt);
 s=s.split(style).join(
  "textStyle={[styles.textBlockParagraph,cslFont && {fontFamily:'Ponomar',fontSize:19,lineHeight:34,fontWeight:'400'}]}");
 s=replaceOne(s,/<Text style=\{styles\.textBlockSubtitle\}>\{subtitle\}<\/Text>/g,
   "<Text style={[styles.textBlockSubtitle,cslFont && {fontFamily:'Ponomar',fontSize:16,lineHeight:27}]}>{subtitle}</Text>",
   'calendar subtitle font');
 for(const hymn of ['troparion','kontakion']){
  const original=['subtitle={',
    '                mainFeast.'+hymn+'_echo',
    '                  ? '+String.fromCharCode(96)+'${copy.voice} ${mainFeast.'+hymn+'_echo}'+String.fromCharCode(96),
    '                  : mainFeast.'+hymn+'_title',
    '              }'].join('\n');
  const prefer=['subtitle={getLocalizedHymnField(mainFeast,\''+hymn+'_title\',language) || (',
    '                mainFeast.'+hymn+'_echo',
    '                  ? '+String.fromCharCode(96)+'${copy.voice} ${mainFeast.'+hymn+'_echo}'+String.fromCharCode(96),
    "                  : ''",
    '              )}'].join('\n');
  if(s.includes(original))s=s.replace(original,prefer);
 }
 const edits=[];
 for(const kind of ['troparion','kontakion']){
  const found=getComponents(s,'ExpandableTextBlock',kind);
  if(found.length!==1||!found[0].openingElement.selfClosing)
   throw Error('Cannot identify unique '+kind+' calendar block');
  const x=found[0],suffix=s.slice(x.end).match(/^\s*\)\}/);
  if(!suffix)throw Error('Cannot identify calendar block conditional ending: '+kind);
  edits.push({at:x.openingElement.end-2,text:
   "\n              cslFont={isCalendarHymnCsl(mainFeast."+kind+"_content,"+
   "getLocalizedHymnField(mainFeast,'"+kind+"_script',language))}"});
  const other=kind+'_alternate';
  const title=kind==='troparion'
    ? "(language === 'uk' ? 'Інший тропар' : 'Иной тропарь')"
    : "(language === 'uk' ? 'Інший кондак' : 'Иной кондак')";
  const markup=[
   '',
   '          {!!mainFeast?.'+other+'_content && (',
   '            <ExpandableTextBlock',
   '              feast={mainFeast}',
   '              date={dayData?.date_gregorian || selectedDate}',
   '              section="'+other+'"',
   '              sourceTitle={displayTitle(mainFeast,copy)}',
   '              title={'+title+'}',
   "              subtitle={getLocalizedHymnField(mainFeast,'"+other+"_title',language)}",
   "              text={getLocalizedHymnField(mainFeast,'"+other+"_content',language)}",
   "              cslFont={isCalendarHymnCsl(getLocalizedHymnField(mainFeast,'"+other+"_content',language),",
   "                getLocalizedHymnField(mainFeast,'"+other+"_script',language))}",
   '            />',
   '          )}',
  ].join('\n');
  edits.push({at:x.end+suffix[0].length,text:markup});
 }
 s=insertAll(s,edits);parse(s);return s;
}
for(const [index,relative] of files.entries()){
 const absolute=path.join(root,relative);
 const original=fs.readFileSync(absolute,'utf8');
 if(original.includes('additionalTroparion')||original.includes('cslFont = false'))
  throw Error('UI patch already present in '+relative);
 const updated=index===0?saint(original):calendar(original);
 changes.push({absolute,relative,updated,backup:absolute+'.before-alt-hymns-20261123.bak'});
 console.log('PASS '+relative+': syntax valid and existing features preserved');
}
if(!apply){console.log('CHECK ONLY. Re-run with --apply to back up and install.');process.exit(0);}
for(const p of changes)if(fs.existsSync(p.backup))
 throw Error('Backup already exists: '+p.backup);
for(const p of changes)fs.copyFileSync(p.absolute,p.backup);
try{for(const p of changes)fs.writeFileSync(p.absolute,p.updated,'utf8');}
catch(e){for(const p of changes)fs.copyFileSync(p.backup,p.absolute);throw e;}
console.log('INSTALLED: both hymn variants are separate accordions, Ponomar for CSL.');
console.log('All calendar data and user databases remain unchanged.');
