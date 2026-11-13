#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const stores=[];
const helper=source('src/services/bibleListFavorites.js')
  .replace(/^import[^\n]*\n/gm,'').replace(/\bexport const /g,'const ');
const actions=new Function('saveItem','formatBibleNumber',helper+
  '\nreturn {findSavedBibleBook,findSavedBibleChapter,bibleChapterText,saveBibleBook,saveBibleChapter};'
)(async payload=>{const saved={...payload,id:stores.length+1,
  metadata:payload.metadata||{}};stores.push(saved);return saved;},
  (code,value)=>String(value));
async function main(){
  const book={id:55,code:'GEN',slug:'genesis',short_name:'Быт',chapters:[]};
  const chapter={id:555,number:3,verses:[
    {number:1,text:'В начале'}, {number:2,text:'И сказал'}]};
  const ru=await actions.saveBibleBook({book,translationCode:'rst',title:'Бытие'});
  const cs=await actions.saveBibleBook({book,translationCode:'csl_traditional',
    title:'Бытіе'});
  assert.equal(ru.text,'');
  assert.equal(ru.anchor_type,'bible_book');
  assert.equal(ru.save_type,'text');
  assert.equal(ru.metadata.translation_code,'rst');
  assert.equal(actions.findSavedBibleBook(stores,book,'rst').id,ru.id);
  assert.equal(actions.findSavedBibleBook(stores,book,'csl_traditional').id,cs.id);
  const savedChapter=await actions.saveBibleChapter({book,chapter,
    translationCode:'csl_traditional',title:'Бытіе'});
  assert.equal(savedChapter.save_type,'chapter');
  assert.equal(savedChapter.anchor_type,'bible_chapter');
  assert.equal(savedChapter.anchor_id,555);
  assert.equal(savedChapter.metadata.translation_code,'csl_traditional');
  assert.equal(savedChapter.metadata.chapter_number,3);
  assert.match(savedChapter.text,/1 В начале/);
  assert.equal(actions.findSavedBibleChapter(stores,book,chapter,
    'csl_traditional').id,savedChapter.id);
  assert.equal(actions.findSavedBibleChapter(stores,book,chapter,'rst'),null);
  assert.equal(actions.findSavedBibleChapter([{
    ...savedChapter,metadata:{...savedChapter.metadata,translation_code:undefined},
  }],book,chapter,'rst')?.anchor_id,555);

  const books=source('src/screens/BibleBooksScreen.js');
  assert.match(books,/onPress=\{\(\) => toggleBookSaved\(item\)\}/);
  assert.match(books,/name="share-social-outline"/);
  assert.match(books,/SaveHeartIcon active=\{saved\}/);
  assert.match(books,/itemActions:\{[^}]*borderLeftWidth:1/s);
  assert.match(books,/translationCode/);
  const chapters=source('src/screens/BibleBookScreen.js');
  assert.match(chapters,/onPress=\{\(\) => setContextChapter\(item\)\}/);
  assert.match(chapters,/name="ellipsis-vertical"/);
  assert.match(chapters,/onSave=\{contextChapter \? \(\)=>toggleChapterSaved\(contextChapter\)/);
  assert.match(chapters,/onSave=\{toggleBookSaved\}/);
  assert.match(chapters,/findSavedBibleChapter/);
  assert.match(chapters,/bibleChapterText\(contextChapter,translationCode\)/);
  assert.match(source('src/screens/BibleChapterScreen.js'),/translation_code: translationCode/);
  const favorites=source('src/screens/FavoritesScreen.js');
  assert.match(favorites,/anchor_type === 'bible_book'/);
  assert.match(favorites,/navigation.push\('BibleBook'/);
  assert.match(favorites,/translationCode: metadata.translation_code/);
  const sharing=source('src/services/contentSharing.js');
  assert.match(sharing,/anchor_type==='bible_book'/);
  assert.match(sharing,/\['BibleBook',/);
  for(const screen of [
    'src/screens/AkathistListScreen.js',
    'src/screens/CanonListScreen.js',
    'src/screens/MiscPrayersScreen.js',
  ]){
    assert.match(source(screen),/borderLeftWidth:1/);
  }
  console.log('PASS: Bible books/chapters save/share in both translations, favorites navigation, separate action zones');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
