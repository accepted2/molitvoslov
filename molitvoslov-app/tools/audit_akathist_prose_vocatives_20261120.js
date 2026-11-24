#!/usr/bin/env node
'use strict';
// Read-only audit of ALL bundled Akathists and their language variants,
// verifying whether suspected vocatives in narrative remain normal ink.
// Writes an explanatory report; never edits source prayer data or reader code.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const input=JSON.parse(fs.readFileSync(path.join(app,'src/data/offlineContent.json'),'utf8')
  .replace(/^\uFEFF/u,''));
const runtime=fs.readFileSync(path.join(app,
 'src/components/reader/selectableDocumentReader/runtime.js'),'utf8');
if(!runtime.includes('MOLITVOSLOV_AKATHIST_PROSE_VOCATIVE_GUARD_V1'))
 throw Error('Apply the Ikos prose guard before running the audit.');
const between=(a,b)=>{
 const x=runtime.indexOf(a),y=runtime.indexOf(b,x);
 if(x<0||y<x)throw Error('Reader helper structure differs near '+a);
 return runtime.slice(x,y);
};
const helpers=new Function(
 between('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
 '\n'+between('const collectAkathistWordRanges = (value, pattern',
                   'const collectPsalterPrayerAccentRanges = value =>')+
 '\nreturn {invocation:collectAkathistInvocationRanges,'+
 'additional:collectAkathistAdditionalResponseRanges,'+
 'quotes:collectAkathistQuotedSpeechRanges,'+
 'boundary:isAkathistResponseBoundary,'+
 'refrains:collectAkathistRefrainRanges,'+
 'breaks:collectAkathistJoyBreaks,'+
 'word:collectAkathistWordRanges};')();
const akathists=Object.entries(input.akathists?.by_slug||{});
if(!akathists.length)throw Error('No bundled Akathists available for audit.');
const fields=[
 ['content','church'],
 ['traditional_content','traditional'],
 ['translation','russian'],
 ['translation_uk','ukrainian'],
];
const normalize=value=>{
 let result=String(value||'').replace(/\r\n/g,'\n').replace(/[\u00ad\u200b]/g,'');
 const m=result.match(/(?:^|\n)\s*Примечани(?:е|я)\s*(?=\n|$)/iu);
 if(m&&m.index!==undefined)result=result.slice(0,m.index);
 const lines=result.split('\n'),output=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();
  if(!line)continue;
  const letters=line.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
   .replace(/[^А-Яа-яЁё]/gu,'');
  const next=lines[i+1]?.trim()||'';
  if(letters.length>0&&letters.length<=2&&next&&
     /^[А-Яа-яЁё\u0300-\u036f]/u.test(next)){
   output.push(line+next);i++;
  }else output.push(line);
 }
 return output.join('\n').replace(/\n{2,}/gu,'\n').trim();
};
const preview=(source,start,end)=>source.slice(Math.max(0,start-58),Math.min(source.length,end+112))
 .replace(/[\r\n]/gu,' ↵ ');
const summary={
 akathists:akathists.length,ikosSections:0,languageTexts:0,
 originalBoundaryCandidates:0,actualRedResponses:0,
 suppressedMinorityCandidates:0,jesusWords:0,
 jesusWordsKeptNormal:0,jesusWordsColored:0,
 insertedBreaks:0,duplicateBreaks:0,
 specialAkathistProseExamples:0,
};
const examples=[],perAkathist=[];
for(const [slug,a] of akathists){
 let localScanned=0,localSuppressed=0,localJesusNormal=0;
 const focus=/премудрост[ьи]|слова божия/iu.test(a.title||'')||
   /premudrost|slova-bozh/iu.test(slug);
 for(const section of a.sections||[]){
  if(section.section_type!=='ikos')continue;
  summary.ikosSections++;
  for(const [field,lang] of fields){
   const source=normalize(section.text?.[field]);
   if(!source)continue;
   summary.languageTexts++;
   localScanned++;
   const quotes=helpers.quotes(source);
   const eligible=[
    ...helpers.invocation(source),...helpers.additional(source),
   ].filter(r=>
    helpers.boundary(source,r.start) &&
    !quotes.some(q=>r.start>=q.start&&r.start<q.end)
   );
   const final=helpers.refrains(source,true);
   const breaks=[...helpers.breaks(source,true)];
   const finalStarts=new Set(final.map(r=>r.start));
   const suppressed=eligible.filter(r=>!finalStarts.has(r.start));
   summary.originalBoundaryCandidates+=eligible.length;
   summary.actualRedResponses+=final.length;
   summary.suppressedMinorityCandidates+=suppressed.length;
   localSuppressed+=suppressed.length;
   for(const r of suppressed){
    if(examples.length<250 || focus){
     examples.push({
      akathist:slug,title:a.title,
      ikos:Number(section.number),language:lang,
      kind:'minority-invocation-not-red',
      word:source.slice(r.start,r.end),
      surroundingText:preview(source,r.start,r.end),
     });
    }
   }
   for(const offset of breaks){
    if(/[\r\n][ \t]*$/u.test(source.slice(0,offset))){
     summary.duplicateBreaks++;
     throw Error('Duplicate line break: '+slug+', ikos '+section.number);
    }
   }
   summary.insertedBreaks+=breaks.length;
   const jesus=helpers.word(source,/(?:Иисусе|Іисусе|Исусе)/giu);
   for(const r of jesus){
    summary.jesusWords++;
    const colored=final.some(x=>r.start>=x.start && r.start<x.end);
    if(colored)summary.jesusWordsColored++;
    else {summary.jesusWordsKeptNormal++;localJesusNormal++;}
    if(focus&&[4,6].includes(Number(section.number))){
     summary.specialAkathistProseExamples++;
     examples.push({
      akathist:slug,title:a.title,ikos:Number(section.number),
      language:lang,kind:colored?'ERROR_jesus_in_prose_colored':'correct_jesus_in_prose_normal',
      word:source.slice(r.start,r.end),surroundingText:preview(source,r.start,r.end),
     });
     if(colored)throw Error('False red Иисусе remains in '+slug+' Ikos '+section.number);
    }
   }
  }
 }
 perAkathist.push({slug,title:a.title||slug,languageTexts:localScanned,
  suppressedMinorityCandidates:localSuppressed,jesusWordsNormal:localJesusNormal});
}
const report={
 generatedAt:new Date().toISOString(),summary,
 byAkathist:perAkathist.sort((a,b)=>
  b.suppressedMinorityCandidates-a.suppressedMinorityCandidates),
 examples,
 explanation:'Suspicious lone invocations among other repeated refrains are kept normal. Review other unusual hymn variants manually.'
};
const output=path.join(app,'reports','akathist-prose-vocative-audit-20261120.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n','utf8');
console.log('AKATHISTS:',summary.akathists,'IKOS SECTIONS:',summary.ikosSections,
 'LANGUAGE TEXTS:',summary.languageTexts);
console.log('ORIGINAL CANDIDATES:',summary.originalBoundaryCandidates,
 'ACTUAL RED RESPONSES:',summary.actualRedResponses);
console.log('SUSPICIOUS VOCATIVES NOT COLORED:',summary.suppressedMinorityCandidates);
console.log('JESUS TOKENS: total',summary.jesusWords,
 'red',summary.jesusWordsColored,'normal',summary.jesusWordsKeptNormal);
console.log('PREMUDROST IKOS 4/6 MATCHES:',summary.specialAkathistProseExamples);
console.log('DUPLICATED LINE BREAKS:',summary.duplicateBreaks);
console.log('REPORT:',output);
console.log('SOURCE PRAYERS MODIFIED: NO');
