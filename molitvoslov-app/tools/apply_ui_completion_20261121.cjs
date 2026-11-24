#!/usr/bin/env node
'use strict';
// Transactional three-way merge of vetted interface-only changes.
// Never resets source files, stages Git changes, or overwrites conflicting edits.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'../..');
const app=path.join(root,'molitvoslov-app');
const baseRef='f98a8c434432bcbaef0599da61bcc2da9ffac12f';
const targetRef='e88b64c7d5a828d9c9498835f7513a84750da12c';
const dry=process.argv.includes('--dry-run');
const paths=[
  'src/i18n/translations.js',
  'src/services/traditionalUiTypography.js',
  'src/components/navigation/BottomNav.js',
  'src/components/navigation/FixedSectionHeader.js',
  'src/screens/HoursScreen.js',
  'src/screens/MenuScreen.js',
  'src/screens/PrayerLearningScreen.js',
  'src/screens/AccountScreen.js',
  'src/screens/CommunionPreparationScreen.js',
  'src/screens/ConfessionPreparationScreen.js',
  'src/screens/FavoritesScreen.js',
  'src/screens/SearchScreen.js',
  'src/screens/NotificationsScreen.js',
  'src/screens/PrayerBooksScreen.js',
  'src/screens/ChurchCalendarScreen.js',
  'src/components/share/ContentContextMenu.js',
  'src/components/reader/ReaderBookmarkMenu.js',
  'src/components/reader/ReaderAppearanceSheet.js',
];
const deps=['src/i18n/interfaceCompletion.js'];
for(const rel of deps)if(!fs.existsSync(path.join(app,rel)))
  throw Error('Missing '+rel+'. Fetch dependencies first. NO FILES MODIFIED.');
const git=(ref,rel)=>{
  try{
    return execFileSync('git',['show',ref+':molitvoslov-app/'+rel],
      {cwd:root,encoding:'utf8',maxBuffer:20*1024*1024,windowsHide:true})
      .replace(/\r\n/g,'\n');
  }catch(error){
    throw Error('Missing Git revision '+ref+' for '+rel+
      ' (fetch the branch first). NO FILES MODIFIED.');
  }
};

const allowed = {
  'src/components/navigation/BottomNav.js': /traditionalStyle|rowHeight|traditional\s*=|navCompact/,
  'src/components/navigation/FixedSectionHeader.js': /lastTitleLineWidth|titleLineWidth|flowLongTitleWithLanguage|traditionalStyle|languagePill|extraTitleHeight|headerHeight|titleLines/,
  'src/screens/MenuScreen.js': /traditionalTitleStyle|traditionalSubtitleStyle|traditionalStyle|cardHeight|libraryCard/,
  'src/screens/NotificationsScreen.js': /openCreate|openEdit|initialDraft|setTimePickerOpen|setDraft/,
  'src/screens/PrayerBooksScreen.js': /actionsColumn|shareBook|shareButton|accessibilityLabel/,
  'src/components/share/ContentContextMenu.js': /deleteLabel|contextActions\.delete|Удалить из избранного/,
};
const marker = /^<<<<<<< local\r?\n([\s\S]*?)^\|\|\|\|\|\|\| old\r?\n([\s\S]*?)^=======\r?\n([\s\S]*?)^>>>>>>> new\r?\n?/gm;
const assert = (condition, message) => { if(!condition) throw Error(message); };
const resolved = [];
const preservedLocal = [];
const safeLocalPreference = new Set([
  'src/components/navigation/BottomNav.js',
  'src/screens/MenuScreen.js',
]);

const jobs=[],conflicts=[];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'molitvoslov-ui-merge-'));
function mergeThreeWay(local,base,target,rel) {
  if(local===target)return local;
  if(local===base)return target;
  const filenames=['ours.js','base.js','theirs.js'].map(name=>path.join(temp,name));
  [local,base,target].forEach((content,i)=>fs.writeFileSync(filenames[i],content,'utf8'));
  try {
    return execFileSync('git',[
      'merge-file','--stdout','--diff3',
      '-L','local','-L','old','-L','new',
      ...filenames
    ],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:25*1024*1024});
  }catch(error) {
    const output=String(error.stdout||'');
    let n=0, rejected=0;
    const merged=output.replace(marker,(full,ours,old,theirs)=>{
      n++;
      if(ours===old)return theirs;
      if(theirs===old)return ours;
      if(!allowed[rel] || !allowed[rel].test(ours+'\n'+theirs)){
        if(!safeLocalPreference.has(rel)){
          rejected++;
          return full;
        }
        // These two UI screens have existing local revisions. Never replace an
        // unknown local block with GitHub content: retain it and reapply the
        // known, reviewed interface requirements in repair() below.
        preservedLocal.push(rel+': conflict block '+n);
        return ours;
      }
      // Keep known local UI behavior; repair applies compatible upstream changes below.
      return ours;
    });
    assert(n>0 && !rejected &&
      !/^(<<<<<<<|\|\|\|\|\|\|\||=======|>>>>>>>)/m.test(merged),
      'Unknown or unresolved conflict ('+rel+', blocks='+n+', rejected='+rejected+').');
    resolved.push(rel+': '+n+' block(s)');
    return merged;
  }
}

