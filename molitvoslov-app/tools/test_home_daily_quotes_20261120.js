#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const catalogue=JSON.parse(read('src/data/curatedDailyQuotes.json'));
const bible=JSON.parse(read('src/data/offlineBible.json'));
const books=new Map(bible.books.map(b=>[b.code,b]));
const q=catalogue.quotes;
assert.equal(catalogue.count,151);
assert.equal(q.length,151);
assert.equal(new Set(q.map(x=>x.id)).size,151);
assert(q.every(x=>Number.isInteger(x.id)&&x.id>0&&
  typeof x.text==='string'&&x.text.length>=16&&x.text.length<=125));
const proverbs=q.filter(x=>x.target?.bookCode==='PRO');
const biblical=q.filter(x=>x.kind==='bible');
const fathers=q.filter(x=>x.kind==='father');
assert.equal(proverbs.length,85);
assert.equal(biblical.length,135);
assert.equal(fathers.length,16);
const normalize=s=>String(s||'').toLowerCase().replace(/ё/gu,'е')
  .replace(/[^\p{L}\p{N}]/gu,' ').replace(/\s+/gu,' ').trim();
for(const item of biblical){
 assert.equal(item.target?.type,'bible');
 const chapter=books.get(item.target.bookCode)?.chapters
   .find(c=>Number(c.number)===item.target.chapter);
 const verse=chapter?.verses?.find(v=>Number(v.number)===item.target.verse);
 assert(verse,'Missing Bible target: '+item.reference);
 const words=normalize(item.text).split(' ').filter(w=>w.length>=3);
 const inVerse=normalize(verse.text);
 assert(words.filter(w=>inVerse.includes(w)).length>=words.length/2,
   'Quote text does not match referenced verse: '+item.reference);
}
assert(fathers.every(x=>x.target==null&&x.sourceUrl?.startsWith('https://azbyka.ru/')),
  'Patristic quotes must name a work but not invent an in-app route');
const menu=read('src/screens/MenuScreen.js');
const favorite=read('src/screens/FavoritesScreen.js');
assert(menu.includes("fontFamily: 'serif'")&&
  !/heroQuoteText:\s*\{[^}]*fontFamily:\s*'Ponomar'/u.test(menu));
assert(menu.includes('quote_target: dailyQuote.target || null'));
assert(menu.includes('openDailyQuoteSource(navigation, dailyQuote)'));
assert(menu.includes('numberOfLines={9}'));
assert(favorite.includes('openDailyQuoteSource(navigation, {...metadata'));
const navText=read('src/services/dailyQuoteNavigation.js')
  .replace(/^import.*$/gmu,'').replace(/\bexport const /gu,'const ');
const resolver=new Function('bibleContent',navText+
  '\nreturn {resolveDailyQuoteSource,openDailyQuoteSource};')({
  getBooks:()=>bible.books,
});
const actual=resolver.resolveDailyQuoteSource(proverbs[0]);
assert(actual?.bookId&&actual.chapterNumber===proverbs[0].target.chapter);
assert.equal(actual.verseNumber,proverbs[0].target.verse);
assert.equal(resolver.resolveDailyQuoteSource(fathers[0]),null);
let navigationTarget=null;
assert.equal(resolver.openDailyQuoteSource({navigate:(name,params)=>{
  navigationTarget={name,params};
}},proverbs[0]),true);
assert.equal(navigationTarget.name,'BibleChapter');
assert.equal(navigationTarget.params.verseNumber,proverbs[0].target.verse);
assert.equal(resolver.openDailyQuoteSource({navigate:()=>{throw Error('wrong destination');}},fathers[0]),false);
console.log('PASS: 151 legacy entries (85 Proverbs, 50 other Scripture, 16 Fathers).');
console.log('PASS: all 135 Scripture references match bundled Bible verses.');
console.log('PASS: Home source link and Favorites destination open exact verse.');
console.log('PASS: Fathers stay non-navigable; no Ponomar in Home quotation.');
