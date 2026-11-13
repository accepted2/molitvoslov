#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

const config=JSON.parse(read('app.json')).expo;
assert.equal(config.scheme,'molitvoslov');
assert.equal(config.android.package,'com.accepted2.molitvoslov');
const verified=config.android.intentFilters.find(filter=>filter.autoVerify===true);
assert.ok(verified,'Missing verified Android App Link intent filter');
assert.deepEqual(verified.category,['BROWSABLE','DEFAULT']);
assert.ok(verified.data.some(data=>data.scheme==='https' &&
  data.host==='molitvoslov-3o9d.onrender.com' &&
  data.pathPrefix==='/api/share/'));

const appLinks=read('src/services/appLinks.js');
const code=appLinks.replace(/^export const /gm,'const ');
const api=new Function(code+
  '\nreturn {normalizeIncomingAppLink,isSupportedAppPath,APP_LINK_ORIGIN};')();
const https=(path)=>api.APP_LINK_ORIGIN+'/api/share/?path='+encodeURIComponent(path);
const expect=(path)=>assert.equal(api.normalizeIncomingAppLink(https(path)),
  'molitvoslov://'+path.split('/').map(encodeURIComponent).join('/'));
expect('bible/1/22/csl_traditional/3');
expect('bible-book/1/rst');
expect('kathisma/4/27/traditional');
expect('akathist/42');
expect('canon/99');
expect('prayer/morning');
expect('reader/prayer-slug');
expect('hours/hour-1');
expect('saint/2026-11-13/troparion/a1bc-def');
expect('psalter');
expect('reader/Слово_Божие');
const invite='a'.repeat(43);
assert.equal(api.normalizeIncomingAppLink(
  api.APP_LINK_ORIGIN+'/api/share/?invite='+invite),
  'molitvoslov://shared/'+invite);
assert.equal(api.normalizeIncomingAppLink('molitvoslov://bible/1/22/rst/3'),
  'molitvoslov://bible/1/22/rst/3');
assert.equal(api.normalizeIncomingAppLink('molitvoslov://shared/'+invite),
  'molitvoslov://shared/'+invite);

for(const bad of [
  'https://evil.test/api/share/?path=bible%2F1%2F1%2Frst',
  'https://molitvoslov-3o9d.onrender.com/api/auth/me/',
  'https://molitvoslov-3o9d.onrender.com/api/share/?path=../../admin',
  'https://molitvoslov-3o9d.onrender.com/api/share/?path=bible%2F1%2F1%2Frst&path=psalter',
  'https://molitvoslov-3o9d.onrender.com/api/share/?path=%ZZ',
  'https://molitvoslov-3o9d.onrender.com/api/share/?invite=wrong',
  'https://molitvoslov-3o9d.onrender.com/api/share/?invite=wrong&path=psalter',
  'https://molitvoslov-3o9d.onrender.com/api/share/?path=javascript%3Aalert(1)',
]){
  assert.equal(api.normalizeIncomingAppLink(bad),null,'Bad URL accepted: '+bad);
}
const nav=read('src/navigation/AppNavigator.js');
assert.match(nav,/Linking\.getInitialURL\(\)/);
assert.match(nav,/Linking\.addEventListener\('url'/);
assert.match(nav,/normalizeIncomingAppLink\(url\)/);
assert.match(nav,/SharedImport: \{path:'shared\/:token'\}/);
assert.match(nav,/BibleChapter: \{path:'bible\//);
assert.match(nav,/Kathisma: \{path:'kathisma\//);
const sharing=read('src/services/contentSharing.js');
assert.match(sharing,/https:\/\/molitvoslov-3o9d\.onrender\.com/);
assert.match(sharing,/\/api\/share\/\?path=/);
const native=read('tools/sync-android-app-links-20261113.ps1');
assert.match(native,/android:autoVerify="true"/);
assert.match(native,/android:pathPrefix="\/api\/share\/"/);
const build=read('tools/build-release-and-smoke-20261113.ps1');
assert.match(build,/sync-android-app-links-20261113\.ps1/);
assert.match(build,/check-android-app-links-20261113\.ps1/);
console.log('PASS: verified Android HTTPS links, direct Bible/Psalter and invitation routes, malformed URL rejection');
