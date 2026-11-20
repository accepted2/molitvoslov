#!/usr/bin/env node
'use strict';
// Read-only full 58-Akathist audit of the exact WebView first-word rule.
// Report is written to reports; source prayers, bookmarks and WebView are
// never modified. Inspect ambiguous formulas rather than coloring blindly.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const corpus=JSON.parse(fs.readFileSync(path.join(app,'src/data/offlineContent.json'),'utf8')
  .replace(/^\uFEFF/u,''));
const runtime=fs.readFileSync(path.join(app,'src/components/reader/selectableDocumentReader/runtime.js'),'utf8');
if(!runtime.includes('MOLITVOSLOV_AKATHIST_FIRST_WORD_RESPONSE_V1'))
 throw Error('Run the first-word patch before the full Akathist audit.');
const take=(a,b)=>{
 const x=runtime.indexOf(a),y=runtime.indexOf(b,x);
 if(x<0||y<=x)throw Error('WebView helper anchors differ: '+a);
 return runtime.slice(x,y);
};
const helpers=new Function(
 take('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
 '\n'+take('const collectAkathistWordRanges = (value, pattern',
  'const collectPsalterPrayerAccentRanges = value =>')+
 '\nreturn {ranges:collectAkathistRefrainRanges,'+
 'breaks:collectAkathistJoyBreaks,'+
 'initials:collectAkathistInitialRanges,'+
 'repeated:collectAkathistRepeatedOpeningRanges,'+
 'jesus:collectAkathistWordRanges};'
)();
const normalize=value=>{
 let source=String(value||'').replace(/\r\n/g,'\n')
  .replace(/\u00ad/g,'').replace(/\u200b/g,'');
 const notes=source.match(/(?:^|\n)\s*Примечани(?:е|я)\s*(?=\n|$)/iu);
 if(notes&&notes.index!==undefined)source=source.slice(0,notes.index);
 const lines=source.split('\n'),output=[];
 for(let index=0;index<lines.length;index++){
  const current=lines[index].trim();
  if(!current)continue;
  const lettersOnly=current.normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'').replace(/[^А-Яа-яЁё]/g,'');
  const next=lines[index+1]?.trim()||'';
  if(lettersOnly.length>0&&lettersOnly.length<=2&&next&&
    /^[А-Яа-яЁё\u0300-\u036f]/u.test(next)){
    output.push(current+next);index++;
  }else output.push(current);
 }
 return output.join('\n').replace(/\n{2,}/g,'\n').trim();
};
const data=Object.entries(corpus.akathists?.by_slug||{});
if(data.length<1)throw Error('Offline content has no Akathists.');
const fields=[['content','church'],['traditional_content','traditional'],
 ['translation','russian'],['translation_uk','ukrainian']];
const summary={
 akathists:data.length,ikosSections:0,firstKontakionSections:0,
 languageTexts:0,redFirstWords:0,visualNewLines:0,sourceNewLinesRetained:0,
 specialResponses:0,plainJesusWords:0,redJesusWords:0,
 noDuplicateLineBreaks:true,noOverlappingWordRanges:true,
 premudrostIkos4And6Checked:0,ambiguousSingleResponses:0
};
const byAkathist=[],issues=[];
const sample=(source,at)=>source.slice(Math.max(0,at-55),
 Math.min(source.length,at+100)).replace(/\n/g,' ⏎ ');
