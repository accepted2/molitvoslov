#!/usr/bin/env node
'use strict';
// Restore the brown in-app menu and compact layout. Android OS bar stays separate.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const root=path.resolve(app,'..');
const dry=process.argv.includes('--dry-run');
const files=[
  'src/components/navigation/BottomNav.js',
  'src/screens/MenuScreen.js',
  'src/components/navigation/FixedSectionHeader.js',
];
const assert=(value,message)=>{if(!value)throw Error(message)};
function exactlyOne(s,regex,replacement,label){
  const count=[...s.matchAll(regex)].length;
  assert(count===1,label+': expected one match, found '+count);
  return s.replace(regex,replacement);
}
function styleProperty(s,styleName,property,value){
  const block=new RegExp('(^  '+styleName+': \\{\\n)([\\s\\S]*?)(^  \\},)','m');
  const m=s.match(block);
  assert(m,'Missing BottomNav style '+styleName);
  const prop=new RegExp('(^    '+property+': )[^\\n]+','m');
  assert(prop.test(m[2]),'Missing '+styleName+'.'+property);
  return s.replace(block,m[1]+m[2].replace(prop,(_line,prefix)=>prefix+value+',')+m[3]);
}
function patchNav(s){
  s=exactlyOne(s,/^  const color = active \? '[^']+' : '[^']+';$/gm,
    "  const color = active ? '#2C170B' : '#F5DCB5';",'NavIcon colors');
  s=exactlyOne(s,/^  const rowHeight = Math\.round\([^\n;]+\);$/gm,
    '  const rowHeight = Math.round(46 + (uiScale - 1) * 56);','Nav row height');
  s=exactlyOne(s,/colors=\{\['rgba\([^\n]+?\]\}/g,
    "colors={['rgba(61, 36, 22, 0.98)', 'rgba(90, 52, 29, 0.98)']}",
    'Nav gradient');
  s=styleProperty(s,'container','borderColor',"'rgba(246, 216, 162, 0.16)'");
  s=styleProperty(s,'itemActive','backgroundColor',"'rgb(244, 220, 168)'");
  s=styleProperty(s,'label','color',"'#F5DCB5'");
  s=styleProperty(s,'labelActive','color',"'#2C170B'");
  assert(s.includes("t('navCompact.'+item.key)"),'CSL menu translation missing');
  return s;
}
function patchHome(s){
  // A recent merge could duplicate an already existing import.
  const imp="import {traditionalUiTextStyle} from '../services/traditionalUiTypography';";
  let seen=false;
  s=s.split('\n').filter(line=>{
    if(line.trim()!==imp)return true;
    if(seen)return false;
    seen=true;return true;
  }).join('\n');
  s=s.replace(/const cardHeight = \(traditional \? (?:98|116) : 80\) \* uiScale;/g,
    'const cardHeight = 80 * uiScale;');
  s=s.replace(/const categoryHeight=\(calendarLanguage === 'csl_traditional' \? (?:98|116) : 80\)\*uiScale;/g,
    'const categoryHeight=80*uiScale;');
  s=s.replace(/^\s*minHeight:\s*Math\.max\(410,\s*insets\.top\s*\+\s*420\),\s*\n/gm,'\n');
  s=s.replace(/style=\{\[styles\.heroTopActions,\s*\{top:\s*Math\.max\(34,\s*insets\.top\s*\+\s*8\)\}\]\}/g,
    'style={styles.heroTopActions}');
  const measurement=[
    '                onLayout={event => {',
    '                  const bottom = event.nativeEvent.layout.y + event.nativeEvent.layout.height;',
    '                  setHeroActionsBottom(current => Math.abs(current - bottom) > 1 ? bottom : current);',
    '                }}',
    ''
  ].join('\n');
  if(s.includes(measurement))s=s.replace(measurement,'');
  s=exactlyOne(s,/<View style=\{\[styles\.heroQuoteContent,\s*\{top:\s*[^\n}]+\}\]\}>/g,
    '<View style={[styles.heroQuoteContent, {top: Math.max(insets.top + 49.5, 77.5)}]}>',
    'Home quote top');
  if(!s.includes('heroActionsBottom +') && !s.includes('setHeroActionsBottom(')){
    s=s.replace(/^  const \[heroActionsBottom, setHeroActionsBottom\] = useState\(0\);\s*\n/m,'');
  }
  assert(/const (?:categoryHeight=80\*uiScale|categoryStride=80\*uiScale\+8)/.test(s),
    'Compact catalog spacing missing');
  assert(!/minHeight:\s*Math\.max\(410,\s*insets\.top\s*\+\s*420\)/.test(s),
    'Extra-tall home hero still present');
  assert(!s.includes('heroActionsBottom + 38'),'Extra 38px quote gap still present');
  return s;
}
function patchHeader(s){
  // Preserve responsive title wrapping; remove only extra CSL header height.
  return s.split(' + (traditional ? Math.ceil(10 * uiScale) : 0)').join('');
}
const patchers=[patchNav,patchHome,patchHeader];
const changes=[],errors=[];
for(let i=0;i<files.length;i++){
  const rel=files[i],full=path.join(app,rel);
  try{
    assert(fs.existsSync(full),'File missing: '+rel);
    const original=fs.readFileSync(full,'utf8');
    const normalized=original.replace(/\r\n/g,'\n');
    const patched=patchers[i](normalized);
    parse(patched,{sourceType:'module',plugins:['jsx']});
    assert(patchers[i](patched)===patched,'Patch not idempotent: '+rel);
    const result=original.includes('\r\n')?patched.replace(/\n/g,'\r\n'):patched;
    if(result!==original)changes.push({rel,full,original,result});
  }catch(error){errors.push(rel+': '+error.message)}
}
if(errors.length){
  for(const error of errors)console.error('STOP:',error);
  console.error('NO SOURCE FILES MODIFIED.');
  process.exit(1);
}
const backdrop=path.join(app,'src/components/navigation/SystemNavigationBackdrop.js');
if(fs.existsSync(backdrop)){
  const text=fs.readFileSync(backdrop,'utf8');
  console.log(text.includes("backgroundColor: '#4D3020'")
    ? 'ANDROID SYSTEM NAV: #4D3020, untouched'
    : 'ANDROID SYSTEM NAV: custom configuration, untouched');
}
console.log('PASS: original dark BottomNav, compact catalog and header prepared.');
console.log('TO UPDATE:',changes.map(x=>x.rel).join(', ')||'none');
if(dry){console.log('DRY RUN: NO SOURCE FILES MODIFIED.');process.exit(0)}
if(!changes.length){console.log('ALREADY APPLIED.');process.exit(0)}
const backup=path.join(root,'build-backups',
  'restore-compact-ui-'+new Date().toISOString().replace(/[:.]/g,'-'));
for(const c of changes){
  const destination=path.join(backup,c.rel);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,c.original,'utf8');
}
try{
  for(const c of changes)fs.writeFileSync(c.full,c.result,'utf8');
  for(const rel of files){
    parse(fs.readFileSync(path.join(app,rel),'utf8'),{sourceType:'module',plugins:['jsx']});
  }
}catch(error){
  for(const c of changes)fs.writeFileSync(c.full,c.original,'utf8');
  console.error('FAILED; ORIGINALS RESTORED:',error.message);
  process.exit(1);
}
for(const c of changes)console.log('UPDATED:',c.rel);
console.log('SUCCESS. BACKUP:',backup);
