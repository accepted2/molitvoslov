#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const backend=file=>fs.readFileSync(path.join(__dirname,'..','..','molitvoslov-backend','api',file),'utf8');

async function main(){
  const sharing=app('src/services/contentSharing.js');
  const api=new Function('Alert','Share','shareImportableContent',
    sharing.replace(/^import[^\n]+\n/gm,'').replace(/\bexport const /g,'const ')+
    '\nreturn {sharePathFor,publicShareUrl};'
  )({alert:()=>{}},{share:async()=>{}},async()=>true);
  assert.equal(api.sharePathFor('BibleBook',{
    bookId:4,translationCode:'csl_traditional'}),'bible-book/4/csl_traditional');
  assert.equal(api.sharePathFor('BibleChapter',{
    bookId:4,chapterNumber:2,translationCode:'csl_traditional'}),
    'bible/4/2/csl_traditional');
  assert.equal(api.sharePathFor('BibleChapter',{bookId:4,chapterNumber:2}),
    'bible/4/2/rst');
  assert.equal(api.sharePathFor('BibleChapter',{bookId:4,chapterNumber:0}),null);
  assert.match(api.publicShareUrl('BibleBook',{bookId:4}),/api\/share\//);

  const books=app('src/screens/BibleBooksScreen.js');
  const chapters=app('src/screens/BibleBookScreen.js');
  const chapter=app('src/screens/BibleChapterScreen.js');
  assert.match(books,/onLongPress=\{\(\) => setContextBook\(item\)\}/);
  assert.match(books,/ContentContextMenu/);
  assert.match(chapters,/onLongPress=\{\(\) => setContextChapter\(item\)\}/);
  assert.match(chapters,/setBookContextVisible\(true\)/);
  assert.match(chapters,/backgroundColor: '#FFF0CF'/);
  assert.match(chapters,/color: '#4C2818'/);
  assert.match(chapters,/fontSize:24/);
  assert.match(chapter,/bibleContent\.getChapter\(bookId,currentChapterNumber,translationCode\)/);
  assert.doesNotMatch(chapter,/text:documentShareText\(documentData\),\s*screen:'BibleChapter'/);
  assert.match(chapter,/translationCode\},/);

  const saint=app('src/screens/SaintDetailScreen.js');
  const saved=app('src/components/reader/CalendarSaveText.js');
  const menu=app('src/components/share/ContentContextMenu.js');
  assert.match(saint,/menuVariant/);
  assert.match(saint,/onLongPress=\{\(\)=>actionsRef\.current\?\.openMenu\(\)\}/);
  assert.match(saved,/more-vertical/);
  assert.match(menu,/onSave/);
  assert.match(menu,/Сохранить себе/);
  assert.match(saint,/focusSection:section/);

  const privateApi=backend('shared_invitations.py');
  const storage=backend('supabase_storage.py');
  const tests=backend('test_shared_content.py');
  assert.match(privateApi,/def _copy_photo\(/);
  assert.match(privateApi,/download_bytes\(/);
  assert.match(privateApi,/upload_bytes\(/);
  assert.match(privateApi,/MAX_SHARED_PHOTOS = 12/);
  assert.match(privateApi,/photo_count/);
  assert.match(privateApi,/snap\.get\("photos",\[\]\)/);
  assert.match(storage,/def download_bytes\(/);
  assert.match(tests,/test_memorial_preview_and_import_copy_photos_safely/);
  assert.match(tests,/test_personal_book_import_clones_prayers_with_photos/);
  assert.match(tests,/test_photo_failure_rolls_back_memorial_import/);
  assert.match(app('src/screens/SharedImportScreen.js'),/Фотографий:/);

  // Simulate a server that has not deployed /api/shared/create/ yet.
  // The client must still offer a working plain-text share.
  const dialogs=[];
  const shares=[];
  const src=app('src/services/shareInvitations.js')
    .replace(/^import[^\n]+\n/gm,'').replace(/\bexport const /g,'const ');
  const sender=new Function('Alert','Share','API_BASE_URL','authenticatedFetch',
    'getApiToken','syncMemorials','syncPrayerBooks','syncSavedItems',
    'showShareFeedback','hideShareFeedback','setTimeout',
    src+'\nreturn {shareImportableContent};'
  )({alert(){}},{share:async x=>shares.push(x)},'https://api.test',
    async ()=>({ok:false,status:404,json:async()=>({})}),
    async()=>'test-token',async()=>{},async()=>{},async()=>{},
    value=>dialogs.push(value),()=>dialogs.push({hidden:true}),
    fn=>{fn();return 1;});
  const created=await sender.shareImportableContent({
    kind:'quote',title:'Слово',text:'Господи, помилуй!',
  });
  assert.equal(created,false);
  const fallback=dialogs.find(x=>x.confirmLabel==='Отправить текст');
  assert.ok(fallback,'404 must offer native text sharing');
  assert.match(fallback.message,/сервер|ссылка/i);
  await fallback.onConfirm();
  assert.equal(shares.length,1);
  assert.match(shares[0].message,/Господи, помилуй!/);
  console.log('PASS: Bible book/chapter share, CS readability, saints actions, private photos, 404 fallback');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
