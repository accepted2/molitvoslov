#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const offline=JSON.parse(read('src/data/offlineContent.json'));
const threeCombinedCanons=JSON.parse(read('src/data/threeCombinedCanons.json'));

const resolverText=read('src/services/sharedReaderRoute.js')
  .replace(/^import .+;\s*$/gm,'').replace(/\bexport const /g,'const ');
const resolveRoute=new Function('getCurrentContent','threeCombinedCanons',
  resolverText+'\nreturn resolveSharedReaderRoute;')(()=>offline,threeCombinedCanons);
const shareSource=read('src/services/contentSharing.js')
  .replace(/^import .*;\s*$/gm,'').replace(/\bexport const /g,'const ');
const sharing=new Function('Alert','Share','shareImportableContent',
  shareSource+'\nreturn {sharePathFor,publicShareUrl};')({alert(){}},{share:async()=>{}},async()=>true);
const appLinkSource=read('src/services/appLinks.js').replace(/\bexport const /g,'const ');
const normalizeIncomingAppLink=new Function(appLinkSource+'\nreturn normalizeIncomingAppLink;')();

for(const [kind,route,plural,idKey] of [
  ['akathist','Akathist','akathists','akathistId'],
  ['canon','Canon','canons','canonId']
]){
  const list=offline[plural]?.list||[];
  const entries=list.filter(item=>item && item.slug &&
    item.id!=null && (kind!=='akathist'||item.is_visible===true));
  assert.ok(entries.length,'No published '+plural+' in offlineContent.json');
  for(const item of entries.slice(0,8)){
    const canonical=resolveRoute(kind,{id:item.id,slug:item.slug},offline);
    const legacy=resolveRoute(kind,{id:String(item.id)},offline);
    const viaSlug=resolveRoute(kind,{id:item.slug},offline);
    for(const resolved of [canonical,legacy,viaSlug]){
      assert.equal(String(resolved.id),String(item.id),kind+' '+item.slug+' wrong id');
      assert.equal(resolved.slug,item.slug,kind+' '+item.slug+' wrong slug');
      assert.equal(!!offline[plural].by_slug[resolved.slug],true,
        'Offline API cannot load resolved slug');
    }
    const linkParams={[idKey]:item.id,slug:item.slug};
    const sharePath=sharing.sharePathFor(route,linkParams);
    assert.equal(sharePath,kind+'/'+encodeURIComponent(item.slug));
    const url=sharing.publicShareUrl(route,linkParams);
    assert.equal(normalizeIncomingAppLink(url),
      'molitvoslov://'+kind+'/'+encodeURIComponent(item.slug));
    assert.equal(sharing.sharePathFor(route,{[idKey]:item.id}),
      kind+'/'+encodeURIComponent(String(item.id)), 'Legacy numeric fallback');
  }
  const screen=read('src/screens/'+route+'Screen.js');
  assert.match(screen,/resolveSharedReaderRoute\(/);
  assert.match(screen,/const response = await api\.get\(/);
  assert.doesNotMatch(screen,/Promise\.all\(\[\s*api\.get\(/);
  assert.match(screen,/catch \(savedError\)/);
}
assert.equal(resolveRoute('canon',{id:String(threeCombinedCanons.id)},offline).slug,
  threeCombinedCanons.slug,'Legacy numeric link to independently bundled Three Canons');
assert.equal(resolveRoute('canon',{id:threeCombinedCanons.slug},offline).id,
  threeCombinedCanons.id,'Stable slug link to independently bundled Three Canons');
assert.deepEqual(resolveRoute('akathist',{id:'not-a-real-id'},offline),
  {id:null,slug:'not-a-real-id',title:null,found:false});
for(const [screen,params,expected] of [
  ['PrayerRule',{slug:'morning'},'prayer/morning'],
  ['HoursReading',{entryId:'ordinary-1'},'hours/ordinary-1'],
  ['BibleBook',{bookId:1},'bible-book/1/rst'],
  ['BibleChapter',{bookId:1,chapterNumber:1},'bible/1/1/rst'],
  ['Kathisma',{kathismaNumber:4},'kathisma/4'],
  ['Psalter',{},'psalter']
]){
  const uri=sharing.publicShareUrl(screen,params);
  assert.equal(normalizeIncomingAppLink(uri),
    'molitvoslov://'+expected,screen+' public share roundtrip');
}
console.log('PASS: real offline Akathist/Canon IDs + slugs and old numeric share links reopen exact documents');
console.log('PASS: PrayerRule, Hours, Bible, Kathisma and Psalter public share links normalize correctly');
console.log('PASS: favorites errors cannot block public Akathist or Canon document loading');
