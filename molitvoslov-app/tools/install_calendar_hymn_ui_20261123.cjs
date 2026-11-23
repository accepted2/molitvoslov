#!/usr/bin/env node
'use strict';
/*
 * Reversible, structure-aware patch for the USER'S LOCAL SaintDetailScreen.
 * Older installer assumed exact whitespace in Accordion's props and failed.
 * This version uses Babel AST positions, preserving all unrelated UI changes.
 * --check: parse and prepare only; --apply: backup and apply atomically.
 * No calendar JSON, backend, icons, search database or APK is modified.
 */
const fs=require('node:fs');
const path=require('node:path');
const parser=require('@babel/parser');
const target=path.resolve(__dirname,'../src/screens/SaintDetailScreen.js');
const backup=target+'.before-hymn-variants-20261123.bak';
const apply=process.argv.includes('--apply');
const original=fs.readFileSync(target,'utf8');
const marker='BLAGOVEST_HYMN_VARIANTS_20261123';
const moduleImport="import {isChurchSlavonicHymn} from '../services/calendarHymnDisplay';";
function parse(s){return parser.parse(s,{sourceType:'module',plugins:['jsx']});}
function fail(message){throw Error(message+'; local SaintDetailScreen left unchanged');}
const ast=parse(original);
if(original.includes(marker)||original.includes('const troparionAlt = hymnLocalized(')) {
  fail('Hymn UI patch already installed or partially installed');
}
const edits=[];
function put(start,end,text,reason){
  if(start<0||end<start||end>original.length)fail('Invalid replacement at '+reason);
  for(const item of edits)if(start<item.end&&item.start<end)fail('Overlapping patches: '+reason+'/'+item.reason);
  edits.push({start,end,text,reason});
}
function walk(node,visit){
 if(!node||typeof node!=='object')return;
 if(!node.type)return;
 visit(node);
 for(const [key,value] of Object.entries(node)){
   if(['loc','comments','tokens','leadingComments','innerComments','trailingComments','extra'].includes(key))continue;
   if(Array.isArray(value)){
     for(const item of value)if(item&&typeof item==='object'&&item.type)walk(item,visit);
   }else if(value&&typeof value==='object'&&value.type)walk(value,visit);
 }
}
const declarations=[];
walk(ast.program,(node)=>{if(node.type==='VariableDeclarator')declarations.push(node);});
const accordion=declarations.find(node=>node.id?.type==='Identifier'&&node.id.name==='Accordion'
  &&node.init?.type==='ArrowFunctionExpression');
if(!accordion)fail('Could not locate Accordion arrow component (inspect its declaration)');
const accordionFn=accordion.init;
const props=accordionFn.params[0];
if(props?.type!=='ObjectPattern')fail('Accordion parameter is not an object pattern');
const importDecl=ast.program.body.find(node=>node.type==='ImportDeclaration'
  &&node.source.value==='../context/LanguageContext');
if(!importDecl)fail('LanguageContext import not found');
if(original.includes(moduleImport))fail('Hymn display import already present');
put(importDecl.end,importDecl.end,'\n'+moduleImport,'import');
const paramSource=original.slice(props.start,props.end);
const last=props.properties.at(-1);
if(!last)fail('Accordion has no component properties');
const tail=original.slice(last.end,props.end-1);
const scriptParam=tail.includes(',')
  ? "\n  script = 'civil',"
  : ",\n  script = 'civil',";
put(props.end-1,props.end-1,scriptParam,'Accordion script prop');

