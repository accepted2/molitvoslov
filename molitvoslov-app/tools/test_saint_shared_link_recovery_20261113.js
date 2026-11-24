#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const source = app('src/services/saintShareResolver.js');
const findSaintForSharedLink = new Function(
  source.replace('export const findSaintForSharedLink =','const findSaintForSharedLink =')+
  '\nreturn findSaintForSharedLink;'
)();

const main = {
  id: 11, sync_uid:'main-saint', title:'Main feast',
  life_content:'Main life', troparion_content:'Main troparion',
};
const other = {
  id: 42, title:'Other saint', kontakion_content:'Other kontakion',
};
const day = {main_feast: main, all_feasts:[other,main]};

assert.equal(findSaintForSharedLink(day,{feastUid:'main-saint',focusSection:'life'}),main);
assert.equal(findSaintForSharedLink(day,{feastUid:'42',focusSection:'kontakion'}),other);
assert.equal(findSaintForSharedLink(day,{feastId:42,focusSection:'kontakion'}),other);
assert.equal(findSaintForSharedLink(day,{feastTitle:'Other saint'}),other);
assert.equal(findSaintForSharedLink(day,{focusSection:'life'}),main);
assert.equal(findSaintForSharedLink(day,{focusSection:'kontakion'}),other);
assert.equal(findSaintForSharedLink(day,{feastUid:'unknown',focusSection:'life'}),null);
assert.equal(findSaintForSharedLink(null,{}),null);

const sharing = app('src/services/contentSharing.js')
  .replace(/^import[^\n]*\n/gm,'').replace(/\bexport const /g,'const ');
const api = new Function('Alert','Share','shareImportableContent',
  sharing + '\nreturn {sharePathFor,resolveSelectedShareTarget};'
)({alert(){}},{share:async()=>{}},async()=>true);
assert.equal(api.sharePathFor('SaintDetail',{
  date:'2026-11-13',focusSection:'kontakion',feastId:42,
}),'saint/2026-11-13/kontakion/42');
const saved=api.resolveSelectedShareTarget({sourceType:'calendar',metadata:{
  date:'2026-11-13',section:'troparion',feast_id:11,
}});
assert.equal(api.sharePathFor(saved.screen,saved.params),
  'saint/2026-11-13/troparion/11');

const saint = app('src/screens/SaintDetailScreen.js');
assert.match(saint,/getOfflineCalendarDay\(date, language\)/);
assert.match(saint,/findSaintForSharedLink\(day/);
assert.match(saint,/setSharedCardLoading\(shouldLoad\)/);
assert.match(saint,/sharedCardNotFound/);
assert.match(saint,/feast\?\.sync_uid \|\| feast\?\.id/);
const calendar = app('src/screens/ChurchCalendarScreen.js');
assert.match(calendar,/feastUid: feast\?\.sync_uid \|\| feast\?\.id/);
console.log('PASS: shared saint links restore date + specific feast and recover legacy missing-id links');
