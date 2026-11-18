#!/usr/bin/env node
'use strict';
// Safely integrate the improved Android widgets from the GitHub branch into
// the user's Windows checkout. Unrelated local edits are 3-way merged, never
// overwritten. Every candidate is validated BEFORE any files are written.
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const repoRoot=path.resolve(__dirname,'..','..');
const appRoot=path.join(repoRoot,'molitvoslov-app');
const beforeRef='origin/fix/calendar-auto-day-rollover-20261118';
const afterRef='origin/feat/widgets-responsive-state-20261118';
const targets=[
 'src/widgets/widgetLayout.js',
 'src/widgets/widgetState.js',
 'src/widgets/QuoteOfDayWidget.js',
 'src/widgets/ChurchCalendarWidget.js',
 'src/widgets/widgetTaskHandler.js',
 'src/screens/MenuScreen.js',
 'tools/test_widget_bundle_20261118.js',
];
const git=(...args)=>execFileSync('git',args,{cwd:repoRoot,encoding:'utf8',maxBuffer:20*1024*1024});
const gitFile=(ref,p)=>git('show',ref+':molitvoslov-app/'+p);
try{
 git('rev-parse','--verify',afterRef);
 git('rev-parse','--verify',beforeRef);
}catch(error){
 console.error('Missing local GitHub refs. Fetch BOTH feature and base branches first.');
 process.exit(1);
}
const originalStyle=(text,merged)=>text.includes('\r\n')?
 merged.replace(/\r?\n/g,'\r\n'):merged.replace(/\r\n/g,'\n');