for(const [slug,akathist] of data){
 const item={slug,title:akathist.title||slug,languageTexts:0,redFirstWords:0,
  addedNewLines:0,specialResponseWords:0};
 const premudrost=slug==='akafist-premudrosti-slova-bozhija';
 for(const section of akathist.sections||[]){
  const ikos=section.section_type==='ikos';
  const kontakion1=section.section_type==='kontakion'&&Number(section.number)===1;
  if(!ikos&&!kontakion1)continue;
  if(ikos)summary.ikosSections++;else summary.firstKontakionSections++;
  for(const [field,language] of fields){
   const source=normalize(section.text?.[field]);
   if(!source)continue;
   summary.languageTexts++;item.languageTexts++;
   const ranges=helpers.ranges(source,ikos),breaks=[...helpers.breaks(source,ikos)];
   const specials=helpers.repeated(source);
   summary.specialResponses+=specials.length;item.specialResponseWords+=specials.length;
   summary.redFirstWords+=ranges.length;item.redFirstWords+=ranges.length;
   summary.visualNewLines+=breaks.length;item.addedNewLines+=breaks.length;
   for(let index=0;index<ranges.length;index++){
    const range=ranges[index],red=source.slice(range.start,range.end);
    if(!red||/[\s,;:!?]/u.test(red)||range.start<0||range.end>source.length)
     throw Error('Red span is not exactly one word in '+slug+' '+language+' '+section.number+
       ': '+JSON.stringify(red));
    if(index && range.start<ranges[index-1].end){
     summary.noOverlappingWordRanges=false;
     throw Error('Overlapping red words in '+slug+' '+language+' '+section.number);
    }
    if(/[\r\n][ \t]*$/u.test(source.slice(0,range.start)))
     summary.sourceNewLinesRetained++;
   }
   for(const offset of breaks){
    if(!ranges.some(range=>range.start===offset))
     throw Error('Line break without acclamation: '+slug+' '+section.number);
    if(/[\r\n][ \t]*$/u.test(source.slice(0,offset))){
     summary.noDuplicateLineBreaks=false;
     throw Error('Duplicate line break in '+slug+' '+section.number);
    }
   }
   const words=helpers.jesus(source,/(?:Иисусе|Іисусе|Исусе)/giu);
   for(const word of words){
    if(ranges.some(range=>word.start>=range.start&&word.start<range.end))
     summary.redJesusWords++;
    else summary.plainJesusWords++;
    if(premudrost&&ikos&&[4,6].includes(Number(section.number))){
     summary.premudrostIkos4And6Checked++;
     const incorrect=ranges.some(range=>word.start>=range.start&&word.start<range.end);
     if(incorrect)throw Error('Premudrost Ikos '+section.number+
       ': Иисусе is still colored inside prose');
     if(issues.length<100)issues.push({kind:'verified-prose-jesus-normal',slug,
       ikos:section.number,language,context:sample(source,word.start)});
    }
   }
   // Report possible unclassified liturgical formulas for manual
   // review. Do NOT automatically highlight ordinary speech after ":".
   const maybe=/:([ \t\n]*)([\p{Lu}][\p{L}\p{M} \t-]{2,49}),/gu;
   const coloredStarts=new Set(ranges.map(range=>range.start));
   for(const match of source.matchAll(maybe)){
    const start=match.index+1+match[1].length;
    if(coloredStarts.has(start))continue;
    summary.ambiguousSingleResponses++;
    if(issues.length<100)issues.push({kind:'potential-unclassified-after-colon',
      slug,ikos:section.number,language,context:sample(source,start)});
   }
  }
 }
 byAkathist.push(item);
}
const report={generatedAt:new Date().toISOString(),summary,
 byAkathist:byAkathist.sort((a,b)=>b.redFirstWords-a.redFirstWords),
 issues,
 reviewNote:'Ambiguous cases are not automatically colored; editorial review is required.'};
const target=path.join(app,'reports','akathist-first-word-layout-audit-20261120.json');
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n','utf8');
console.log('AKATHISTS:',summary.akathists,
 'IKOS:',summary.ikosSections,'KONTAKION 1:',summary.firstKontakionSections);
console.log('LANGUAGE TEXTS:',summary.languageTexts,
 'FIRST WORDS RED:',summary.redFirstWords);
console.log('NEW LINE BREAKS:',summary.visualNewLines,
 'ORIGINAL LINE BREAKS PRESERVED:',summary.sourceNewLinesRetained);
console.log('REPEATED SPECIAL RESPONSE MATCHES:',summary.specialResponses);
console.log('JESUS TOKENS: RED',summary.redJesusWords,'NORMAL',summary.plainJesusWords);
console.log('PREMUDROST IKOS 4/6 PROSE TOKENS VERIFIED:',
 summary.premudrostIkos4And6Checked);
console.log('UNCERTAIN AFTER-COLON FORMULAS FOR REVIEW:',
 summary.ambiguousSingleResponses);
console.log('REPORT:',target);
console.log('SOURCE TEXTS MODIFIED: NO');
