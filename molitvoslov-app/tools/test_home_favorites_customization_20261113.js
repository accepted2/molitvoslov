#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const clean=s=>s.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm,'')
  .replace(/\bexport const /g,'const ');

async function main(){
  let loggedIn=false;
  const memory=new Map();
  const AsyncStorage={
    getItem:async key=>memory.get(key)||null,
    setItem:async(key,value)=>{memory.set(key,value);},
    getAllKeys:async()=>[...memory.keys()],
  };
  const user=async()=>({id:19});
  const token=async()=>loggedIn?'access-token':null;
  const menu=new Function('AsyncStorage','getCachedBackendUser','getApiToken',
    clean(read('src/services/homeCategoryOrder.js'))+
    '\nreturn {mergeCategoryOrder,moveCategoryKey,getHomeCategoryOrder,saveHomeCategoryOrder};'
  )(AsyncStorage,user,token);
  const cards=[{key:'morning'},{key:'hours'},{key:'bible'},{key:'category:27'}];
  assert.deepEqual(menu.mergeCategoryOrder(cards,['bible','morning','category:27']).map(x=>x.key),
    ['bible','morning','category:27','hours']);
  assert.deepEqual(menu.moveCategoryKey(cards.map(x=>x.key),'bible',-2),
    ['bible','morning','hours','category:27']);
  assert.deepEqual(menu.moveCategoryKey(cards.map(x=>x.key),'morning',-20),
    cards.map(x=>x.key),'Out-of-range drags must clamp');
  await menu.saveHomeCategoryOrder(['bible','hours']);
  assert.deepEqual(await menu.getHomeCategoryOrder(),['bible','hours']);
  loggedIn=true;
  assert.deepEqual(await menu.getHomeCategoryOrder(),['bible','hours'],
    'Existing guest ordering can be adopted on first Google sign-in');
  await menu.saveHomeCategoryOrder(['hours','bible']);
  assert.deepEqual(await menu.getHomeCategoryOrder(),['hours','bible']);
  loggedIn=false;
  assert.deepEqual(await menu.getHomeCategoryOrder(),['bible','hours'],
    'Sign-out restores guest settings, not cloud account settings');

  const changes=[];
  const db={
    getFirstAsync:async()=>({
      id:1,cloud_user_id:19,user_id:19,metadata:'{"font":"Ponomar"}',
      sync_id:'abc-sync',server_id:12,deleted_at:null,save_type:'fragment',
      created_at:'2026-11-01T00:00:00Z',
    }),
    runAsync:async(sql,args)=>{changes.push({sql,args});return {lastInsertRowId:1};},
    getAllAsync:async()=>[],
  };
  const favorites=new Function(
    'Crypto','getDatabase','getCurrentUser','authenticatedFetch',
    'getApiToken','getCachedBackendUser',
    clean(read('src/services/savedItems.js'))+
    '\nreturn {sortSavedItems,setSavedItemPinned};'
  )({randomUUID:()=> 'newuuid'},async()=>db,async()=>null,
    async()=>({ok:true,text:async()=> '[]'}),token,user);
  const sample=[
    {id:1,created_at:'2026-11-13',metadata:'{}'},
    {id:2,created_at:'2026-11-01',metadata:'{"is_pinned":true,"pinned_at":"2026-11-01"}'},
    {id:3,created_at:'2026-11-02',metadata:'{"is_pinned":true,"pinned_at":"2026-11-02"}'},
  ];
  assert.deepEqual(favorites.sortSavedItems(sample).map(x=>x.id),[3,2,1],
    'Pin stays above newer ordinary favorites, newest pin above older pins');
  loggedIn=true;
  const pinned=await favorites.setSavedItemPinned(1,true);
  assert.equal(pinned.is_pinned,true);
  assert.equal(changes[0].args[2],'pending');
  assert.equal(JSON.parse(changes[0].args[0]).font,'Ponomar',
    'Reader metadata must survive pinning');
  assert.equal(JSON.parse(changes[0].args[0]).is_pinned,true);

  const menuScreen=read('src/screens/MenuScreen.js');
  const favoritesScreen=read('src/screens/FavoritesScreen.js');
  const sync=read('src/services/accountPreferencesSync.js');
  assert.match(menuScreen,/orderedLibraryCards\.map/);
  assert.match(menuScreen,/ReorderableCategoryCard/);
  assert.match(read('src/components/navigation/ReorderableCategoryCard.js'),
    /activateAfterLongPress\(370\)/);
  assert.match(favoritesScreen,/setSavedItemPinned/);
  assert.match(favoritesScreen,/pin-outline/);
  assert.match(sync,/homeCategoryOrder/);
  assert.match(read('src/services/savedItems.js'),/method: isRemoteUpdate \? 'PATCH' : 'POST'/);
  console.log('PASS: long-press home order, per-account persistence, pinned favorites and cloud PATCH');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
