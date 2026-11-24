#!/usr/bin/env node
'use strict';
// Lossless build-time calendar size experiment. Packs only identical RU/UK
// fields in 2025-2027 monthly JSON. Keeps full originals in reports/.
// Before modifying ANY month:
// - checks every month against the same codec used by the app;
// - verifies exact JSON object equality on unpack;
// - writes every packed output to a staging folder;
// - copies and SHA-verifies every original under a dated backup.
// Any partial write failure restores all original months from that backup.
// Does NOT touch Bible, search, Hours, icons, images, SQLite, Git or Gradle.
//
// Dry run (read-only):
//   node tools/pack-calendar-months-20261116.js
// Apply (backs up all 36 originals first):
//   node tools/pack-calendar-months-20261116.js --apply
// Restore original 36 months later, if needed:
//   node tools/pack-calendar-months-20261116.js --restore="C:\...\reports\calendar-month-originals-..."
// This is opt-in; the old (unpacked) month JSON remains supported by the app.

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {packCalendarMonth,unpackCalendarMonth,FORMAT_KEY}=
  require('../src/services/calendarMonthCodec');

const root=path.resolve(__dirname,'..');
const sourceDir=path.join(root,'src','data','calendar');
const reportDir=path.join(root,'reports');
const args=process.argv.slice(2);
const apply=args.includes('--apply');
const restoreArg=args.find(s=>s.startsWith('--restore='));
const restore=restoreArg?restoreArg.slice('--restore='.length):null;
if(apply&&restore)throw Error('Use either --apply or --restore=, not both.');
const mib=bytes=>(bytes/1048576).toFixed(2);
const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');
const filenames=[];
for(let year=2025;year<=2027;year++){
  for(let month=1;month<=12;month++){
    filenames.push(year+'-'+String(month).padStart(2,'0')+'.json');
  }
}
for(const name of filenames){
  if(!fs.existsSync(path.join(sourceDir,name)))throw Error('Missing offline calendar: '+name);
}
if(restore){
  const folder=path.resolve(restore);
  const expectedRoot=path.resolve(reportDir)+path.sep;
  if(!folder.startsWith(expectedRoot)||
      !path.basename(folder).startsWith('calendar-month-originals-')){
    throw Error('Restore only from a verified calendar-month-originals backup under reports.');
  }
  const manifestPath=path.join(folder,'manifest.json');
  if(!fs.existsSync(manifestPath))throw Error('Backup manifest missing.');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(manifest.format!=='calendar-original-backup-v1'||
     manifest.files?.length!==filenames.length)throw Error('Invalid calendar backup manifest.');
  for(const name of filenames){
    const row=manifest.files.find(x=>x.name===name);
    if(!row)throw Error('Missing backup manifest entry: '+name);
    const file=path.join(folder,name);
    if(!fs.existsSync(file)||sha(fs.readFileSync(file))!==row.sha256){
      throw Error('Backup integrity check failed: '+name);
    }
    const source=JSON.parse(fs.readFileSync(file,'utf8'));
    if(source?.[FORMAT_KEY])throw Error('Backup is packed, not original: '+name);
  }
  for(const name of filenames){
    fs.copyFileSync(path.join(folder,name),path.join(sourceDir,name));
  }
  console.log('RESTORED: 36 exact original calendar JSON files from '+folder);
  console.log('No app or user SQLite databases changed.');
  process.exit(0);
}