// Narrow compatibility adjustments. Reject missing features rather than silently overwriting them.
function repair(merged,rel){
  if(rel==='src/components/navigation/BottomNav.js'){
    // Ensure both foreground and labels stay legible on the restored light bar.
    merged=merged.replace(
      /(<LinearGradient\s+colors=)\{\[[^\]]+\]\}/,
      "$1{['rgba(255, 246, 228, 0.93)', 'rgba(240, 224, 194, 0.88)']}");
    merged=merged.replace(
      /const color = active \? '[^']+' : '[^']+';/,
      "const color = active ? '#442818' : '#65452F';");
    merged=merged.replace(
      /const rowHeight = Math\.round\([^;\n]+\);/,
      "const rowHeight = Math.round((traditional ? 54 : 46) + (uiScale - 1) * 54);");
    // Normalize the single visible navigation-label line count. Existing
    // local edits may use a different expression for numberOfLines.
    const lineCountAttrs=[...merged.matchAll(/numberOfLines=\{[^}]+\}/g)];
    assert(lineCountAttrs.length===1,
      'BottomNav requires one visible label numberOfLines, found '+lineCountAttrs.length);
    merged=merged.replace(/numberOfLines=\{[^}]+\}/,
      'numberOfLines={uiScale > 1.15 ? 2 : 1}');
    if(!merged.includes("t('navCompact.'+item.key)")){
      const visibleLabel=/\{t\(item\.labelKey\)\}(?=\s*<\/Text>)/;
      assert(visibleLabel.test(merged),'Cannot identify visible BottomNav label');
      merged=merged.replace(visibleLabel,
        "{traditional ? t('navCompact.'+item.key) : t(item.labelKey)}");
    }
    merged=merged.replace(/accessibilityLabel=\{t\(item\.labelKey\)\}/,
      "accessibilityLabel={traditional ? t('navCompact.'+item.key) : t(item.labelKey)}");
    assert(merged.includes("t('navCompact.'+item.key)"),'BottomNav translation missing');
    assert(merged.includes('numberOfLines={uiScale > 1.15 ? 2 : 1}'),
      'BottomNav compact labels missing');
    assert(!merged.includes('traditional ? 72 : 46'),'BottomNav oversized row not fixed');
    assert(merged.includes("colors={['rgba(255, 246, 228, 0.93)'"),'Light bar missing');
    assert(merged.includes("const color = active ? '#442818' : '#65452F'"),'Nav icon contrast missing');
  }
  if(rel==='src/components/navigation/FixedSectionHeader.js'){
    if(/\btraditional\s*\?/.test(merged) &&
       !/\b(?:const|let)\s+traditional\s*=/.test(merged)){
      const at=merged.indexOf('  const traditionalStyle =');
      assert(at>=0,'Cannot place traditional variable in FixedSectionHeader');
      merged=merged.slice(0,at)+
        "  const traditional = language === 'csl_traditional';\n"+merged.slice(at);
    }
    assert(merged.includes('traditionalUiTextStyle'),'Header typography missing');
    assert(merged.includes('lastTitleLineWidth'),'Responsive title flow lost');
  }
  if(rel==='src/screens/MenuScreen.js'){
    // The same helper can be imported both in local changes and upstream.
    // Remove only duplicate identical imports; preserve the first occurrence.
    const typographyImport="import {traditionalUiTextStyle} from '../services/traditionalUiTypography';";
    let typographySeen=false, typographyCount=0;
    merged=merged.split('\n').filter(line=>{
      if(line.trim()!==typographyImport)return true;
      typographyCount++;
      if(typographySeen)return false;
      typographySeen=true;
      return true;
    }).join('\n');
    assert(typographyCount>0,'MenuScreen typography import missing');
    merged=merged.replace(/const cardHeight = \(traditional \? 116 : 80\) \* uiScale;/,
      'const cardHeight = (traditional ? 98 : 80) * uiScale;');
    if(!merged.includes('const [heroActionsBottom, setHeroActionsBottom] = useState(0);')){
      const anchor='  const [dailyQuote, setDailyQuote] = useState(() => getDailyQuote());';
      assert(merged.includes(anchor),'Cannot insert measured hero state safely');
      merged=merged.replace(anchor,anchor+
        '\n  const [heroActionsBottom, setHeroActionsBottom] = useState(0);');
    }
    if(!merged.includes('setHeroActionsBottom(current =>')){
      const tag=/<View\s+style=\{(?:styles\.heroTopActions|\[styles\.heroTopActions,[^\n]+\])\}\s*>/;
      assert(tag.test(merged),'Cannot find hero actions for layout measurement');
      merged=merged.replace(tag,
        '<View\n'+
        '  style={[styles.heroTopActions, {top: Math.max(34, insets.top + 8)}]}\n'+
        '  onLayout={event => {\n'+
        '    const bottom = event.nativeEvent.layout.y + event.nativeEvent.layout.height;\n'+
        '    setHeroActionsBottom(current => Math.abs(current - bottom) > 1 ? bottom : current);\n'+
        '  }}\n'+
        '>');
    }
    if(!merged.includes('heroActionsBottom + 38')){
      const tag=/<View style=\{\[styles\.heroQuoteContent, \{top: [^\n]+\}\]\}>/;
      assert(tag.test(merged),'Cannot find quote placement without discarding local changes');
      merged=merged.replace(tag,
        '<View style={[styles.heroQuoteContent, {top: Math.max(heroActionsBottom + 38, insets.top + 95)}]}>');
    }
    assert(merged.includes('traditionalTitleStyle'),'MenuScreen title typography missing');
    assert(merged.includes('setHeroActionsBottom(current =>'),'Quote header measured layout missing');
    assert(merged.includes('heroActionsBottom + 38'),'Measured hero gradient missing');
    assert(merged.includes('insets.top + 95'),'Safe hero quote offset missing');
  }
  if(rel==='src/screens/NotificationsScreen.js'){
    merged=merged.replace(/\binitialDraft\(\)/g,'initialDraft(t)');
    assert(merged.includes('const openCreate'),'NotificationsScreen create missing');
    assert(merged.includes('setTimePickerOpen(false)'),'Time picker reset lost');
    assert(merged.includes('notifications.title'),'Notifications translations missing');
    assert(merged.includes('const initialDraft = t =>'),'Localized reminders missing');
  }
  if(rel==='src/screens/PrayerBooksScreen.js'){
    merged=merged.replace(
      /accessibilityLabel=\{'Поделиться молитвословом ' \+ \(item\.title \|\| ''\)\}/g,
      "accessibilityLabel={t('contextActions.share') + ' ' + (item.title || '')}");
    assert(merged.includes('actionsColumn') && merged.includes('shareBook(item)'),
      'Local prayerbook share buttons lost');
    assert(merged.includes('cslFont'),'PrayerBooks typography missing');
    assert(merged.includes('titleTextStyle={cslFont}'),'PrayerBooks header style missing');
    assert(merged.includes("t('contextActions.share')"),'PrayerBooks share label untranslated');
  }
  if(rel==='src/components/share/ContentContextMenu.js'){
    assert(merged.includes('deleteLabel'),'Context-specific delete label lost');
    assert(merged.includes('contextActions.cancel'),'Context menu localization missing');
  }
  return merged;
}

