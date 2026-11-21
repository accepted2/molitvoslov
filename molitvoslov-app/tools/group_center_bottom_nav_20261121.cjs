#!/usr/bin/env node
'use strict';
// Restore symmetric Home/Account and equally spaced center trio.
// Preserves unrelated local color, size, text, navigation and icon changes.
const fs=require('node:fs'),path=require('node:path'),{parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const file=path.join(app,'src/components/navigation/BottomNav.js');
const dry=process.argv.includes('--dry-run');
const check=(x,msg)=>{if(!x)throw Error(msg)};
const count=(s,x)=>s.split(x).length-1;
const mapStart='          {ITEMS.map((item) => {';
const mapEnd='          })}';
const group=[
'          {renderTab(ITEMS[0], styles.outerTab)}',
'          <View style={styles.centralTabs}>',
'            {ITEMS.slice(1, 4).map(item => renderTab(item, styles.centralTab))}',
'          </View>',
'          {renderTab(ITEMS[4], styles.outerTab)}'
].join('\n');
const newStyles=[
'  // Two mirror-image outer tabs and one equally spaced central trio.',
'  outerTab: {',
"    width: '23%',",
'    flexGrow: 0,',
'    flexShrink: 0,',
'  },',
'  centralTabs: {',
"    width: '54%',",
"    flexDirection: 'row',",
"    alignItems: 'center',",
"    justifyContent: 'center',",
'  },',
'  centralTab: {',
'    flex: 1,',
'    minWidth: 0,',
'  },',
''
].join('\n');
const oldLayout=[
'    // Five fixed-width columns: visual centers stay equally spaced even',
'    // when the active tab has a border or labels have different lengths.',
"    width: '20%',",
'    flexGrow: 0,',
'    flexShrink: 0,',
''
].join('\n');
function verify(s){
 check(count(s,group)===1,'Central trio not found exactly once');
 check(count(s,'  outerTab: {')===1,'Outer column styles missing');
 check(count(s,'  centralTabs: {')===1,'Central group style missing');
 check(count(s,'  centralTab: {')===1,'Center tab style missing');
 check(count(s,'const renderTab = (item, columnStyle) => {')===1,'Tab renderer missing');
 check(count(s,mapStart)===0,'Old five-column layout remains');
 check(count(s,'{key: ')===5,'Unexpected number of tabs');
 check(s.includes('onPress={() => openRootTab(item.route)}'),'Navigation handler missing');
 check(s.includes('isActive && styles.itemActive'),'Active highlight missing');
}
function patch(s){
 if(s.includes('const renderTab = (item, columnStyle) => {')){
   verify(s);return s;
 }
 check(count(s,mapStart)===1,'Old five-button mapping not found');
 const begin=s.indexOf(mapStart),end=s.indexOf(mapEnd,begin);
 check(end>begin,'Could not isolate original five-tab mapping');
 const block=s.slice(begin,end+mapEnd.length);
 const buttonStart=block.indexOf('              <Pressable');
 const buttonEnd=block.lastIndexOf('              </Pressable>');
 check(buttonStart>=0&&buttonEnd>buttonStart,'Original tab control not found');
 const button=block.slice(buttonStart,buttonEnd+'              </Pressable>'.length);
 const style='                  styles.item,\n';
 check(count(button,style)===1,'Tab button style structure changed');
 const renderer=[
 '  // Home and Account remain symmetric around the three middle tabs.',
 '  const renderTab = (item, columnStyle) => {',
 '    const isActive = item.key === active;',
 '    return (',
 button.replace(style,style+'                  columnStyle,\n'),
 '    );',
 '  };',
 '',
 ].join('\n')+'\n';
 let next=s.slice(0,begin)+group+s.slice(end+mapEnd.length);
 const ret='  return (\n    <Animated.View';
 check(count(next,ret)===1,'Main navigation return block not found');
 next=next.replace(ret,renderer+ret);
 check(count(next,'  item: {')===1,'Base tab item style missing');
 next=next.replace('  item: {',newStyles+'  item: {');
 if(next.includes(oldLayout))next=next.replace(oldLayout,'');
 else {
   const fallback='  item: {\n    flex: 1,\n    minWidth: 0,';
   check(count(next,fallback)===1,'Local BottomNav width differs; refusing overwrite');
   next=next.replace(fallback,'  item: {\n    minWidth: 0,');
 }
 verify(next);
 return next;
}
let original,updated;
try{
 original=fs.readFileSync(file,'utf8');
 const after=patch(original.replace(/\r\n/g,'\n'));
 parse(after,{sourceType:'module',plugins:['jsx']});
 check(patch(after)===after,'Second application would change layout');
 updated=original.includes('\r\n')?after.replace(/\n/g,'\r\n'):after;
}catch(e){
 console.error('STOP:',e.message);
 console.error('NO SOURCE FILES MODIFIED.');
 process.exit(1);
}
console.log('PASS: center trio has identical 18% spacing.');
console.log('PASS: outer gaps Home/Favorites and Memorial/Account are identical.');
console.log('TO UPDATE:',updated===original?'none':'BottomNav.js');
if(dry){console.log('DRY RUN. NO SOURCE FILES MODIFIED.');process.exit(0)}
if(updated===original){console.log('ALREADY APPLIED.');process.exit(0)}
const backup=path.join(app,'..','build-backups','bottom-nav-three-center-'+
 new Date().toISOString().replace(/[:.]/g,'-'),'src/components/navigation/BottomNav.js');
try{
 fs.mkdirSync(path.dirname(backup),{recursive:true});
 fs.writeFileSync(backup,original,'utf8');
 fs.writeFileSync(file,updated,'utf8');
 const final=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
 parse(final,{sourceType:'module',plugins:['jsx']});
 verify(final);
}catch(e){
 fs.writeFileSync(file,original,'utf8');
 console.error('FAILED; ORIGINAL RESTORED:',e.message);process.exit(1);
}
console.log('UPDATED: src/components/navigation/BottomNav.js');
console.log('SUCCESS. BACKUP:',backup);
