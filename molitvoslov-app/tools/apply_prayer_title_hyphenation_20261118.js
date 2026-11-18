#!/usr/bin/env node
'use strict';
// Automatic word hyphenation in prayer/category titles on Android, without
// changing prayer text, slugs, bookmarks or saved content.
// Scope CSS to standalone prayers, not Psalter, Bible, canons or hours.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const specs=[
 {file:'src/screens/MiscPrayersScreen.js',transform:(source)=>{
   if(source.includes('MOLITVOSLOV_PRAYER_TITLE_HYPHENATION_V1'))return source;
   const plain='<Text style={styles.cardTitle}>{title}</Text>';
   const styled='<Text style={[styles.cardTitle, isCategory && styles.categoryTitle]}>{title}</Text>';
   const old=[plain,styled].filter(s=>source.includes(s));
   if(old.length!==1)throw Error('MiscPrayersScreen: cannot identify title Text. NO FILES MODIFIED.');
   const replacement=[
    '{/* MOLITVOSLOV_PRAYER_TITLE_HYPHENATION_V1 */}',
    '<Text',
    '  android_hyphenationFrequency="full"',
    '  textBreakStrategy="highQuality"',
    '  style={[styles.cardTitle, isCategory && styles.categoryTitle, title.length > 68 && styles.compactLongTitle]}',
    '>{title}</Text>',
   ].join('\n                      ');
   let next=source.replace(old[0],replacement);
   const css='  cardTitle: {';
   if(next.split(css).length!==2)throw Error('MiscPrayersScreen: cardTitle styling not unique. NO FILES MODIFIED.');
   next=next.replace(css,'  compactLongTitle: {fontSize: 16, lineHeight: 21},\n\n'+css);
   return next;
 }},
 {file:'src/components/navigation/FixedSectionHeader.js',transform:source=>{
   if(source.includes('titleHyphenation = false,'))return source;
   const prop='  titleTextStyle = null,';
   const marker='                  onTextLayout={(event) => {';
   if(source.split(prop).length!==2 || source.split(marker).length!==2) {
     throw Error('FixedSectionHeader: title declaration changed. NO FILES MODIFIED.');
   }
   let next=source.replace(prop,prop+'\n  titleHyphenation = false,');
   next=next.replace(marker,
     '                  android_hyphenationFrequency={titleHyphenation ? "full" : undefined}\n'+
     '                  textBreakStrategy={titleHyphenation ? "highQuality" : undefined}\n'+
     marker);
   return next;
 }},
 {file:'src/components/reader/selectableDocumentReader/styles.js',transform:source=>{
   if(source.includes('MOLITVOSLOV_STANDALONE_PRAYER_HYPHENATION_V1'))return source;
   const ending='  '+String.fromCharCode(96)+';';
   if(!source.endsWith(ending+'\n') && !source.endsWith(ending)) {
     throw Error('Reader CSS ending changed. NO FILES MODIFIED.');
   }
   const css=[
    '    /* MOLITVOSLOV_STANDALONE_PRAYER_HYPHENATION_V1 */',
    '    /* Only standalone prayers receive automatic hyphenation. */',
    '    html[lang="ru"] body:not(.book-mode) #reader.standalone-prayer .document-header .rule-title {',
    '      -webkit-hyphens: auto;',
    '      hyphens: auto;',
    '      overflow-wrap: break-word;',
    '      word-break: normal;',
    '    }',
   ].join('\n');
   return source.replace(/  \x60;\s*$/,css+'\n'+ending+'\n');
 }},
];
const updates=[];
for(const spec of specs){
 const file=path.join(root,spec.file),raw=fs.readFileSync(file,'utf8');
 const bom=raw.startsWith('\uFEFF')?'\uFEFF':'',before=raw.slice(bom.length).replace(/\r\n/g,'\n');
 let after=spec.transform(before);
 parse(after,{sourceType:'module',plugins:['jsx']});
 if(raw.includes('\r\n'))after=after.replace(/\n/g,'\r\n');
 if(raw!==bom+after)updates.push({file,rel:spec.file,before:raw,after:bom+after});
}
const miscFile=path.join(root,'src/screens/MiscPrayersScreen.js');
const miscUpdate=updates.find(u=>u.rel==='src/screens/MiscPrayersScreen.js');
const rawMisc=miscUpdate?.after||fs.readFileSync(miscFile,'utf8');
const needle='        <FixedSectionHeader onHeaderHeightChange={setHeaderHeight}';
if(!rawMisc.includes('titleHyphenation') && !rawMisc.includes(needle)) {
 throw Error('Misc header cannot be located. NO FILES MODIFIED.');
}
const enhanced=rawMisc.includes('titleHyphenation')?rawMisc:
 rawMisc.replace(needle,needle+'\n          titleHyphenation');
if(miscUpdate)miscUpdate.after=enhanced;
else if(rawMisc!==enhanced)updates.push({file:miscFile,rel:'src/screens/MiscPrayersScreen.js',
 before:fs.readFileSync(miscFile,'utf8'),after:enhanced});
for(const u of updates)parse(u.after,{sourceType:'module',plugins:['jsx']});
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS. NO FILES MODIFIED. Updates: '+updates.map(u=>u.rel).join(', '));
 process.exit(0);
}
if(!updates.length){console.log('PASS: prayer-title hyphenation already applied.');process.exit(0);}
const backupDir=path.resolve(root,'..','build-backups','prayer-title-hyphens-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
for(const u of updates)fs.copyFileSync(u.file,path.join(backupDir,u.rel.replace(/[\\/]/g,'__')));
const written=[];
try{for(const u of updates){fs.writeFileSync(u.file,u.after,'utf8');written.push(u);}}
catch(error){for(const u of written)fs.writeFileSync(u.file,u.before,'utf8');throw error;}
console.log('PASS: Android word hyphenation in prayer list + category header; standalone prayer title CSS.');
console.log('Backup: '+backupDir);
