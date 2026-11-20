#!/usr/bin/env node
'use strict';
// Offline, transactional patcher. Applies only interface font-size differences between
// the immutable baseline and the reviewed traditional typography commit. Preserves
// unrelated edits in the local worktree; aborts before writing on conflicts.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {parse}=require('@babel/parser');

const root=path.resolve(__dirname,'../..');
const app=path.join(root,'molitvoslov-app');
const oldRef='f98a8c434432bcbaef0599da61bcc2da9ffac12f';
const newRef='5482c6769e62eed19550fa43d33277e6198be023';
const dry=process.argv.includes('--dry-run');
const paths=[
  'src/components/navigation/BottomNav.js',
  'src/components/navigation/FixedSectionHeader.js',
  'src/screens/HoursScreen.js',
  'src/screens/MenuScreen.js',
  'src/screens/PrayerLearningScreen.js',
  'src/screens/AccountScreen.js',
  'src/screens/CommunionPreparationScreen.js',
  'src/screens/ConfessionPreparationScreen.js',
];
const dependencies=[
  'src/services/traditionalUiTypography.js',
];
for(const rel of dependencies){
  const filename=path.join(app,rel);
  if(!fs.existsSync(filename)){
    throw Error('Missing dependency: '+rel+'; run the documented git restore first. NO FILES MODIFIED.');
  }
}

const git=(ref,rel)=>{
  try{
    return execFileSync('git',['show',ref+':molitvoslov-app/'+rel],{
      cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true,
      stdio:['ignore','pipe','pipe'],
    }).replace(/\r\n/g,'\n');
  }catch(error){
    throw Error('Git object not available: '+ref+' '+rel+
      '. Run git fetch. NO FILES MODIFIED. '+String(error.stderr||error.message).slice(0,200));
  }
};