try {
  for(const rel of paths) {
    try {
      const file=path.join(app,rel);
      if(!fs.existsSync(file))throw Error('Source file missing.');
      const raw=fs.readFileSync(file,'utf8');
      const local=raw.replace(/\r\n/g,'\n');
      const base=git(rel==='src/services/traditionalUiTypography.js'
        ? '952e8b736868073ac0bc99e0b516d05fc3466fbb' : baseRef,rel);
      const target=git(targetRef,rel);
      const merged=repair(mergeThreeWay(local,base,target,rel),rel);
      parse(merged,{sourceType:'module',plugins:['jsx']});
      const result=raw.includes('\r\n')?merged.replace(/\n/g,'\r\n'):merged;
      if(result!==raw)jobs.push({file,rel,result});
    } catch(err) {
      conflicts.push({rel,message:String(err?.message||err)});
    }
  }
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
if(conflicts.length){
  console.error('CONFLICTS: '+conflicts.length+' source file(s). NO FILES MODIFIED.');
  for(const {rel,message} of conflicts)console.error('\n'+rel+'\n'+message);
  process.exit(1);
}
console.log('PASS: 18 interface files merged and parsed (including known local conflicts).');
for(const item of resolved)console.log('RESOLVED:',item);
for(const item of preservedLocal)console.log('LOCAL BLOCK PRESERVED:',item);
console.log('TO UPDATE:',jobs.map(x=>x.rel).join(', ')||'none');
if(dry){console.log('DRY RUN. NO FILES MODIFIED.');process.exit(0);}
if(!jobs.length){console.log('ALREADY APPLIED. NO FILES MODIFIED.');process.exit(0);}
const backup=path.join(root,'build-backups',
  'ui-completion-'+new Date().toISOString().replace(/[:.]/g,'-'));
for(const job of jobs){
  const dest=path.join(backup,job.rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(job.file,dest);
}
try{
  for(const job of jobs)fs.writeFileSync(job.file,job.result,'utf8');
  execFileSync(process.execPath,[path.join(__dirname,'test_ui_completion_20261121.cjs')],
    {cwd:app,stdio:'inherit',windowsHide:true});
  execFileSync('git',['diff','--check','--',...jobs.map(x=>'molitvoslov-app/'+x.rel)],
    {cwd:root,stdio:'inherit',windowsHide:true});
}catch(error){
  for(const job of jobs)fs.copyFileSync(path.join(backup,job.rel),job.file);
  console.error('POST-APPLY TEST FAILED. Changed source files restored. BACKUP:',backup);
  process.exit(1);
}
for(const job of jobs)console.log('UPDATED:',job.rel);
console.log('SUCCESS. BACKUP:',backup);
