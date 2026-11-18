'use strict';
// Small cross bottom fix: preserve unrelated local modifications.
// Validate every patch before writing, back up prior source, safe to re-run.
const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname,'..',
  'src/components/feedback/PrayerBeadsLoader.js');
const patches = [{"before":"  crossCompact: {\n    top: 31,\n    left: 14,\n    width: 9,\n    height: 12,\n  },","after":"  crossCompact: {\n    top: 31,\n    left: 14,\n    width: 10,\n    height: 20,\n    overflow: 'visible',\n  },"},{"before":"  crossStemCompact: {\n    top: 0,\n    left: 4.2,\n    width: 1,\n    height: 10,\n  },","after":"  crossStemCompact: {\n    top: 0,\n    left: 4.2,\n    width: 1.1,\n    height: 17.5,\n  },"},{"before":"  crossMiddleBarCompact: {\n    top: 5,\n    left: 0.5,\n    width: 7,\n    height: 1.2,\n  },","after":"  crossMiddleBarCompact: {\n    top: 5,\n    left: 1.2,\n    width: 7,\n    height: 1.2,\n  },"},{"before":"  crossFootBarCompact: {\n    top: 8,\n    left: 1.5,\n    width: 5.5,\n    height: 1.2,\n    transform: [{rotate: '14deg'}],\n  },","after":"  crossFootBarCompact: {\n    top: 10,\n    left: 1.8,\n    width: 6.2,\n    height: 1.2,\n    transform: [{rotate: '14deg'}],\n  },"},{"before":"  crossStemCompact: {","after":"  // Leave a distinct lower tail BELOW the slanted footrest.\n  // At the old 10px height, that tail disappeared after Android rasterization.\n  crossStemCompact: {"}];
const original = fs.readFileSync(file,'utf8');
let text = original.replace(/\r\n/g,'\n');
for(const [index,patch] of patches.entries()){
  const before = text.split(patch.before).length - 1;
  const after = text.split(patch.after).length - 1;
  if(after === 1)continue;
  if(before !== 1 || after !== 0){
    throw Error('PrayerBeadsLoader.js has different local code around fix '+(index+1)+
      '. No files modified; send this error for a safe merge.');
  }
  text = text.replace(patch.before,patch.after);
}
text = text.replace(/\n/g,original.includes('\r\n')?'\r\n':'\n');
if(text === original){
  console.log('PASS: compact cross already complete.');
  process.exit(0);
}
const backupDir = path.resolve(__dirname,'..','..','build-backups',
 'compact-cross-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
const backup = path.join(backupDir,'PrayerBeadsLoader.js');
fs.copyFileSync(file,backup);
try{fs.writeFileSync(file,text,'utf8')}
catch(e){fs.writeFileSync(file,original,'utf8');throw e}
console.log('PASS: compact cross now has a complete lower stem.');
console.log('Backup:',backup);
