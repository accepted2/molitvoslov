#!/usr/bin/env node
'use strict';
// Opt-in reader-title trial ONLY when a prayer is opened from MiscPrayers.
// Header: single-line tail ellipsis. Inside prayer: full text, left aligned,
// normal word wrapping/hyphenation, 26px -> 24.5px font.
// No source texts, personal saved items, or other reader types are changed.
const fs=require('node:fs'),path=require('node:path');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const tag='MOLITVOSLOV_MISC_PRAYER_COMPACT_TITLE_V1';
const specs=[
 {
  file:'src/screens/MiscPrayersScreen.js',
  change(source){
   const before="    navigation.push('Reader', {\n      slug: text.slug,\n    });";
   const after="    navigation.push('Reader', {\n      slug: text.slug,\n      miscPrayerCompactTitle: true, // "+tag+"\n    });";
   return replaceOne(source,before,after,this.file);
  }
 },
 {
  file:'src/screens/ReaderScreen.js',
  change(source){
   let out=replaceOne(source,
     '  const {slug, focusTarget = null} = route.params;',
     '  const {slug, focusTarget = null, miscPrayerCompactTitle = false} = route.params;',
     this.file);
   const anchor='    return {\n      title: getLocalizedTextTitle(text, language) || t(\'common.reading\'),';
   const withPresentation='    return {\n      presentation: \'standalone-prayer\',\n      title: getLocalizedTextTitle(text, language) || t(\'common.reading\'),';
   if(out.includes(anchor)){
    out=replaceOne(out,anchor,
      "    return {\n      miscPrayerCompactTitle: !!miscPrayerCompactTitle, // "+tag+"\n"+
      "      title: getLocalizedTextTitle(text, language) || t('common.reading'),",
      this.file);
   }else if(out.includes(withPresentation)){
    out=replaceOne(out,withPresentation,
      "    return {\n      miscPrayerCompactTitle: !!miscPrayerCompactTitle, // "+tag+"\n"+
      "      presentation: 'standalone-prayer',\n"+
      "      title: getLocalizedTextTitle(text, language) || t('common.reading'),",
      this.file);
   }else{
    throw Error(this.file+': document-data title block differs. NO FILES MODIFIED.');
   }
   out=replaceOne(out,
     '    slug,\n    text,\n    viewMode,\n    t,\n  ]);',
     '    slug,\n    text,\n    viewMode,\n    miscPrayerCompactTitle,\n    t,\n  ]);',
     this.file);
   out=replaceOne(out,
     '        compactReading\n        readingHidden={readingChromeHidden}',
     '        compactReading\n        singleLineTitle={miscPrayerCompactTitle}\n        readingHidden={readingChromeHidden}',
     this.file);
   return out;
  }
 },
 {
  file:'src/components/navigation/FixedSectionHeader.js',
  change(source){
   let out=replaceOne(source,
     '  titleTextStyle = null,\n',
     '  titleTextStyle = null,\n  singleLineTitle = false, // '+tag+'\n',
     this.file);
   out=replaceOne(out,
     'const extraTitleHeight = showTitle ? Math.max(0, titleLines - 1)',
     'const extraTitleHeight = showTitle && !singleLineTitle ? Math.max(0, titleLines - 1)',
     this.file);
   const anchor='                <Text\n                  style={[styles.title, styles.titleFlex,';
   out=replaceOne(out,anchor,
     '                <Text\n                  numberOfLines={singleLineTitle ? 1 : undefined}\n'+
     '                  ellipsizeMode="tail"\n'+
     '                  accessibilityLabel={title}\n'+
     '                  style={[styles.title, styles.titleFlex,',
     this.file);
   return out;
  }
 },
 {
  file:'src/components/reader/selectableDocumentReader/runtime.js',
  change(source){
   const anchor="    const renderDocument = () => {\n";
   const extra="      reader.classList.toggle('misc-prayer-compact-title', DATA.document.miscPrayerCompactTitle === true); // "+tag+"\n";
   return replaceOne(source,anchor,anchor+extra,this.file);
  }
 },
 {
  file:'src/components/reader/selectableDocumentReader/styles.js',
  change(source){
   const css=[
    '    /* '+tag+' */',
    '    /* Only prayers launched from MiscPrayers: keep the complete heading. */',
    '    body:not(.book-mode) #reader.misc-prayer-compact-title .document-header .rule-title,',
    '    body:not(.book-mode) #reader.misc-prayer-compact-title .document-header.has-reader-action-menu .rule-title {',
    '      display: block;',
    '      width: 100%;',
    '      min-width: 0;',
    '      font-size: 24.5px;',
    '      line-height: 30px;',
    '      text-align: left !important;',
    '      text-align-last: left !important;',
    '      padding-left: 0 !important;',
    '      padding-right: 48px !important;',
    '      white-space: normal;',
    '      hyphens: auto;',
    '      -webkit-hyphens: auto;',
    '      overflow-wrap: break-word;',
    '      word-break: normal;',
    '    }',
    '    body:not(.book-mode) #reader.misc-prayer-compact-title .document-header.has-reader-action-menu .reader-action-container {',
    '      left: auto;',
    '      right: 0;',
    '    }',
   ].join('\n');
   const end='  '+String.fromCharCode(96)+';';
   if(!source.endsWith(end+'\n')&&!source.endsWith(end))
      throw Error(this.file+': CSS template ending differs. NO FILES MODIFIED.');
   return source.replace(/  \x60;\s*$/,css+'\n'+end+'\n');
  }
 },
 {
  file:'src/screens/MiscPrayerPlaceholderScreen.js',
  change(source){
   let out=replaceOne(source,
      '<Text style={styles.title}>{title}</Text>',
      '<Text style={styles.title} android_hyphenationFrequency="full" textBreakStrategy="highQuality">{title}</Text> {/* '+tag+' */}',
      this.file);
   const anchor="  title: {\n    marginTop: 24,";
   out=replaceOne(out,anchor,"  title: {\n    marginTop: 24,",this.file,true);
   // The replacement of individual declaration values is anchored to title only.
   const start=out.indexOf('  title: {\n    marginTop: 24,');
   const end=out.indexOf('\n  },',start);
   if(start<0||end<0)throw Error(this.file+': title style differs. NO FILES MODIFIED.');
   let block=out.slice(start,end);
   if(!block.includes("fontSize: 24")||!block.includes("textAlign: 'center'"))
      throw Error(this.file+': title typography differs. NO FILES MODIFIED.');
   block=block.replace('fontSize: 24','fontSize: 22.5')
     .replace('lineHeight: 30','lineHeight: 28.5')
     .replace("textAlign: 'center'","textAlign: 'left'");
   return out.slice(0,start)+block+out.slice(end);
  }
 },
];
function replaceOne(source,oldText,newText,file,allowNoop=false){
 const count=source.split(oldText).length-1;
 if(count!==1)throw Error(file+': expected unique local code fragment, found '+count+'. NO FILES MODIFIED.');
 return allowNoop ? source : source.replace(oldText,newText);
}
const updates=[];
for(const spec of specs){
 const file=path.join(root,spec.file),raw=fs.readFileSync(file,'utf8');
 const bom=raw.startsWith('\uFEFF')?'\uFEFF':'';
 let source=raw.slice(bom.length).replace(/\r\n/g,'\n');
 if(source.includes(tag)){
   console.log('ALREADY APPLIED: '+spec.file);
   continue;
 }
 source=spec.change(source);
 parse(source,{sourceType:'module',plugins:['jsx']});
 let updated=bom+source;
 if(raw.includes('\r\n'))updated=updated.replace(/\n/g,'\r\n');
 if(updated!==raw)updates.push({file,relative:spec.file,before:raw,after:updated});
}
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS. NO FILES MODIFIED.');
 console.log('Files ready: '+(updates.map(e=>e.relative).join(', ')||'none'));
 process.exit(0);
}
if(!updates.length){
 console.log('PASS: Misc Prayers title trial already installed.');
 process.exit(0);
}
const backupDir=path.resolve(root,'..','build-backups','misc-prayer-title-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
for(const entry of updates)
 fs.copyFileSync(entry.file,path.join(backupDir,entry.relative.replace(/[\\/]/g,'__')));
const written=[];
try{
 for(const entry of updates){fs.writeFileSync(entry.file,entry.after,'utf8');written.push(entry);}
}catch(error){
 for(const entry of written)fs.writeFileSync(entry.file,entry.before,'utf8');
 throw error;
}
console.log('PASS: Misc Prayers top title uses one-line ellipsis; full body title remains left-aligned and 1.5px smaller.');
console.log('Other reader screens remain unchanged. Backups: '+backupDir);
