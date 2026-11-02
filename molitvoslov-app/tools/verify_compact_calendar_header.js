#!/usr/bin/env node
// Verify compact calendar/saint reader headers and that text-selection still works.
const fs=require('fs'),path=require('path');
const parser=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const files=[
 'src/screens/ChurchCalendarScreen.js',
 'src/screens/SaintDetailScreen.js',
 'src/components/reader/CalendarSelectionWebText.js',
 'src/components/reader/CalendarSaveText.js',
 'src/context/TextSelectionContext.js',
];
let errors=0;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
for(const file of files){
 try{
   const ast=parser.parse(read(file),{sourceType:'unambiguous',plugins:['jsx']});
   for(const item of ast.program.body){
     if(item.type!=='ImportDeclaration'||!item.source.value.startsWith('.'))continue;
     const candidate=path.resolve(path.dirname(path.join(root,file)),item.source.value);
     if(!['.js','.jsx','/index.js',''].some(s=>fs.existsSync(candidate+s)))throw Error('Missing import '+item.source.value);
   }
   console.log('PASS',file);
 }catch(e){errors++;console.error('FAIL',file,e.message);}
}
const calendar=read(files[0]),saint=read(files[1]),web=read(files[2]);
function invariant(name,ok){if(!ok){errors++;console.error('FAIL',name);}else console.log('PASS',name);}
// Inspect the actual JSX hierarchy rather than relying on whitespace/formatting.
// The header heart and the header toggle must be direct children of the same View.
// This also guarantees that tapping the heart does not toggle the accordion.
function hasSiblingHeartInHeader(source, rowStyle) {
  const tree=parser.parse(source,{sourceType:'unambiguous',plugins:['jsx']});
  let found=0, valid=0;
  const elementName=node=>{
    if(!node || node.type!=='JSXElement') return null;
    const n=node.openingElement.name;
    return n.type==='JSXIdentifier' ? n.name : null;
  };
  const styledAs=(opening,styleName)=>{
    const attr=opening.attributes.find(a=>a.type==='JSXAttribute' && a.name.name==='style');
    const x=attr?.value?.expression;
    return x?.type==='MemberExpression' && x.object?.name==='styles' &&
      x.property?.name===styleName && !x.computed;
  };
  const visit=node=>{
    if(!node || typeof node!=='object') return;
    if(node.type==='JSXElement' && elementName(node)==='View' &&
       styledAs(node.openingElement,rowStyle)){
      found++;
      const children=node.children.filter(ch=>ch.type==='JSXElement');
      const toggle=children.filter(ch=>elementName(ch)==='Pressable');
      const hearts=children.filter(ch=>elementName(ch)==='CalendarSaveWholeButton');
      if(toggle.length===1 && hearts.length===1) valid++;
    }
    for(const [key,value] of Object.entries(node)){
      if(['loc','start','end','comments','tokens','extra'].includes(key)) continue;
      if(Array.isArray(value)){
        for(const child of value) if(child && typeof child==='object') visit(child);
      }else if(value && typeof value==='object') visit(value);
    }
  };
  visit(tree.program);
  return {ok:found===1 && valid===1,rows:found,valid};
}
const calendarHeart=hasSiblingHeartInHeader(calendar,'textBlockHeaderRow');
const saintHeart=hasSiblingHeartInHeader(saint,'accordionHeaderRow');
invariant('Calendar: heart is sibling of header toggle (rows='+calendarHeart.rows+')',
  calendarHeart.ok && !calendar.includes('style={styles.textBlockSaveRow}'));
invariant('Saint: heart is sibling of header toggle (rows='+saintHeart.rows+')',
  saintHeart.ok && !saint.includes('style={styles.saintSaveRow}'));
invariant('No saved-area highlighting',!calendar.includes('wholeSaved')&&!saint.includes('wholeSaved'));
invariant('Calendar: outer padding reduced',calendar.includes('paddingHorizontal: 6,')&&calendar.includes('marginHorizontal: 2, marginTop: 2'));
invariant('Saint: outer padding reduced',saint.includes('readingContent: {paddingHorizontal: 4, paddingTop: 0')&&saint.includes('lifeInset: {marginHorizontal: 2, marginTop: 4'));
invariant('Calendar: fade hidden at top',calendar.includes('lifeOverflows && lifeScrolled && <LinearGradient')&&
 calendar.includes('onScroll={({nativeEvent}) => setLifeScrolled(nativeEvent.contentOffset.y > 3)}'));
invariant('WebView: compact inner padding',web.includes('const topInset = isLife ? 12 : 10;')&&web.includes('const sideInset = 8;'));
invariant('Text selection preserved',web.includes('setPointerCapture')&&
 web.includes('onSelectionLockChange')&&web.includes('selection-lens')&&
 read(files[3]).includes('CalendarSelectionWebText'));
const marker='const selectionScript = String.raw'+String.fromCharCode(96);
const start=web.indexOf(marker),end=start<0?-1:web.indexOf(String.fromCharCode(96)+';',start+marker.length);
if(start<0||end<0){errors++;console.error('FAIL embedded selection JS missing');}
else{
 try{new Function(web.slice(start+marker.length,end));console.log('PASS embedded selection JS');}
 catch(e){errors++;console.error('FAIL embedded selection JS',e.message);}
}
if(errors){console.error('COMPACT CALENDAR HEADER VERIFICATION FAILED:',errors);process.exit(1);}
console.log('COMPACT CALENDAR HEARTS AND TEXT INSETS VERIFIED');
