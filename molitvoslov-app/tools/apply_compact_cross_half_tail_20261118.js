'use strict';
// Targeted compact-cross tail adjustment. Preserve all other local source.
const fs=require('fs');
const path=require('path');
const file=path.resolve(__dirname,'..','src/components/feedback/PrayerBeadsLoader.js');
const before=String.raw`  // Leave a distinct lower tail BELOW the slanted footrest.
  // At the old 10px height, that tail disappeared after Android rasterization.
  crossStemCompact: {
    top: 0,
    left: 4.2,
    width: 1.1,
    height: 17.5,
  },`;
const after=String.raw`  // Keep a short but visible stem below the slanted bar.
  // The exposed lower tail is approximately half its previous length.
  crossStemCompact: {
    top: 0,
    left: 4.2,
    width: 1.1,
    height: 14.75,
  },`;
const original=fs.readFileSync(file,'utf8');
const normalized=original.replace(/\r\n/g,'\n');
const beforeHits=normalized.split(before).length-1;
const afterHits=normalized.split(after).length-1;
if(afterHits===1&&beforeHits===0) {
  console.log('PASS: compact cross tail already shortened.');
  process.exit(0);
}
if(beforeHits!==1||afterHits!==0) {
  throw Error('PrayerBeadsLoader.js has unexpected local changes near compact cross. '+
    'No file was modified; send the message for a safe merge.');
}
let updated=normalized.replace(before,after);
updated=updated.replace(/\n/g,original.includes('\r\n')?'\r\n':'\n');
const backups=path.resolve(__dirname,'..','..','build-backups',
  'compact-cross-tail-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backups,{recursive:true});
const backup=path.join(backups,'PrayerBeadsLoader.js');
fs.copyFileSync(file,backup);
try{fs.writeFileSync(file,updated,'utf8')}
catch(e){fs.writeFileSync(file,original,'utf8');throw e}
console.log('PASS: compact cross lower tail reduced by approximately half.');
console.log('Backup:',backup);
