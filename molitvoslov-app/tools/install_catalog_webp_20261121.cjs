#!/usr/bin/env node
'use strict';
// Only the three requested category covers. Keep the other home artwork.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const app=path.resolve(__dirname,'..'),dry=process.argv.includes('--dry-run');
const dirArg=process.argv.find(x=>x.startsWith('--source-dir='));
const downloads=dirArg?path.resolve(dirArg.slice(13)):path.join(process.env.USERPROFILE||process.env.HOME,'Downloads');
const images=[
  ['hours','catalog_hours.webp'],
  ['learning','catalog_learning_to_pray.webp'],
  ['various','catalog_various_prayers.webp']
];
const count=(text,needle)=>text.split(needle).length-1;
const check=(ok,why)=>{if(!ok)throw Error(why)};
function one(text,oldValue,newValue,tag){
  if(text.includes(newValue)){check(!text.includes(oldValue)&&count(text,newValue)===1,'Duplicate '+tag);return text;}
  check(count(text,oldValue)===1,'Cannot safely find original '+tag);
  return text.replace(oldValue,newValue);
}
function patchArtwork(text){
  const anchor="  psalter: require('../../assets/home/psalter.png'),";
  const added=images.map(([key,name])=>"  "+key+": require('../../assets/home/"+name+"'),");
  if(added.every(x=>text.includes(x)))return text;
  check(added.every(x=>!text.includes(x)),'Partially installed artwork definitions');
  check(count(text,anchor)===1,'Psalter artwork anchor missing');
  return text.replace(anchor,anchor+'\n'+added.join('\n'));
}
function patchMenu(text){
  const mappings=[
    ["symbol:'✦',iconSource:CATEGORY_ICONS.canons,artwork:homeArtwork.canons,\n      onPress:()=>navigation.navigate('Hours')",
     "symbol:'✦',iconSource:CATEGORY_ICONS.canons,artwork:homeArtwork.hours,\n      onPress:()=>navigation.navigate('Hours')"],
    ["symbol:'Ѣ',iconSource:CATEGORY_ICONS.misc,artwork:homeArtwork.misc,\n      onPress:()=>navigation.navigate('PrayerLearning')",
     "symbol:'Ѣ',iconSource:CATEGORY_ICONS.misc,artwork:homeArtwork.learning,\n      onPress:()=>navigation.navigate('PrayerLearning')"],
    ["symbol:'✦',iconSource:CATEGORY_ICONS.misc,artwork:homeArtwork.misc,\n      onPress:()=>navigation.navigate('MiscPrayers')",
     "symbol:'✦',iconSource:CATEGORY_ICONS.misc,artwork:homeArtwork.various,\n      onPress:()=>navigation.navigate('MiscPrayers')"]
  ];
  return mappings.reduce((s,[oldValue,newValue],i)=>one(s,oldValue,newValue,'card '+i),text);
}
const mappings=[
  ['src/data/homeArtwork.js',patchArtwork],
  ['src/screens/MenuScreen.js',patchMenu]
];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
let code=[],assets=[];
try{
  for(const [key,name] of images){
    const from=path.join(downloads,name),to=path.join(app,'assets/home',name);
    check(fs.existsSync(from),'Download missing: '+from);
    const bytes=fs.readFileSync(from);
    check(bytes.length>1000&&bytes.length<4e6&&bytes.toString('ascii',0,4)==='RIFF'&&
      bytes.toString('ascii',8,12)==='WEBP','Invalid WebP: '+name);
    const old=fs.existsSync(to)?fs.readFileSync(to):null;
    assets.push({from,to,old,bytes,changed:!old||hash(old)!==hash(bytes),name});
  }
  for(const [name,fn] of mappings){
    const file=path.join(app,name),old=fs.readFileSync(file,'utf8');
    const after=fn(old.replace(/\r\n/g,'\n'));
    check(fn(after)===after,'Patch not repeatable: '+name);
    code.push({file,name,old,after:old.includes('\r\n')?after.replace(/\n/g,'\r\n'):after,
      changed:after!==old.replace(/\r\n/g,'\n')});
  }
  check(code[0].after.includes("misc: require('../../assets/home/misc_prayers.jpg')"),
    'Existing fallback imagery was modified');
}catch(e){console.error('STOP:',e.message);console.error('NO FILES CHANGED');process.exit(1)}
for(const x of assets)console.log(x.name,Math.round(x.bytes.length/1024)+' KiB');
console.log('FILES TO CHANGE:',code.filter(x=>x.changed).map(x=>x.name).join(', ')||'none');
if(dry){console.log('DRY RUN PASS — NOTHING MODIFIED');process.exit(0)}
const changedCode=code.filter(x=>x.changed),changedAssets=assets.filter(x=>x.changed);
if(!changedCode.length&&!changedAssets.length){console.log('ALREADY INSTALLED');process.exit(0)}
const backup=path.join(app,'..','build-backups','catalog-webp-'+new Date().toISOString().replace(/[:.]/g,'-'));
try{
  for(const j of changedCode){
    const dst=path.join(backup,j.name);fs.mkdirSync(path.dirname(dst),{recursive:true});
    fs.writeFileSync(dst,j.old,'utf8');
  }
  for(const j of changedAssets)if(j.old){
    const dst=path.join(backup,'assets/home',j.name);
    fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,j.old);
  }
  for(const j of changedAssets)fs.writeFileSync(j.to,j.bytes);
  for(const j of changedCode)fs.writeFileSync(j.file,j.after,'utf8');
  for(const j of assets)check(hash(fs.readFileSync(j.to))===hash(j.bytes),'Image copy mismatch');
}catch(e){
  for(const j of changedCode)fs.writeFileSync(j.file,j.old,'utf8');
  for(const j of changedAssets){if(j.old)fs.writeFileSync(j.to,j.old);else if(fs.existsSync(j.to))fs.unlinkSync(j.to)}
  console.error('FAILED. ORIGINALS RESTORED:',e.message);process.exit(1);
}
console.log('SUCCESS: HOURS, LEARNING AND MISC CARD IMAGES REPLACED');
console.log('BACKUP:',backup);
