#!/usr/bin/env node
/* Check JSX, imports, both draggable handles, save callbacks, and saved UI. */
const fs=require('fs');
const path=require('path');
const parser=require('@babel/parser');
const root=path.resolve(__dirname,'..');
let failures=0;
const files=[
 'src/components/reader/CalendarSaveText.js',
 'src/components/reader/CalendarSelectionWebText.js',
 'src/components/reader/SelectableSaveText.js',
 'src/screens/ChurchCalendarScreen.js',
 'src/screens/SaintDetailScreen.js',
 'src/context/TextSelectionContext.js',
 'src/services/savedItems.js'
];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const name of files){
  try{
    const filename=path.join(root,name);
    const program=parser.parse(read(name),{sourceType:'unambiguous',plugins:['jsx']});
    for(const entry of program.program.body){
      if(entry.type!=='ImportDeclaration'||!entry.source.value.startsWith('.'))continue;
      const target=path.resolve(path.dirname(filename),entry.source.value);
      if(!['.js','.jsx','/index.js',''].some(ext=>fs.existsSync(target+ext))){
        throw new Error('Missing relative import '+entry.source.value);
      }
    }
    console.log('PASS',name);
  }catch(error){failures++;console.error('FAIL',name,error.message);}
}
const checks={
  'src/components/reader/CalendarSaveText.js':[
    "import CalendarSelectionWebText from './CalendarSelectionWebText'",
    '<CalendarSelectionWebText',
    'fullSaveType={null}',
    "name={saved ? 'heart' : 'heart-o'}",
  ],
  'src/components/reader/CalendarSelectionWebText.js':[
    'id="left" class="handle"', 'id="right" class="handle"',
    'setPointerCapture', "type:'selection'", "type:'clear'",
    'activateSelection({','onSave:save','onClear:clearWeb',
    'save_type:classifySelection','start_offset:range.start',
    'end_offset:range.end','scrollEnabled={false}','source={pageSource}',
  ],
  'src/screens/ChurchCalendarScreen.js':[
    '// calendar selection handles: heart only',
    '<CalendarSaveWholeButton text={text} saveContext={saveContext} />',
    'CalendarSelectableBody',
  ],
  'src/screens/SaintDetailScreen.js':[
    '// saint selection handles: heart only',
    '<CalendarSaveWholeButton text={text} saveContext={saveContext} />',
    'CalendarSelectableBody',
  ],
  'src/components/reader/SelectableSaveText.js':[
    'export const classifySelection = ',
  ],
  'src/context/TextSelectionContext.js':[
    'onPress={saveSelection}','current.onSave()',
  ],
};
for(const [file,needles] of Object.entries(checks)){
  const source=read(file);
  for(const needle of needles)if(!source.includes(needle)){
    failures++;console.error('FAIL invariant',file,needle);
  }
}
for(const file of ['src/screens/ChurchCalendarScreen.js','src/screens/SaintDetailScreen.js']){
  const source=read(file);
  if(source.includes('wholeSaved')||source.includes('onSavedChange={setWholeSaved}')){
    failures++;console.error('FAIL full-section highlighting remains',file);
  }
}
// The JSX parser cannot see JavaScript syntax errors inside the HTML string.
const web=read('src/components/reader/CalendarSelectionWebText.js');
const tick=String.fromCharCode(96);
const start=web.indexOf('const selectionScript = String.raw'+tick);
const end=start<0?-1:web.indexOf(tick+';',start+34);
if(start<0||end<0){failures++;console.error('FAIL missing embedded WebView runtime');}
else{
  const embedded=web.slice(start+('const selectionScript = String.raw'+tick).length,end);
  try{new Function(embedded);console.log('PASS WebView gesture JavaScript');}
  catch(error){failures++;console.error('FAIL WebView gesture JavaScript',error.message);}
}
if(failures){console.error('CALENDAR SELECTION HANDLE VERIFICATION FAILED:',failures);process.exit(1);}
console.log('CALENDAR HEART-ONLY SAVE AND TWO-HANDLE SELECTION VERIFIED');
