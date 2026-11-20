#!/usr/bin/env node
'use strict';
// Fix screenshot-confirmed duplicate dividers and the first opening reader
// response in the THIRD Hour, with First Hour typography preserved.
// Source prayer sentences/words, Psalm text, section order, stable row IDs,
// stored bookmarks, reader theme, and other service Hours stay unchanged.
// Requires prior Third-Hour editorial patch; --dry-run is non-writing.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const paths={
 data:path.join(app,'src/data/hoursThirdHourEditorial.json'),
 doc:path.join(app,'src/services/hoursDocument.js'),
 oldTest:path.join(app,'tools/test_hours_third_hour.js'),
 newTest:path.join(app,'tools/test_hours_third_match_first_20261120.js'),
};
const marker='MOLITVOSLOV_THIRD_HOUR_AMEN_GLORY_SPLIT_V1';
const all=Object.entries(paths).map(([key,file])=>({
 key,file,original:fs.readFileSync(file,'utf8')
}));
const data=all.find(x=>x.key==='data');
const doc=all.find(x=>x.key==='doc');
const parsed=JSON.parse(data.original.replace(/^\uFEFF/u,''));
if(parsed.displayCorrectionsVersion===marker && doc.original.includes(marker)){
 console.log('PASS: Third Hour Amen/Glory and divider cleanup already installed.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
if(parsed.displayCorrectionsVersion===marker || doc.original.includes(marker))
 throw Error('Partial prior patch found. NO FILES MODIFIED.');
if(parsed.presentationVersion!=='MOLITVOSLOV_THIRD_HOUR_FIRST_HOUR_PRESENTATION_20261120_V1')
 throw Error('Apply the previous Third Hour First Hour typography patch before this one. NO FILES MODIFIED.');
if(parsed.entryId!=='ordinary-3' || parsed.sections.length!==13 ||
   parsed.sections[0].rows.length!==16)
 throw Error('Third Hour source structure has changed. NO FILES MODIFIED.');
const snapshot=JSON.stringify(parsed.sections.map(s=>s.rows.map(r=>[
 r.church??null,r.russian??null,r.traditional??null
])));
const reader=parsed.sections[0].rows[1];
if(reader.church!=='Чтец: Аминь. Слава Тебе, Боже наш, слава Тебе.' ||
   reader.displaySplitAfter!==undefined)
 throw Error('Opening Chtec Amen/Glory text differs. NO FILES MODIFIED.');
reader.displaySplitAfter='Чтец: Аминь.';
const removeExisting=(object,key,expect,desc)=>{
 if(object[key]!==expect)
  throw Error('Unexpected '+desc+' metadata: '+String(object[key])+'. NO FILES MODIFIED.');
 delete object[key];
};
// Each screenshot double-rule came from *both* a row border and a
// neighboring section border. Keep just the section border.
removeExisting(parsed.sections[8].rows[0],'dividerAfter',true,
  'prayer immediately before Trisagion');
removeExisting(parsed.sections[9].rows[0],'dividerAfter',true,
  'Trisagion to Kondak caption');
// The previous patch added a top border to the prayer that already follows
// the collapsible section's bottom border: keep only the latter.
removeExisting(parsed.sections[11],'dividerBefore',true,
  'after-fasting-dropdown prayer');
if(JSON.stringify(parsed.sections.map(s=>s.rows.map(r=>[
 r.church??null,r.russian??null,r.traditional??null
])))!==snapshot)
 throw Error('An original prayer sentence was changed. NO FILES MODIFIED.');
parsed.displayCorrectionsVersion=marker;
const replaceOnce=(file,oldPart,newPart,desc)=>{
 const normalized=file.original.replace(/\r\n/g,'\n');
 const count=normalized.split(oldPart).length-1;
 if(count!==1)
  throw Error(desc+' anchor missing or changed ('+count+'). NO FILES MODIFIED.');
 file.revised=normalized.replace(oldPart,newPart);
};
// Insert extra *rendered* row before existing push, without editing
// original indexes. The original Church Slavonic block id is retained.
replaceOnce(doc,"      if (blocks.length) rows.push({","      // MOLITVOSLOV_THIRD_HOUR_AMEN_GLORY_SPLIT_V1\n      // Split ONE displayed Third-Hour reader response without adding a\n      // row to the source JSON. Existing row/anchor IDs stay unchanged.\n      // The second visual paragraph receives a new unused local row ID.\n      if (isThirdHour && sectionIndex === 0 && rowIndex === 1 &&\n          row.displaySplitAfter === 'Чтец: Аминь.' && blocks.length === 1 &&\n          blocks[0].text.startsWith(row.displaySplitAfter + ' ')) {\n        const originalBlock = blocks[0];\n        const firstText = row.displaySplitAfter;\n        const secondText = originalBlock.text.slice(firstText.length).trim();\n        if (!/^Слава Тебе, Боже наш, слава Тебе\\.$/u.test(secondText)) {\n          throw new Error('Third Hour Amen/Glory response differs from its editorial cue');\n        }\n        const readerAmenBlock = {\n          ...originalBlock,\n          text: firstText,\n          hoursMarks: originalBlock.hoursMarks\n            .filter(mark => mark.start >= 0 && mark.end <= firstText.length),\n        };\n        const standaloneGlory = createBlock({\n          id: id + 6, language: 'church', text: secondText, title,\n          sectionKind, opening: false, redInitial: true,\n        });\n        // Each line is a separate reader row, so the divider is real.\n        // Existing saved row IDs (id+1) and every later row are preserved.\n        rows.push({layout: 'stack', blocks: [readerAmenBlock], dividerAfter: true});\n        rows.push({\n          layout: 'stack', blocks: [standaloneGlory],\n          dividerAfter: row.dividerAfter === true,\n        });\n        continue;\n      }\n"+__DOC_ANCHOR__,
 'Third Hour reader row rendering');
const updates={"oldTest":[["[[0,11,'12'],[4,2,'Трижды'],[11,0,'40'],[11,2,'Трижды']]","[[0,12,'12'],[4,2,'Трижды'],[11,0,'40'],[11,2,'Трижды']]"],["marks(0,9,'speaker')","marks(0,10,'speaker')"]],"newTest":[["assert.equal(third.sections[11].dividerBefore,true,","assert.equal(third.sections[11].dividerBefore,undefined,"],["[[0,6],[0,11],[4,2],[11,0],[11,2]]","[[0,7],[0,12],[4,2],[11,0],[11,2]]"],["assert.equal(rendered.sections[11].className.includes('hours-divider-before'),true);","assert.equal(rendered.sections[11].className.includes('hours-divider-before'),false);"]]};
for(const [key, replacements] of Object.entries(updates)){
 const file=all.find(x=>x.key===key);
 let revised=file.original.replace(/\r\n/g,'\n');
 for(const [a,b] of replacements){
  if(revised.split(a).length!==2)
   throw Error('Existing Hours regression differs: '+key+'. NO FILES MODIFIED.');
  revised=revised.replace(a,b);
 }
 file.revised=revised;
}
for(const file of all.filter(x=>x.key!=='data')){
 parse(file.revised,{sourceType:'module',plugins:['jsx']});
}
const oldEol=data.original.includes('\r\n')?'\r\n':'\n';
data.revised=JSON.stringify(parsed,null,2)+'\n';
if(oldEol==='\r\n')data.revised=data.revised.replace(/\n/g,'\r\n');
if(data.original.startsWith('\uFEFF'))data.revised='\uFEFF'+data.revised;
for(const file of all.filter(x=>x.key!=='data')){
 if(file.original.includes('\r\n'))file.revised=file.revised.replace(/\n/g,'\r\n');
 if(file.original.startsWith('\uFEFF'))file.revised='\uFEFF'+file.revised;
}
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: three unnecessary dividers removed from Third Hour.');
 console.log('DRY RUN PASS: Chtec Amen and Slava Tebe split with one real divider.');
 console.log('DRY RUN PASS: all existing row anchors and source prayers preserved.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups','hours-third-dividers-amen-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const file of all)fs.copyFileSync(file.file,path.join(backup,path.basename(file.file)));
for(const file of all)fs.writeFileSync(file.file,file.revised,'utf8');
console.log('PASS: duplicate dividers removed; Chtec Amen/Slava Tebe split in the reader.');
console.log('PASS: Third Hour text and existing reader anchors unchanged.');
console.log('BACKUP:',backup);