// Quote layouts often have substantial legitimate user edits, so merging
// the whole layout fails even when both versions are valid. Preserve that
// exact layout on conflict; change only the font and, when the pre-existing
// responsive variables are recognizable, add a bounded text-fit calculation.
const reconcileLocalQuote = original => {
  const normalized = original.replace(/\r\n/g,'\n');
  if (!/export\s+const\s+QuoteOfDayWidget\b/.test(normalized) ||
      !/TextWidget/.test(normalized)) {
    throw Error('QuoteOfDayWidget.js: unrecognized local component; no files changed.');
  }
  // Native Android system font, not Church Slavonic Ponomar.
  let text = normalized.replace(/(['"])Ponomar(?:-Regular)?\1/gi, "'sans-serif'");
  const fontStyle = /fontFamily\s*:\s*(['"])([^'"]+)\1/g;
  text = text.replace(fontStyle, (match, quote, family) =>
    /ponomar/i.test(family) ? "fontFamily: 'sans-serif'" : match);
  const hasFitText = /\bfitText\s*\(/.test(text);
  const canAdaptQuote = !hasFitText &&
    /const\s+widgetWidth\s*=/.test(text) &&
    /const\s+widgetHeight\s*=/.test(text) &&
    /const\s+horizontalPadding\s*=/.test(text) &&
    /const\s+verticalPadding\s*=/.test(text) &&
    /const\s+quoteFontSize\s*=/.test(text) &&
    /const\s+sourceFontSize\s*=/.test(text) &&
    /fontSize:\s*quoteFontSize\b/.test(text) &&
    /lineHeight:\s*quoteLineHeight\b/.test(text) &&
    /return\s*\(\s*<OverlapWidget\b/.test(text);
  if (canAdaptQuote) {
    if (!/\bimport\s*\{[^}]*\bfitText\b[^}]*\}\s*from\s*['"]\.\/widgetLayout['"]/.test(text)) {
      const imports = [...text.matchAll(/^import[^\n]*;[ \t]*$/gm)];
      const last = imports[imports.length-1];
      if (!last) throw Error('QuoteOfDayWidget.js has no identifiable import statements.');
      const position = last.index + last[0].length;
      text = text.slice(0,position) +
        "\nimport {fitText} from './widgetLayout';" +
        text.slice(position);
    }
    const expression = [
      '  // Fit quote text inside the existing local layout without changing its design.',
      '  const quoteFit = fitText({',
      "    text: String(text || '').trim(),",
      '    maxWidth: Math.max(1, widgetWidth - 2 * horizontalPadding - 2),',
      '    maxHeight: Math.max(1, widgetHeight - 2 * verticalPadding -',
      '      (source ? sourceFontSize + 8 : 0)),',
      '    maxFont: quoteFontSize,',
      '    minFont: 11,',
      '  });',
      '',
    ].join('\n');
    const target = /  return\s*\(\s*<OverlapWidget\b/;
    const pos = text.search(target);
    if (pos<0)throw Error('Could not locate quote render safely.');
    text = text.slice(0,pos)+expression+text.slice(pos);
    text = text.replace(/fontSize:\s*quoteFontSize\b/g,'fontSize: quoteFit.fontSize')
      .replace(/lineHeight:\s*quoteLineHeight\b/g,'lineHeight: quoteFit.lineHeight');
    console.log('NOTE: preserved customized QuoteOfDayWidget styling; added bounded fitting.');
  } else {
    console.log('NOTE: preserved customized QuoteOfDayWidget layout; '+
      'system font updated. Existing local typography calculations retained.');
  }
  return originalStyle(original,text);
};


// Preserve a locally customized calendar's appearance/handlers by adapting
// its existing component to the new per-widget monthKey/selectedKey contract.
// This does not replace the JSX and retains all local calendar UI additions.
const reconcileLocalCalendar = original => {
  let text = original.replace(/\r\n/g, '\n');
  if (text.includes('const PreservedChurchCalendarWidget =') &&
      text.includes('export const ChurchCalendarWidget = props => {')) {
    return originalStyle(original,
      text.replace(/(['"])Ponomar(?:-Regular)?\1/gi, "'sans-serif'"));
  }
  const exported = /\bexport\s+const\s+ChurchCalendarWidget\s*=/g;
  const matches = [...text.matchAll(exported)];
  if (matches.length !== 1 || !/\bdisplayDate\b/.test(text) ||
      !/\bday\b/.test(text) ||
      !/CALENDAR_PREV_MONTH/.test(text) ||
      !/CALENDAR_NEXT_MONTH/.test(text) ||
      !/CALENDAR_SELECT_DAY/.test(text)) {
    throw Error('ChurchCalendarWidget.js: cannot safely adapt custom calendar. ' +
      'NO FILES MODIFIED. Send the file for an exact merge.');
  }
  text = text.replace(exported, 'const PreservedChurchCalendarWidget =');
  // Keep all existing visual styles, icons, calendar cell click handlers,
  // locale selection, and reading links; only remove Ponomar fonts.
  text = text.replace(/(['"])Ponomar(?:-Regular)?\1/gi, "'sans-serif'");
  const helperImport = "import {parseDateKey, parseMonthKey} from './widgetState';";
  if (!text.includes(helperImport)) {
    const imports = [...text.matchAll(/^import[^\n]*;[ \t]*$/gm)];
    const last = imports[imports.length-1];
    if (!last) throw Error('ChurchCalendarWidget.js: cannot add widgetState import safely.');
    const position = last.index + last[0].length;
    text = text.slice(0,position) + '\n' + helperImport + text.slice(position);
  }
  // The previous calendar received displayDate separately, whereas the new
  // widget task handler sends monthKey and selectedKey for each widget.
  text += [
    '',
    '// Keep the original customized appearance while supporting per-widget state.',
    'export const ChurchCalendarWidget = props => {',
    '  const month = parseMonthKey(props.monthKey);',
    '  const date = parseDateKey(props.selectedKey);',
    '  const displayDate = month',
    '    ? new Date(month.year, month.month - 1, 1, 12)',
    '    : props.displayDate;',
    '  const day = date',
    '    ? props.day?.date_gregorian === props.selectedKey',
    '      ? props.day',
    '      : {...(props.day || {}), date_gregorian: props.selectedKey}',
    '    : props.day;',
    '  return <PreservedChurchCalendarWidget',
    '    {...props} day={day} displayDate={displayDate} />;',
    '};',
    '',
  ].join('\n');
  console.log('NOTE: local ChurchCalendarWidget design preserved; ' +
    'system font and per-instance calendar navigation added. ' +
    'The new 6-row visual redesign was not forced over custom styling.');
  return originalStyle(original,text);
};

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'molitvoslov-widgets-'));
let files=[];
try{
 for(const name of targets){
  const file=path.join(appRoot,name);
  const exists=fs.existsSync(file);
  const local=exists?fs.readFileSync(file,'utf8'):null;
  const incoming=gitFile(afterRef,name);
  let updated=incoming;
  if(exists && local!==incoming){
   let base=null;
   try{base=gitFile(beforeRef,name)}catch(_error){}
   if(base===null){
    throw Error(name+': this file already exists locally, but was new in feature branch.');
   }
   if(local===base)updated=incoming;
   else if(local===incoming)updated=local;
   else{
    const prefix=String(files.length);
    const mine=path.join(temp,prefix+'-local');
    const ancestor=path.join(temp,prefix+'-base');
    const theirs=path.join(temp,prefix+'-remote');
    fs.writeFileSync(mine,local,'utf8');
    fs.writeFileSync(ancestor,base,'utf8');
    fs.writeFileSync(theirs,incoming,'utf8');
    const merge=spawnSync('git',['merge-file','-p',mine,ancestor,theirs],{
      cwd:repoRoot,encoding:'utf8',maxBuffer:20*1024*1024,
    });
    if(merge.status!==0 || /^(<<<<<<<|=======|>>>>>>>)/m.test(merge.stdout)){
      if (name==='src/widgets/QuoteOfDayWidget.js') {
        updated=reconcileLocalQuote(local);
      } else if (name==='src/widgets/ChurchCalendarWidget.js') {
        updated=reconcileLocalCalendar(local);
      } else {
        throw Error(name+': local edit intersects widget changes ('+
          (merge.stderr||'merge conflict').trim()+'). NO FILES MODIFIED.');
      }
    } else {
      updated=originalStyle(local,merge.stdout);
    }
   }
  }
  // Even a clean 3-way merge may retain a custom Ponomar declaration.
  // Normalize all explicit widget font literals to Android system font.
  if (name === 'src/widgets/QuoteOfDayWidget.js' ||
      name === 'src/widgets/ChurchCalendarWidget.js') {
    updated=updated.replace(/(['"])Ponomar(?:-Regular)?\1/gi, "'sans-serif'");
  }
  files.push({name,file,exists,original:local,updated});
 }
 const pending=files.filter(x=>!x.exists||x.updated!==x.original);
 if(!pending.length){
  console.log('PASS: all improved widget sources already installed.');
  process.exit(0);
 }
 if (process.argv.includes('--dry-run')) {
   console.log('DRY RUN: all widget sources validated; NO FILES MODIFIED.');
   console.log('Would change:',pending.map(x=>x.name).join(', '));
   process.exit(0);
 }
 const backups=path.resolve(repoRoot,'build-backups',
   'widgets-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
 fs.mkdirSync(backups,{recursive:true});
 for(const item of pending)if(item.exists){
  const destination=path.join(backups,item.name.replace(/[\\/]/g,'__'));
  fs.copyFileSync(item.file,destination);
 }
 const written=[];
 try{
  for(const item of pending){
   fs.mkdirSync(path.dirname(item.file),{recursive:true});
   fs.writeFileSync(item.file,item.updated,'utf8');
   written.push(item);
  }
 }catch(error){
  for(const item of written){
   if(item.exists)fs.writeFileSync(item.file,item.original,'utf8');
   else if(fs.existsSync(item.file))fs.unlinkSync(item.file);
  }
  throw error;
 }
 console.log('PASS: widgets integrated, preserving unrelated local changes.');
 console.log('Changed:',pending.map(x=>x.name).join(', '));
 console.log('Backups:',backups);
 console.log('Run: node tools/test_widget_bundle_20261118.js');
}finally{
 fs.rmSync(temp,{recursive:true,force:true});
}
