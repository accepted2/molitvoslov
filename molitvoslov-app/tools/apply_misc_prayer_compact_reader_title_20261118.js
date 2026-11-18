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
   // Local versions may already have titleHyphenation or other changes.
   // Keep the entire existing header implementation, including its title
   // height formula: only gate it for the new explicit opt-in.
   const headerStart=source.indexOf('export const FixedSectionHeader');
   const headerOpen=source.indexOf('({',headerStart);
   const headerEnd=source.indexOf('}) =>',headerOpen);
   if(headerStart<0 || headerOpen<0 || headerEnd<0)
      throw Error(this.file+': cannot locate component props. NO FILES MODIFIED.');
   let out=source;
   const props=out.slice(headerOpen,headerEnd);
   if(!/\bsingleLineTitle\s*=/.test(props)){
     const matches=[...props.matchAll(/\btitleTextStyle\s*=\s*null\s*,/g)];
     if(matches.length!==1)
       throw Error(this.file+': cannot locate one titleTextStyle prop. NO FILES MODIFIED.');
     out=out.slice(0,headerOpen)+props.replace(matches[0][0],
       matches[0][0]+'\n  singleLineTitle = false, // '+tag)+out.slice(headerEnd);
   }
   // Replace only the declaration's expression. It can differ in the local
   // reader since header spacing has undergone several independent edits.
   const heightPattern=/(\bconst\s+extraTitleHeight\s*=\s*)([\s\S]{1,900}?)(;)/g;
   const heights=[...out.matchAll(heightPattern)];
   if(heights.length!==1){
     console.error('Expected one extraTitleHeight declaration, found '+heights.length);
     console.error(out.split('\n').filter(l=>l.includes('extraTitleHeight')).slice(0,6).join('\n'));
     throw Error(this.file+': cannot identify header height calculation. NO FILES MODIFIED.');
   }
   const height=heights[0];
   if(!height[2].includes('singleLineTitle')){
     const newHeight='singleLineTitle ? 0 : ('+height[2].trim()+')';
     out=out.slice(0,height.index)+height[1]+newHeight+height[3]+
       out.slice(height.index+height[0].length);
   }
   // Find the one title text belonging to the reading header; other Text
   // components (language dropdown, menu, back arrow) remain untouched.
   const stylePattern=/\bstyle\s*=\s*\{\[\s*styles\.title\s*,\s*styles\.titleFlex\b/g;
   const styles=[...out.matchAll(stylePattern)];
   if(styles.length!==1){
      throw Error(this.file+': cannot identify unique reading-title Text. NO FILES MODIFIED.');
   }
   const styleIndex=styles[0].index;
   const start=out.lastIndexOf('<Text',styleIndex);
   if(start<0 || styleIndex-start>700 || out.slice(start,styleIndex).includes('>') ||
       out.slice(start,styleIndex).includes('</Text')){
     throw Error(this.file+': reading-title Text structure differs. NO FILES MODIFIED.');
   }
   let tagOpen=out.slice(start,styleIndex);
   if(!/\bnumberOfLines\s*=/.test(tagOpen)){
      tagOpen=tagOpen.replace('<Text','<Text\n                  numberOfLines={singleLineTitle ? 1 : undefined}');
   }else if(!tagOpen.includes('singleLineTitle')){
      const linePattern=/\bnumberOfLines\s*=\s*\{([^{}]+)\}/;
      const m=tagOpen.match(linePattern);
      if(!m)throw Error(this.file+': existing numberOfLines cannot be safely extended. NO FILES MODIFIED.');
      tagOpen=tagOpen.replace(m[0],'numberOfLines={singleLineTitle ? 1 : ('+m[1]+')}');
   }
   if(!/\bellipsizeMode\s*=/.test(tagOpen))
      tagOpen=tagOpen.replace('<Text','<Text\n                  ellipsizeMode="tail"');
   if(!/\baccessibilityLabel\s*=/.test(tagOpen))
      tagOpen=tagOpen.replace('<Text','<Text\n                  accessibilityLabel={title}');
   out=out.slice(0,start)+tagOpen+out.slice(styleIndex);
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
