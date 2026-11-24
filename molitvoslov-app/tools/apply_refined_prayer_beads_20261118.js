'use strict';
// Safe local refinement of the existing oval prayer beads loader.
// Read, check ALL anchors, then back up and write. Never overwrites other edits.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/components/feedback/PrayerBeadsLoader.js');
const hunks = [{"before":"  },\n  containerCompact: {\n    minHeight: 52,\n    flexDirection: 'row',\n    alignItems: 'center',","after":"  },\n  containerCompact: {\n    minHeight: 56,\n    flexDirection: 'row',\n    alignItems: 'center',"},{"before":"  rosaryCompact: {\n    width: 38,\n    height: 51,\n  },\n  thread: {","after":"  rosaryCompact: {\n    width: 38,\n    height: 56,\n  },\n  thread: {"},{"before":"  },\n  pendantKnotCompact: {\n    top: 26,\n    left: 17.25,\n    width: 3.5,\n    height: 3.5,\n    borderRadius: 2,\n    borderWidth: 0.8,\n  },\n  pendantKnotLight: {\n    borderColor: '#F0CF92',\n    backgroundColor: '#F7DFB4',\n  },\n  // Pendant reduced from 16 to 8 layout pixels.\n  pendantLine: {\n    position: 'absolute',\n    top: 93,\n    left: 53,\n    width: 2,\n    height: 8,\n    backgroundColor: 'rgba(111, 71, 39, 0.72)',\n  },\n  pendantLineCompact: {\n    top: 29.5,\n    left: 18.5,\n    width: 1,\n    height: 4,\n  },\n  pendantLineLight: {","after":"  },\n  pendantKnotCompact: {\n    top: 25.5,\n    left: 17.6,\n    width: 2.8,\n    height: 2.8,\n    borderRadius: 1.5,\n    borderWidth: 0.7,\n  },\n  pendantKnotLight: {\n    borderColor: '#F0CF92',\n    backgroundColor: '#F7DFB4',\n  },\n  // Short pendant: 5px (full size) and 2.5px (compact).\n  pendantLine: {\n    position: 'absolute',\n    top: 93,\n    left: 53,\n    width: 2,\n    height: 5,\n    backgroundColor: 'rgba(111, 71, 39, 0.72)',\n  },\n  pendantLineCompact: {\n    top: 28.5,\n    left: 18.5,\n    width: 1,\n    height: 2.5,\n  },\n  pendantLineLight: {"},{"before":"  cross: {\n    position: 'absolute',\n    top: 101,\n    left: 43,\n    width: 22,\n    height: 28,\n  },\n  crossCompact: {\n    top: 33.5,\n    left: 13,\n    width: 12,\n    height: 15,\n  },\n  crossStem: {\n    position: 'absolute',\n    top: 0,\n    left: 10,\n    width: 2,\n    height: 25,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n  },\n  crossStemCompact: {\n    top: 0,\n    left: 5.25,\n    width: 1.5,\n    height: 12,\n  },\n  crossTopBar: {\n    position: 'absolute',\n    top: 4,\n    left: 7,\n    width: 8,\n    height: 2,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n  },\n  crossTopBarCompact: {\n    top: 2.5,\n    left: 4,\n    width: 4,\n    height: 1.5,\n  },\n  crossMiddleBar: {\n    position: 'absolute',\n    top: 11.5,\n    left: 2,\n    width: 18,\n    height: 2.5,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n  },\n  crossMiddleBarCompact: {\n    top: 5.5,\n    left: 1,\n    width: 10,\n    height: 1.5,\n  },\n  crossFootBar: {\n    position: 'absolute',\n    top: 19,\n    left: 4,\n    width: 14,\n    height: 2,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n    transform: [{rotate: '20deg'}],\n  },\n  crossFootBarCompact: {\n    top: 9.5,\n    left: 2,\n    width: 8,\n    height: 1.5,\n    transform: [{rotate: '20deg'}],\n  },\n  crossLight: {","after":"  cross: {\n    position: 'absolute',\n    top: 98,\n    left: 44,\n    width: 20,\n    height: 24,\n    overflow: 'visible',\n  },\n  crossCompact: {\n    top: 31,\n    left: 14,\n    width: 9,\n    height: 12,\n  },\n  crossStem: {\n    position: 'absolute',\n    top: 0,\n    left: 9,\n    width: 1.8,\n    height: 22,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n  },\n  crossStemCompact: {\n    top: 0,\n    left: 4.2,\n    width: 1,\n    height: 10,\n  },\n  crossTopBar: {\n    position: 'absolute',\n    top: 4,\n    left: 6.5,\n    width: 7,\n    height: 1.8,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n  },\n  crossTopBarCompact: {\n    top: 2.2,\n    left: 2.8,\n    width: 3.5,\n    height: 1,\n  },\n  crossMiddleBar: {\n    position: 'absolute',\n    top: 10.5,\n    left: 2.5,\n    width: 15,\n    height: 2,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n  },\n  crossMiddleBarCompact: {\n    top: 5,\n    left: 0.5,\n    width: 7,\n    height: 1.2,\n  },\n  crossFootBar: {\n    position: 'absolute',\n    top: 17,\n    left: 5,\n    width: 10,\n    height: 1.8,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n    transform: [{rotate: '14deg'}],\n  },\n  crossFootBarCompact: {\n    top: 8,\n    left: 1.5,\n    width: 5.5,\n    height: 1.2,\n    transform: [{rotate: '14deg'}],\n  },\n  crossLight: {"}];
const original = fs.readFileSync(file,'utf8');
let updated = original.replace(/\r\n/g,'\n');
for(const [i,h] of hunks.entries()) {
  const installed = updated.split(h.after).length - 1;
  const current = updated.split(h.before).length - 1;
  if(installed===1)continue;
  if(installed===0 && current===1)updated=updated.replace(h.before,h.after);
  else throw Error('PrayerBeadsLoader.js has local differences near change ' +
    (i+1) + '. No changes were written. Send the message for a safe merge.');
}
updated=updated.replace(/\n/g, original.includes('\r\n')?'\r\n':'\n');
if(updated===original) {
  console.log('PASS: refined crosses and shorter cords already installed.');
  process.exit(0);
}
const backupDir=path.resolve(root,'..','build-backups',
 'prayer-beads-cross-adjust-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
const backup=path.join(backupDir,'PrayerBeadsLoader.js');
fs.copyFileSync(file,backup);
try{fs.writeFileSync(file,updated,'utf8')}
catch(e){fs.writeFileSync(file,original,'utf8');throw e}
console.log('PASS: refined large and compact crosses, shorter cords, no clipping.');
console.log('Backup:',backup);