function createHunks(a,b){
  const A=a.split('\n'),B=b.split('\n'),n=A.length,m=B.length,w=m+1;
  if(n*m>11000000)throw Error('Unexpected file size for safe patch.');
  const matrix=new Uint16Array((n+1)*(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){
    matrix[i*w+j]=A[i]===B[j]
      ?matrix[(i+1)*w+j+1]+1
      :Math.max(matrix[(i+1)*w+j],matrix[i*w+j+1]);
  }
  let i=0,j=0;const ops=[];
  while(i<n||j<m){
    if(i<n&&j<m&&A[i]===B[j]){
      ops.push({kind:'=',text:A[i]});i++;j++;
    }else if(i<n&&(j===m||matrix[(i+1)*w+j]>=matrix[i*w+j+1])){
      ops.push({kind:'-',text:A[i]});i++;
    }else{
      ops.push({kind:'+',text:B[j]});j++;
    }
  }
  const changed=[];
  for(let k=0;k<ops.length;k++)if(ops[k].kind!=='=')changed.push(k);
  const groups=[];
  for(const index of changed){
    const prior=groups[groups.length-1];
    if(prior&&index-prior.end<=5)prior.end=index;
    else groups.push({start:index,end:index});
  }
  const collect=(seq,kind)=>seq.filter(x=>x.kind!==kind).map(x=>x.text).join('\n');
  return groups.map(({start,end})=>{
    const seq=ops.slice(Math.max(0,start-3),Math.min(ops.length,end+4));
    const core=ops.slice(start,end+1);
    return {old:collect(seq,'+'),next:collect(seq,'-'),
      coreOld:collect(core,'+'),coreNew:collect(core,'-')};
  });
}
const count=(s,chunk)=>chunk?s.split(chunk).length-1:0;
// Formatting around <FixedSectionHeader> varies between the user's local
// branches. This exact JSX attribute is a safe, optional insertion, not a
// reason to reject all other localization edits. Work within the component.
function insertHoursTitleTypography(source) {
  const headers=[...source.matchAll(/<FixedSectionHeader\b[\s\S]*?\/>/gu)];
  if(headers.length!==1) {
    throw Error('HoursReadingScreen: expected exactly one FixedSectionHeader; found '+
      headers.length+'. NO FILES MODIFIED.');
  }
  const header=headers[0][0];
  if(/\btitleTextStyle\s*=/.test(header))return source; // already styled locally
  const titleMatches=[...header.matchAll(/^([ \t]*)title\s*=\s*\{\s*entry\.title\s*\}[ \t]*$/gm)];
  if(titleMatches.length!==1) {
    throw Error('HoursReadingScreen: local header has an unrecognized title '+
      'attribute. NO FILES MODIFIED.');
  }
  const match=titleMatches[0];
  const updated=header.slice(0,match.index+match[0].length)+
    '\n'+match[1]+'titleTextStyle={titleStyle}'+
    header.slice(match.index+match[0].length);
  return source.slice(0,headers[0].index)+updated+
    source.slice(headers[0].index+header.length);
}
// Resolve selected translation UI in the existing local header without
// replacing its custom animated chrome, scroll behavior or markup.
function replaceHeaderTextNode(source, marker, update, description) {
  const expression=marker==='styles.headerActionText'
    ? /\bstyles\.headerActionText\b/gu : /\bstyles\.languageDropdownText\b/gu;
  const hits=[...source.matchAll(expression)];
  if(hits.length!==1)
    throw Error('FixedSectionHeader: non-unique '+description+'. NO FILES MODIFIED.');
  const at=hits[0].index, begin=source.lastIndexOf('<Text',at);
  const end=source.indexOf('</Text>',at), openEnd=source.indexOf('>',at);
  if(begin<0||end<0||openEnd<0||begin>at||openEnd>end)
    throw Error('FixedSectionHeader: unusual '+description+' markup. NO FILES MODIFIED.');
  const section=source.slice(begin,end+7);
  return source.slice(0,begin)+update(section)+source.slice(end+7);
}
function appendTraditionalStyle(section,styleName) {
  if(section.includes('traditionalStyle'))return section;
  const match=section.match(/style\s*=\s*\{\[([\s\S]*?)\]\}/u);
  if(!match||!match[1].includes('styles.'+styleName))
    throw Error('FixedSectionHeader: unusual '+styleName+' layout. NO FILES MODIFIED.');
  const value=match[1];
  const addition=value.trimEnd().endsWith(',')?' traditionalStyle':', traditionalStyle';
  return section.replace(match[0],match[0].replace(/\]\}$/u,addition+']}'));
}
function patchFixedHeaderLanguagePill(source) {
  const marker='styles.languagePill';
  const hits=[...source.matchAll(/\bstyles\.languagePill\b/gu)];
  if(hits.length!==1)
    throw Error('FixedSectionHeader: language pill not unique. NO FILES MODIFIED.');
  const at=hits[0].index, begin=source.lastIndexOf('<Pressable',at);
  const end=source.indexOf('</Pressable>',at);
  if(begin<0||end<0)
    throw Error('FixedSectionHeader: language pill structure changed. NO FILES MODIFIED.');
  let section=source.slice(begin,end+12);
  if(!section.includes("accessibilityLabel={t('common.language')}"))
    section=section.replace(/\baccessibilityLabel\s*=\s*(['"])[^'"]*\1/u,
      "accessibilityLabel={t('common.language')}");
  if(!section.includes('labelForReadingMode(selectedLanguage)')){
    const expr=/\{\s*selectedLanguage(?:\?\.)?\.label\s*\}/gu;
    if([...section.matchAll(expr)].length!==1)
      throw Error('FixedSectionHeader: reading language pill text changed. NO FILES MODIFIED.');
    section=section.replace(expr,'{labelForReadingMode(selectedLanguage)}');
  }
  return source.slice(0,begin)+section+source.slice(end+12);
}
function patchFixedHeaderAction(source) {
  return replaceHeaderTextNode(source,'styles.headerActionText',
    section=>appendTraditionalStyle(section,'headerActionText'),
    'header action label');
}
function patchFixedHeaderDropdown(source) {
  return replaceHeaderTextNode(source,'styles.languageDropdownText',section=>{
    let result=appendTraditionalStyle(section,'languageDropdownText');
    if(!result.includes('labelForReadingMode(option)')){
      const expr=/\{\s*option\.label\s*\}/gu;
      if([...result.matchAll(expr)].length!==1)
        throw Error('FixedSectionHeader: dropdown text changed. NO FILES MODIFIED.');
      result=result.replace(expr,'{labelForReadingMode(option)}');
    }
    return result;
  },'language dropdown');
}

// Semantic fallbacks for the shared header. Its JSX and height calculations
// have local, unrelated changes that must NOT be replaced with a remote copy.
function patchHeaderTypography(source, index) {
  const rel='src/components/navigation/FixedSectionHeader.js';
  function substitute(rx, transform, label) {
    const matches=[...source.matchAll(rx)];
    if(matches.length!==1)
      throw Error(rel+': '+label+' expected one match, found '+matches.length+
        '. Local changes preserved. NO FILES MODIFIED.');
    const m=matches[0];
    return source.slice(0,m.index)+transform(m)+source.slice(m.index+m[0].length);
  }
  function alterHeight(declName,delta,test) {
    const rx=new RegExp('(^[ \\t]*const[ \\t]+'+declName+'[ \\t]*=[ \\t]*)([\\s\\S]*?)(;[ \\t]*$)','gm');
    return substitute(rx,m=>{
      if(test(m[2]))return m[0];
      return m[1]+'('+m[2].trim()+') + '+delta+m[3];
    },declName);
  }
  function patchLabelStyle(name,additional,oldLabel) {
    const markerRx=new RegExp('\\bstyles\\.'+name+'\\b','gu');
    const hits=[...source.matchAll(markerRx)];
    if(hits.length!==1)
      throw Error(rel+': '+name+' expected once, found '+hits.length+
        '. NO FILES MODIFIED.');
    const at=hits[0].index;
    const begin=source.lastIndexOf('<Text',at);
    const end=source.indexOf('</Text>',at);
    if(begin<0||end<0||begin>at)
      throw Error(rel+': '+name+' JSX changed. NO FILES MODIFIED.');
    const chunk=source.slice(begin,end+7);
    const match=chunk.match(/style\s*=\s*\{\[([\s\S]*?)\]\}/u);
    if(!match||!match[1].includes('styles.'+name))
      throw Error(rel+': '+name+' style not an array. NO FILES MODIFIED.');
    let updated=chunk;
    if(!match[1].includes('traditionalUiTextStyle(')){
      let contents=match[1];
      const oldToken=new RegExp('\\b'+oldLabel+'\\b','gu');
      if(oldLabel && oldToken.test(contents))
        contents=contents.replace(oldToken,additional);
      else contents=contents.replace(/\s*$/u,'')+
        (contents.trimEnd().endsWith(',')?' ':', ')+additional;
      updated=chunk.replace(match[0],match[0].replace(match[1],contents));
    }
    return source.slice(0,begin)+updated+source.slice(end+7);
  }
  switch(index) {
    case 0:
      if(source.includes("import {traditionalUiTextStyle}"))return source;
      return substitute(/(^[ \t]*import \{useInterfaceScale\} from ['"][^'"]+['"];[ \t]*$)/gm,
        m=>m[0]+"\nimport {traditionalUiTextStyle} from '../../services/traditionalUiTypography';",
        'typography import');
    case 1: {
      if(source.includes("const traditionalStyle = traditionalUiTextStyle("))return source;
      return substitute(/(^[ \t]*const traditionalStyle\s*=\s*)([\s\S]*?)(;[ \t]*$)/gm,m=>{
        if(!m[2].includes('Ponomar')&&!m[2].includes('csl_traditional'))
          throw Error(rel+': unfamiliar traditionalStyle. NO FILES MODIFIED.');
        const prefix=m[1].match(/^[ \t]*/)[0];
        return prefix+"const traditional = language === 'csl_traditional';\n"+
          m[1]+'traditionalUiTextStyle(language, (compactReading ? 17 : 21) * uiScale, '+
          '(compactReading ? 20 : 25) * uiScale)'+m[3];
      },'traditionalStyle declaration');
    }
    case 2: {
      // Preserve the user's custom line-height formula, merely add extra room
      // for larger traditional glyphs on multi-line titles.
      return alterHeight('extraTitleHeight',
        "(showTitle ? Math.max(0, titleLines - 1) * Math.max(0, "+
        "(traditionalStyle?.lineHeight || 0) - Math.ceil((compactReading ? 20 : 25) * uiScale)) : 0)",
        expr=>expr.includes('traditionalStyle?.lineHeight'));
    }
    case 3:
      return alterHeight('headerHeight',"(traditional ? Math.ceil(10 * uiScale) : 0)",
        expr=>expr.includes("traditional ? Math.ceil(10 * uiScale)"));
    case 4: {
      const rx=/(compactReading\s*&&\s*\{\s*height\s*:\s*)([^}]+)(\})/gu;
      const hits=[...source.matchAll(rx)];
      if(!hits.length) {
        // A custom responsive header may no longer need an explicit title height.
        // headerHeight above still reserves the extra space.
        return source;
      }
      if(hits.length!==1)
        throw Error(rel+': ambiguous compact reading height. NO FILES MODIFIED.');
      const m=hits[0];
      if(m[2].includes('traditional'))return source;
      return source.slice(0,m.index)+m[1]+'('+m[2].trim()+') + '+
        '(traditional ? Math.ceil(10 * uiScale) : 0)'+m[3]+
        source.slice(m.index+m[0].length);
    }
    case 5:
      return patchLabelStyle('languagePillText',
        'traditionalUiTextStyle(language, 10 * uiScale, 14 * uiScale)',null);
    case 6:
      return patchLabelStyle('headerActionText',
        'traditionalUiTextStyle(language, 11 * uiScale, 15 * uiScale)','traditionalStyle');
    case 7:
      return patchLabelStyle('languageDropdownText',
        'traditionalUiTextStyle(language, 13 * uiScale, 19 * uiScale)','traditionalStyle');
    default:
      throw Error(rel+': unexpected edit number '+index+'. NO FILES MODIFIED.');
  }
}


// MenuScreen has extensive local revisions. Apply the typography semantically
// without replacing whole JSX cards, drag/drop handlers or visual styling.
function patchMenuTypography(source) {
  const rel='src/screens/MenuScreen.js';
  let output=source;
  const importLine="import {traditionalUiTextStyle} from '../services/traditionalUiTypography';";
  if(!output.includes(importLine)) {
    const imports=[...output.matchAll(/^import[ \t][^\n]*;[ \t]*$/gm)];
    if(!imports.length)
      throw Error(rel+': imports not recognized. NO FILES MODIFIED.');
    const last=imports[imports.length-1];
    const at=last.index+last[0].length;
    output=output.slice(0,at)+'\n'+importLine+output.slice(at);
  }
  function patchDecorativeCard(code) {
    const tree=parse(code,{sourceType:'module',plugins:['jsx']});
    const found=[];
    for(const statement of tree.program.body) {
      if(statement.type!=='VariableDeclaration')continue;
      for(const declaration of statement.declarations) {
        if(declaration.id?.name==='DecorativeCard')found.push(declaration);
      }
    }
    if(found.length!==1||found[0].init?.body?.type!=='BlockStatement')
      throw Error(rel+': DecorativeCard component not found uniquely. NO FILES MODIFIED.');
    const block=found[0].init.body;
    let part=code.slice(block.start,block.end);
    const hook=/^([ \t]*)const\s+\{[^}\n]*\blanguage\b[^}\n]*\}\s*=\s*useLanguage\(\);[ \t]*$/gm;
    const hooks=[...part.matchAll(hook)];
    if(hooks.length!==1)
      throw Error(rel+': DecorativeCard language hook changed. NO FILES MODIFIED.');
    const indent=hooks[0][1];
    const additions=[
      ['traditional', "const traditional = language === 'csl_traditional';"],
      ['traditionalTitleStyle',"const traditionalTitleStyle = traditionalUiTextStyle(language, 17 * uiScale, 20 * uiScale);"],
      ['traditionalSubtitleStyle',"const traditionalSubtitleStyle = traditionalUiTextStyle(language, 11 * uiScale, 14 * uiScale);"],
      ['cardHeight',"const cardHeight = (traditional ? 116 : 80) * uiScale;"],
    ].filter(([name])=>!new RegExp('\\bconst\\s+'+name+'\\s*=').test(part));
    if(additions.length) {
      const at=hooks[0].index+hooks[0][0].length;
      part=part.slice(0,at)+additions.map(pair=>'\n'+indent+pair[1]).join('')+part.slice(at);
    }
    function extendArrayStyle(name,extra) {
      const styleRx=/style\s*=\s*\{\[([\s\S]*?)\]\}/gu;
      const matches=[...part.matchAll(styleRx)]
        .filter(m=>new RegExp('\\bstyles\\.'+name+'\\b').test(m[1]));
      if(matches.length!==1)
        throw Error(rel+': DecorativeCard '+name+' style changed. NO FILES MODIFIED.');
      const m=matches[0];
      if(m[1].includes(extra))return;
      const chunk=m[0];
      const update=chunk.replace(/\]\}$/,', '+extra+']}');
      part=part.slice(0,m.index)+update+part.slice(m.index+chunk.length);
    }
    extendArrayStyle('libraryTitle','traditionalTitleStyle');
    extendArrayStyle('librarySubtitle','traditionalSubtitleStyle');
    const styleRx=/style\s*=\s*\{\s*\(\s*\{\s*pressed\s*\}\s*\)\s*=>\s*\[([\s\S]*?)\]\s*\}/gu;
    const styles=[...part.matchAll(styleRx)].filter(m=>m[1].includes('styles.libraryCard'));
    if(styles.length!==1)
      throw Error(rel+': DecorativeCard height layout changed. NO FILES MODIFIED.');
    const m=styles[0];
    if(!m[1].includes('traditional && {minHeight: cardHeight, height: cardHeight}')) {
      const update=m[0].replace(/\]\s*\}$/,
        ', traditional && {minHeight: cardHeight, height: cardHeight}]}');
      part=part.slice(0,m.index)+update+part.slice(m.index+m[0].length);
    }
    return code.slice(0,block.start)+part+code.slice(block.end);
  }
  output=patchDecorativeCard(output);
  if(!/\bconst\s+categoryHeight\s*=/.test(output)) {
    const rx=/^([ \t]*)const\s+categoryStride\s*=\s*([^;\n]+);[ \t]*$/gm;
    const matches=[...output.matchAll(rx)];
    if(matches.length===1) {
      const m=matches[0];
      const original=m[2].trim();
      const declaration=m[1]+"const categoryHeight=(calendarLanguage === 'csl_traditional' ? 116 : 80)*uiScale;";
      const newStride=m[1]+'const categoryStride=(calendarLanguage === '+
        "'csl_traditional' ? Math.max(("+original+"), categoryHeight+8) : ("+original+'));';
      output=output.slice(0,m.index)+declaration+'\n'+newStride+
        output.slice(m.index+m[0].length);
    } else if(matches.length>1)
      throw Error(rel+': multiple categoryStride declarations. NO FILES MODIFIED.');
    // An earlier non-draggable category view has no categoryStride.
  }
  if(/\bconst\s+categoryHeight\s*=/.test(output)) {
    const heightProp=/\bcardHeight\s*=\s*\{([^{}\n]+)\}/gu;
    const props=[...output.matchAll(heightProp)];
    if(props.length===1) {
      const m=props[0],value=m[1].trim();
      if(!value.includes('categoryHeight')) {
        const desired='cardHeight={Math.max(('+value+'), categoryHeight)}';
        output=output.slice(0,m.index)+desired+output.slice(m.index+m[0].length);
      }
    } else if(props.length>1)
      throw Error(rel+': more than one draggable cardHeight. NO FILES MODIFIED.');
  }
  return output;
}

