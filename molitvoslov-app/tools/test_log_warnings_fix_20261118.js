#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const parser=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const reminders=read('src/services/localPrayerReminders.js');
const menu=read('src/screens/MenuScreen.js');
const prefs=read('src/services/accountPreferencesSync.js');
const account=read('src/screens/AccountScreen.js');
for(const [name,source] of [
 ['localPrayerReminders',reminders],['MenuScreen',menu],
 ['accountPreferencesSync',prefs],['AccountScreen',account],
]){
 assert.doesNotThrow(()=>parser.parse(source,{sourceType:'module',plugins:['jsx']}),
  name+' must parse with Babel');
}
const channel=reminders.slice(
 reminders.indexOf('const channelReady = async () => {'),
 reminders.indexOf('const hasPermission ='),
);
assert.match(channel,/setNotificationChannelAsync\(CHANNEL/);
assert.match(channel,/AndroidImportance\.HIGH/);
assert.doesNotMatch(channel,/\bsound\s*:/,
 'No custom sound filename for default Android channel');
assert.equal((reminders.match(/sound: Platform\.OS === 'android' \? true : 'default'/g)||[]).length,2,
 'Both recurring and preview notifications request native Android sound');
assert.match(reminders,/shouldPlaySound: true/);
assert.match(reminders,/const CHANNEL = 'prayer-reminders-audible-v2'/,
 'Do not change channel ID or invalidate existing schedules');
assert.match(reminders,/getNextTriggerDateAsync/);
assert.match(reminders,/reconcilePrayerReminders/);

assert.doesNotMatch(menu,/InteractionManager\.runAfterInteractions/);
assert.doesNotMatch(menu,/^\s*InteractionManager,\s*$/m);
assert.match(menu,/globalThis\.requestIdleCallback/);
assert.match(menu,/globalThis\.cancelIdleCallback/);
assert.match(menu,/clearTimeout\(timer\)/);
assert.match(menu,/if \(!cancelled\) updateCalendarWidget/);

assert.match(prefs,/deleteApiToken/);
assert.match(prefs,/response\.status === 401/);
assert.match(prefs,/response\.status === 403/);
assert.match(prefs,/error\.code = 'reauth-required'/);
assert.match(prefs,/reason: 'reauth-required'/);
assert.match(prefs,/if \(!user\?\.id\) return;/,
 'Offline changes should not require a valid token to queue');
assert.match(prefs,/await AsyncStorage\.setItem\(key, JSON\.stringify\(mergePatch\(current, patch\)\)\)/);
assert.match(account,/Для синхронизации настроек повторно войдите в аккаунт/);

// Extract only the request adapter (no React Native runtime required), and
// prove invalid credentials stop syncing without discarding preference data.
const a=prefs.indexOf('const request = async (method, patch = null) => {');
const b=prefs.indexOf('\nconst accountAppearanceKey',a);
assert.ok(a>=0&&b>a);
const makeRequest=(fetcher,deleteToken)=>new Function('authenticatedFetch','deleteApiToken',
 prefs.slice(a,b)+'\nreturn request;')(fetcher,deleteToken);
async function run(){
 let deleted=0;
 const unauthorized=makeRequest(async()=>({ok:false,status:401,json:async()=>({
  detail:'Недействительный токен.'})}),async()=>{deleted++});
 await assert.rejects(unauthorized('GET'),e=>e.code==='reauth-required');
 assert.equal(deleted,1,'Expired 401 token cleared only once');

 deleted=0;
 const invalid403=makeRequest(async()=>({ok:false,status:403,json:async()=>({
  detail:'Недействительный токен.'})}),async()=>{deleted++});
 await assert.rejects(invalid403('GET'),e=>e.code==='reauth-required');
 assert.equal(deleted,1,'Only explicit invalid-token 403 expires login');

 deleted=0;
 const forbidden=makeRequest(async()=>({ok:false,status:403,json:async()=>({
  detail:'Недостаточно прав доступа'})}),async()=>{deleted++});
 await assert.rejects(forbidden('GET'),/Недостаточно прав/);
 assert.equal(deleted,0,'Regular 403 must never delete session token');

 deleted=0;
 const outage=makeRequest(async()=>({ok:false,status:503,json:async()=>({})}),async()=>{deleted++});
 await assert.rejects(outage('GET'),/503/);
 assert.equal(deleted,0,'Network/server error must never expire login');

 const success=makeRequest(async()=>({ok:true,status:200,json:async()=>({settings:{fontSize:19}})}),
 async()=>{deleted++});
 assert.equal((await success('GET')).settings.fontSize,19);
 assert.equal(deleted,0);

 console.log('PASS: native Android default sound without false custom-sound error');
 console.log('PASS: idle widget scheduling replaces deprecated InteractionManager');
 console.log('PASS: 401/invalid-token 403 reauth, unrelated 403/503 preserved and offline edits retained');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