// Patch only the body of the Accordion component. Avoid global replacements.
let bodyStyled=0;
let subtitleStyled=0;
let saveFontStyled=0;
walk(accordionFn.body,(node)=>{
  if(node.type==='JSXAttribute'&&['style','textStyle'].includes(node.name?.name)
    &&node.value?.type==='JSXExpressionContainer'){
    const exp=node.value.expression;
    if(exp?.type==='MemberExpression'&&exp.object?.name==='styles'&&exp.property?.name==='body'){
      put(node.value.start,node.value.end,
        "{[styles.body, script === 'csl' && styles.ponomarBody]}",
        'Ponomar body');
      bodyStyled++;
    }
    if(exp?.type==='MemberExpression'&&exp.object?.name==='styles'&&exp.property?.name==='subtitle'){
      put(node.value.start,node.value.end,
        "{[styles.subtitle, script === 'csl' && styles.ponomarSubtitle]}",
        'Ponomar subtitle');
      subtitleStyled++;
    }
  }
  if(node.type==='ObjectProperty'&&
    (node.key?.name==='fontFamily'||node.key?.value==='fontFamily')){
    const current=original.slice(node.value.start,node.value.end);
    if(current.includes('styles.body.fontFamily')){
      put(node.value.start,node.value.end,
        "script === 'csl' ? 'Ponomar' : styles.body.fontFamily",
        'Saved selection font');
      saveFontStyled++;
    }
  }
});
if(bodyStyled===0)fail('Could not locate text body in Accordion for Ponomar');
if(subtitleStyled===0)fail('Could not locate subtitle in Accordion for Ponomar');
if(saveFontStyled>1)fail('Multiple save font assignments in Accordion');
if(original.includes('ponomarBody:')||original.includes('ponomarSubtitle:')){
  fail('Ponomar styles already exist; manual check needed');
}
const bodyStyle=/\bbody:\s*\{/g;
const bodyMatches=[...original.matchAll(bodyStyle)];
if(bodyMatches.length!==1)fail('Cannot identify a unique StyleSheet body definition');
put(bodyMatches[0].index,bodyMatches[0].index,
  "ponomarBody: {fontFamily:'Ponomar',fontSize:19,lineHeight:33,fontWeight:'400'},\n  "+
  "ponomarSubtitle: {fontFamily:'Ponomar',fontSize:16,lineHeight:27,fontWeight:'400'},\n  ",
  'Ponomar styles');

// Resolve the local saint record variable and insert localized hymn helpers
// after the existing "kontakion" declaration, regardless of spacing or
// whether the source is "resolvedFeast", "calendarFeast" or "feast".
const screen=declarations.find(node=>node.id?.type==='Identifier'&&node.id.name==='SaintDetailScreen'
  &&node.init?.type==='ArrowFunctionExpression');
if(!screen)fail('SaintDetailScreen is not a component variable');
const locals=screen.init.body.body.filter(node=>node.type==='VariableDeclaration');
const localNames=new Set();
for(const statement of locals)
  for(const decl of statement.declarations)
    if(decl.id?.type==='Identifier')localNames.add(decl.id.name);
const feastName=['resolvedFeast','calendarFeast','feast'].find(name=>localNames.has(name));
if(!feastName)fail('No current feast object variable detected');
const hymnVars=['troparion','kontakion'];
for(const name of hymnVars)if(!localNames.has(name))fail('Missing hymn variable: '+name);
const hymnDecl=locals.find(node=>node.declarations.some(d=>d.id?.name==='kontakion'));
if(!hymnDecl)fail('Cannot identify the kontakion data declaration');
const helpers=[
 '',
 '  // '+marker,
 "  const hymnLocalized = (key) =>",
 "    (language === 'uk' && "+feastName+"?.[key + '_uk']) || "+feastName+"?.[key] || '';",
 "  const troparionAlt = hymnLocalized('troparion_alt_content');",
 "  const kontakionAlt = hymnLocalized('kontakion_alt_content');",
 "  const troparionAltTitle = hymnLocalized('troparion_alt_title');",
 "  const kontakionAltTitle = hymnLocalized('kontakion_alt_title');",
 "  const hymnScript = (kind, value, alternative = false) =>",
 "    isChurchSlavonicHymn(value, hymnLocalized(kind + (alternative ? '_alt' : '') + '_script')) ? 'csl' : 'civil';",
].join('\n')+'\n';
put(hymnDecl.end,hymnDecl.end,helpers,'Localized alternate fields');

// Find the two existing accordion components by their text prop, independent
// of field order, whitespace, and the presence/absence of "section".
const accordions=[];
walk(screen.init.body,(node)=>{
 if(node.type!=='JSXElement'||node.openingElement?.name?.name!=='Accordion')return;
 const textAttr=node.openingElement.attributes.find(attribute=>
   attribute.type==='JSXAttribute'&&attribute.name?.name==='text');
 const expression=textAttr?.value?.expression;
 if(expression?.type==='Identifier'&&hymnVars.includes(expression.name)){
   accordions.push({node,kind:expression.name});
 }
});
for(const kind of hymnVars){
 const matches=accordions.filter(item=>item.kind===kind);
 if(matches.length!==1)fail('Expected one '+kind+' Accordion, found '+matches.length);
 const elem=matches[0].node;
 const opening=elem.openingElement;
 if(!opening.selfClosing)fail(kind+' accordion must be a self-closing component');
 if(opening.attributes.some(attr=>attr.type==='JSXAttribute'&&attr.name?.name==='script')){
   fail(kind+' already has a script prop');
 }
 put(opening.end-2,opening.end-2,
  "\n          script={hymnScript('"+kind+"', "+kind+")}",
  kind+' script prop');
 const alt=kind==='troparion'?'troparionAlt':'kontakionAlt';
 const altTitle=kind==='troparion'?'troparionAltTitle':'kontakionAltTitle';
 const label=kind==='troparion'
   ? "{language === 'uk' ? 'Інший тропар' : 'Иной тропарь'}"
   : "{language === 'uk' ? 'Інший кондак' : 'Иной кондак'}";
 const icon=kind==='troparion'?'♪':'✧';
 const extra=[
   '',
   '        {!!'+alt+' && (',
   '          <Accordion',
   '            title='+label,
   '            feast={'+feastName+'} date={date} sourceTitle={title}',
   '            section="'+kind+'_alt" icon="'+icon+'"',
   '            text={'+alt+'} subtitle={'+altTitle+'}',
   "            script={hymnScript('"+kind+"', "+alt+", true)}",
   "            focusHighlight={false}",
   '          />',
   '        )}',
 ].join('\n');
 let end=elem.end;
 // If existing hymn JSX is wrapped in an "{condition && (...)}" expression,
 // insert after the wrapper, not inside that expression.
 const conditional=original.slice(end).match(/^\s*\)\}/);
 if(conditional)end+=conditional[0].length;
 put(end,end,extra,'Separate '+kind+' accordion');
}
const emptyFlag='!life && !troparion && !kontakion';
if(original.includes(emptyFlag)){
 const at=original.indexOf(emptyFlag)+emptyFlag.length;
 put(at,at,' && !troparionAlt && !kontakionAlt','Empty-card fallback');
}
edits.sort((a,b)=>b.start-a.start||b.end-a.end);
let next=original;
for(const change of edits)
  next=next.slice(0,change.start)+change.text+next.slice(change.end);
parse(next);
console.log('PASS: AST-aware hymn UI patch checks.');
console.log('Feast record: '+feastName+'; Ponomar text styles: '+bodyStyled+'; subtitle styles: '+subtitleStyled);
console.log('Prepared '+edits.length+' localized changes to SaintDetailScreen.');
console.log('Other screens, calendar JSON and Django database are unchanged.');
if(!apply){
 console.log('CHECK mode — source files preserved. Use --apply to install.');
 process.exit(0);
}
if(fs.existsSync(backup))fail('Existing backup; refusing overwrite: '+backup);
fs.copyFileSync(target,backup);
try{fs.writeFileSync(target,next,'utf8');}
catch(error){fs.copyFileSync(backup,target);throw error;}
console.log('INSTALLED: separate alternative hymns + Ponomar for decoded CSL.');
console.log('BACKUP: '+backup);