function patchByHunks(source,changes,relative){
  let output=source;
  changes.forEach((h,index)=>{
    if(h.old===h.next)return;
    if(count(output,h.next)===1)return; // already applied
    else if(count(output,h.old)===1)output=output.replace(h.old,h.next);
    else if(h.coreOld&&count(output,h.coreOld)===1)
      output=output.replace(h.coreOld,h.coreNew);
    else if(relative==='src/screens/HoursReadingScreen.js' &&
      !h.coreOld && h.coreNew.trim()==='titleTextStyle={titleStyle}')
      output=insertHoursTitleTypography(output);
    else if(relative==='src/components/navigation/FixedSectionHeader.js' &&
      h.coreNew.includes('traditionalUiTextStyle'))
      output=patchHeaderTypography(output,index);
    else if(relative==='src/components/navigation/FixedSectionHeader.js' &&
      h.coreNew.includes('const extraTitleHeight'))
      output=patchHeaderTypography(output,index);
    else if(relative==='src/components/navigation/FixedSectionHeader.js' &&
      h.coreNew.includes('const headerHeight'))
      output=patchHeaderTypography(output,index);
    else if(relative==='src/components/navigation/FixedSectionHeader.js' &&
      h.coreNew.includes('compactReading && {height:'))
      output=patchHeaderTypography(output,index);
    else if(relative==='src/components/navigation/FixedSectionHeader.js' &&
      h.coreNew.includes("import {traditionalUiTextStyle}"))
      output=patchHeaderTypography(output,index);
    else if(relative==='src/components/navigation/FixedSectionHeader.js' &&
      h.coreNew.includes('const traditionalStyle'))
      output=patchHeaderTypography(output,index);
    else if(relative==='src/components/navigation/FixedSectionHeader.js' &&
      h.coreNew.includes('labelForReadingMode(selectedLanguage)'))
      output=patchFixedHeaderLanguagePill(output);
    else if(relative==='src/components/navigation/FixedSectionHeader.js' &&
      h.coreNew.includes('styles.headerActionText') &&
      h.coreNew.includes('traditionalStyle'))
      output=patchFixedHeaderAction(output);
    else if(relative==='src/components/navigation/FixedSectionHeader.js' &&
      h.coreNew.includes('labelForReadingMode(option)'))
      output=patchFixedHeaderDropdown(output);
    else throw Error(relative+' conflict at change '+(index+1)+'/'+changes.length+
      ' (old='+count(output,h.old)+', next='+count(output,h.next)+
      ', core='+count(output,h.coreOld)+'). '+
      'Existing edits preserved. NO FILES MODIFIED.');
  });
  return output;
}
function patch(source,changes,relative) {
  if(relative!=='src/screens/MenuScreen.js')
    return patchByHunks(source,changes,relative);
  try {
    return patchByHunks(source,changes,relative);
  } catch(error) {
    if(!String(error?.message||error).includes('conflict at change'))throw error;
    return patchMenuTypography(source);
  }
}
const writes=[];
for(const rel of paths){
  const file=path.join(app,rel);
  if(!fs.existsSync(file))throw Error('File missing: '+rel+'. NO FILES MODIFIED.');
  const base=git(oldRef,rel);
  const next=git(newRef,rel);
  const hunks=createHunks(base,next);
  if(patch(base,hunks,rel)!==next){
    throw Error('Patch self-validation failed for '+rel+'. NO FILES MODIFIED.');
  }
  const source=fs.readFileSync(file,'utf8');
  const patched=patch(source.replace(/\r\n/g,'\n'),hunks,rel);
  parse(patched,{sourceType:'module',plugins:['jsx']});
  const result=source.includes('\r\n')?patched.replace(/\n/g,'\r\n'):patched;
  if(result!==source)writes.push({file,rel,result});
}
console.log('PASS: traditional font-size patch prepared in memory; all files parse.');
console.log('TO UPDATE:',writes.map(x=>x.rel).join(', ')||'none');
if(!writes.length){console.log('ALREADY INSTALLED. NO FILES MODIFIED.');process.exit(0);}
if(dry){console.log('DRY RUN. NO FILES MODIFIED.');process.exit(0);}
const backup=path.resolve(root,'build-backups',
  'traditional-ui-font-size-'+new Date().toISOString().replace(/[:.]/g,'-'));
for(const x of writes){
  const dest=path.join(backup,x.rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(x.file,dest);
}
for(const x of writes){
  fs.writeFileSync(x.file,x.result,'utf8');
  console.log('UPDATED:',x.rel);
}
console.log('BACKUP:',backup);
