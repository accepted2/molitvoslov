#!/usr/bin/env node
// Static and syntax checks for user-local category search and prayer-book multi-add.
// Run only after both guarded local Python patches have succeeded.
const fs=require('fs'),path=require('path');
const parser=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const paths=[
  'src/components/search/LocalSearchField.js',
  'src/screens/TextsListScreen.js',
  'src/screens/AkathistListScreen.js',
  'src/screens/CanonListScreen.js',
  'src/screens/MiscPrayersScreen.js',
  'src/screens/FavoritesScreen.js',
  'src/screens/PrayerBookScreen.js',
  'src/services/prayerSearch.js',
];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let errors=0;
for(const file of paths){
  try{
    const parsed=parser.parse(read(file),{sourceType:'unambiguous',plugins:['jsx']});
    for(const node of parsed.program.body){
      if(node.type!=='ImportDeclaration'||!node.source.value.startsWith('.'))continue;
      const candidate=path.resolve(path.dirname(path.join(root,file)),node.source.value);
      if(!['.js','.jsx','/index.js',''].some(ext=>fs.existsSync(candidate+ext)))throw Error('Missing import '+node.source.value);
    }
    console.log('PASS',file);
  }catch(error){
    errors++;
    console.error('FAIL',file,error.message);
  }
}
const expectations={
  'src/components/search/LocalSearchField.js':[
    'matchesLocalQuery','filterByTitle','filterSavedOnly','normalizeSearchText',
    'words.every','item.text',
  ],
  'src/screens/TextsListScreen.js':[
    'data={visibleTexts}', 'filterByTitle(', 'getLocalizedTextTitle',
    '<LocalSearchField', 'Поиск по названию',
  ],
  'src/screens/AkathistListScreen.js':[
    'data={visibleRows}', 'filterByTitle(', 'ListHeaderComponent',
    '<LocalSearchField',
  ],
  'src/screens/CanonListScreen.js':[
    'data={visibleRows}', 'filterByTitle(', 'ListHeaderComponent',
    '<LocalSearchField',
  ],
  'src/screens/MiscPrayersScreen.js':[
    'data={visibleItems}', 'matchesLocalQuery(', 'ListHeaderComponent',
    '<LocalSearchField',
  ],
  'src/screens/FavoritesScreen.js':[
    'filterSavedOnly(items, query)', 'data={visibleItems}',
    'Поиск в избранном', "item.save_type === 'bookmark'",
  ],
  'src/screens/PrayerBookScreen.js':[
    'searchAllPrayers(personalPrayers, searchQuery)',
    'existingResultKeys', 'setAddedKeys', 'pendingKey',
    'return true;', 'return false;', 'search_key: result.key',
    "onPress={() => onAdd(item)}", "'✓'",
  ],
};
for(const [file,needles] of Object.entries(expectations)){
  const src=read(file);
  for(const token of needles){
    if(!src.includes(token)){errors++;console.error('FAIL missing invariant',file,token);}
  }
}
const picker=read('src/screens/PrayerBookScreen.js');
if(picker.includes('setGlobalSearch(false);\n      await load();')){
  errors++;
  console.error('FAIL picker still closes automatically on add');
}
if(picker.includes("return searchAllPrayers(personalPrayers, searchQuery).filter(")){
  errors++;
  console.error('FAIL added personal prayers still hidden instead of displaying a checkmark');
}
if(errors){console.error('LOCAL LIBRARY SEARCH VERIFICATION FAILED:',errors);process.exit(1);}
console.log('LOCAL TITLE SEARCH, FAVORITES FILTER AND MULTI-ADD PICKER VERIFIED');