const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const staging=path.join(reportDir,'calendar-month-packed-stage-'+stamp);
const backup=path.join(reportDir,'calendar-month-originals-'+stamp);
const stats=[];
let rawTotal=0,packedTotal=0;
const stagedFiles=[];
try{
  if(apply)fs.mkdirSync(staging,{recursive:true});
  for(const name of filenames){
    const source=path.join(sourceDir,name);
    const originalBytes=fs.readFileSync(source);
    const parsed=JSON.parse(originalBytes.toString('utf8'));
    if(parsed?.[FORMAT_KEY])throw Error('Month is already packed; aborting: '+name);
    if(!parsed || !parsed.days || typeof parsed.days!=='object') {
      throw Error('Invalid calendar month: '+name);
    }
    const packed=packCalendarMonth(parsed);
    const expanded=unpackCalendarMonth(packed);
    try{
      assert.deepStrictEqual(expanded,parsed);
    }catch(error){
      throw new Error('Lossless roundtrip verification failed in '+name+': '+error.message);
    }
    const packedText=JSON.stringify(packed);
    // Read the actual serialized packed file as the app will, not just the
    // in-memory object used above.
    const reparsed=JSON.parse(packedText);
    assert.deepStrictEqual(unpackCalendarMonth(reparsed),parsed,
      'Serialized packed calendar differs from source: '+name);
    const input=originalBytes.length,output=Buffer.byteLength(packedText,'utf8');
    if(output>=input)throw Error('Packed month not smaller: '+name);
    rawTotal+=input;packedTotal+=output;
    stats.push({name,originalBytes:input,packedBytes:output,
      sha256:sha(originalBytes)});
    if(apply){
      const target=path.join(staging,name);
      fs.writeFileSync(target,packedText,'utf8');
      stagedFiles.push(target);
    }
    console.log(name.padEnd(13)+mib(input).padStart(6)+' -> '+mib(output).padStart(6)+
      ' MiB | saved '+mib(input-output)+' MiB');
  }
  console.log('\nExact roundtrip verified for '+stats.length+' calendar months.');
  console.log('Raw calendar JSON: '+mib(rawTotal)+' MiB');
  console.log('Delta-packed JSON: '+mib(packedTotal)+' MiB');
  console.log('Raw saving: '+mib(rawTotal-packedTotal)+' MiB ('+
    ((rawTotal-packedTotal)/rawTotal*100).toFixed(1)+'%).');
  console.log('Estimated raw JSON savings are NOT a measured Hermes/APK saving.');
  if(!apply){
    console.log('DRY RUN ONLY. No files or source content modified.');
    console.log('To make a measured APK candidate, rerun with --apply.');
    process.exit(0);
  }
  fs.mkdirSync(backup,{recursive:true});
  for(const row of stats){
    const from=path.join(sourceDir,row.name),dest=path.join(backup,row.name);
    fs.copyFileSync(from,dest);
    if(sha(fs.readFileSync(dest))!==row.sha256){
      throw Error('Backup checksum mismatch: '+row.name);
    }
  }
  const manifest={
    format:'calendar-original-backup-v1',
    createdAt:new Date().toISOString(),
    files:stats.map(x=>({name:x.name,sha256:x.sha256,bytes:x.originalBytes})),
    rawTotal,packedTotal,
  };
  fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2),'utf8');

  try{
    for(const row of stats){
      fs.copyFileSync(path.join(staging,row.name),path.join(sourceDir,row.name));
      const active=JSON.parse(fs.readFileSync(path.join(sourceDir,row.name),'utf8'));
      if(active?.[FORMAT_KEY]!==1)throw Error('Invalid installed packed format: '+row.name);
    }
  }catch(error){
    for(const row of stats){
      fs.copyFileSync(path.join(backup,row.name),path.join(sourceDir,row.name));
    }
    throw new Error('Calendar installation failed; originals restored: '+error.message);
  }
  console.log('\nPASS: losslessly packed all 36 offline calendar months.');
  console.log('Original calendar backup: '+backup);
  console.log('Packed staging outputs: '+staging);
  console.log('App opens months using the same audited codec and supports older JSON.');
  console.log('NEXT: test JS export, then build separate trial APK and compare sizes.');
}catch(error){
  console.error('CALENDAR PACK FAILED: '+error.message);
  process.exitCode=1;
}finally{
  // Keep staging only after successful application for audit. Failed staging
  // can be removed; it contains only generated copies of public calendar data.
  if(!apply&&stagedFiles.length)throw Error('Unexpected dry-run staging files');
}
