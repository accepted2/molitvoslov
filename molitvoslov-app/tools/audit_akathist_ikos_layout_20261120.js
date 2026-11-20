#!/usr/bin/env node
'use strict';
// Read-only audit of every bundled Akathist's Ikos/Kontakion 1 in all source
// language variants. No offline JSON, source code or bookmark data modified.
// Reports ambiguous addresses after colons for manual editorial review.
const fs = require('node:fs');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
const content=JSON.parse(fs.readFileSync(path.join(root,'src/data/offlineContent.json'),'utf8').replace(/^\uFEFF/,''));
const runtime=fs.readFileSync(path.join(root,'src/components/reader/selectableDocumentReader/runtime.js'),'utf8');
const marker='MOLITVOSLOV_AKATHIST_IKOS_BOUNDARY_ACCENTS_V1';
if(!runtime.includes(marker))
 throw Error('Apply the Akathist typography fix before running the corpus audit.');
const extract=(start,end)=>{
 const a=runtime.indexOf(start),b=runtime.indexOf(end,a);
 if(a<0||b<a)throw Error('Runtime helper boundaries changed: '+start);
 return runtime.slice(a,b);
};
const code=extract('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
 '\n'+extract('const collectAkathistWordRanges = (value, pattern',
              'const collectPsalterPrayerAccentRanges = value =>');
const helpers=new Function(code+
 '\nreturn {ranges:collectAkathistRefrainRanges,breaks:collectAkathistJoyBreaks};')();
const normalize=value=>{
 let result=String(value||'').replace(/\r\n/g,'\n').replace(/\u00ad|\u200b/g,'');
 const notes=result.match(/(?:^|\n)\s*Примечани(?:е|я)\s*(?=\n|$)/iu);
 if(notes&&notes.index!==undefined)result=result.slice(0,notes.index);
 const lines=result.split('\n'),normalized=[];
 for(let i=0;i<lines.length;i++){
  const current=lines[i].trim();
  if(!current)continue;
  const letters=current.normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^А-Яа-яЁё]/g,'');
  const next=lines[i+1]?.trim()||'';
  if(letters.length>0&&letters.length<=2&&next&&
    /^[А-Яа-яЁё\u0300-\u036f]/u.test(next)){
    normalized.push(current+next);
    i++;
  }else{
    normalized.push(current);
  }
 }
 return normalized.join('\n').replace(/\n{2,}/g,'\n').trim();
};
const akathists=content.akathists?.by_slug||{};
const entries=Object.entries(akathists);
if(!entries.length)throw Error('No bundled Akathist records found. Cannot audit a missing corpus.');
const summary={
 totalAkathists:entries.length,visibleAkathists:0,ikosSections:0,kontakion1Sections:0,
 languageBlocks:0,redResponsePrefixes:0,generatedLineBreaks:0,
 sourceLineBreaksPreserved:0,potentialUnmatchedRefrains:0,
 unusualPostColonAddresses:0
};
const ambiguous=[],byAkathist=[];
const sourceFields=[['content','church'],['traditional_content','traditional'],
 ['translation','russian'],['translation_uk','ukrainian']];
const quotePreview=(text,at)=>{
 const first=Math.max(0,at-48);
 return text.slice(first,Math.min(text.length,at+110)).replace(/\n/g,' ⏎ ');
};
for(const [slug,akathist] of entries){
 if(akathist.is_visible!==false)summary.visibleAkathists++;
 const row={slug,title:akathist.title||slug,ikosBlocks:0,redPrefixes:0,
  softBreaks:0,ambiguousCases:0};
 for(const section of akathist.sections||[]){
  const isIkos=section.section_type==='ikos';
  const isFirstKontakion=section.section_type==='kontakion'&&Number(section.number)===1;
  if(!isIkos&&!isFirstKontakion)continue;
  if(isIkos)summary.ikosSections++;
  else summary.kontakion1Sections++;
  for(const [field,language] of sourceFields){
   const value=normalize(section.text?.[field]);
   if(!value)continue;
   summary.languageBlocks++;
   row.ikosBlocks++;
   const ranges=helpers.ranges(value,isIkos);
   const breaks=[...helpers.breaks(value,isIkos)];
   if(ranges.some((r,i)=>r.start<0||r.end>value.length||r.end<=r.start||
      (i&&r.start<ranges[i-1].end)))
    throw Error('Invalid overlap or UTF-16 range in '+slug+' '+language+' '+section.number);
   for(const range of ranges){
    if(!value.slice(range.start,range.end).trim())
      throw Error('Empty liturgical response range in '+slug);
    if(/[\r\n]/.test(value.slice(range.start,range.end)))
      throw Error('Response crosses a source line in '+slug);
    summary.redResponsePrefixes++;
    row.redPrefixes++;
    const before=value.slice(0,range.start);
    if(/[\r\n][ \t]*$/.test(before))summary.sourceLineBreaksPreserved++;
   }
   for(const off of breaks){
    if(/[\r\n][ \t]*$/.test(value.slice(0,off)))
      throw Error('Duplicate visual line break in '+slug+' '+language);
    summary.generatedLineBreaks++;
    row.softBreaks++;
   }
   // A known response word on an unsafe boundary is usually ordinary
   // prose or quotation. Log only if it occurs after ":" or ";" yet
   // the source was NOT colored, for a later editorial pass.
   const possible=/(?:^|[:;]\s*)((?:Радуйтеся|Радуйся|Радꙋйсѧ|Іисусе|Иисусе|Исусе|Прииди|Приди|Прийди))(?=[\s,;:.!?…]|$)/gimu;
   for(const match of value.matchAll(possible)){
    const start=(match.index||0)+match[0].lastIndexOf(match[1]);
    if(ranges.some(range=>range.start===start))continue;
    summary.potentialUnmatchedRefrains++;
    row.ambiguousCases++;
    if(ambiguous.length<180)ambiguous.push({
      kind:'known-invocation-not-colored',slug,language,section:section.number,
      context:quotePreview(value,start)
    });
   }
   // A comma-ended prefix after a colon may introduce an unusual
   // acclamation. It is deliberately NOT colored without confirmation.
   const colonCandidates=/:([ \t\n]*)([\p{Lu}][\p{L}\u0300-\u036f\u0483-\u0489 \t-]{2,49}),/gu;
   for(const match of value.matchAll(colonCandidates)){
    const start=(match.index||0)+1+match[1].length;
    if(ranges.some(range=>range.start===start))continue;
    summary.unusualPostColonAddresses++;
    row.ambiguousCases++;
    if(ambiguous.length<180)ambiguous.push({
      kind:'unclassified-prefix-after-colon',slug,language,section:section.number,
      context:quotePreview(value,start)
    });
   }
  }
 }
 byAkathist.push(row);
}
const report={
 createdAt:new Date().toISOString(),
 summary,
 byAkathist:byAkathist.sort((a,b)=>b.ambiguousCases-a.ambiguousCases),
 ambiguous,
 note:'Ambiguous examples are for manual review; the importer never edits original prayer words.'
};
const reportsDir=path.join(root,'reports');
fs.mkdirSync(reportsDir,{recursive:true});
const output=path.join(reportsDir,'akathist-ikos-typography-audit-20261120.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n','utf8');
console.log('AKATHISTS:',summary.totalAkathists,
 'visible:',summary.visibleAkathists);
console.log('IKOS SECTIONS:',summary.ikosSections,
 'KONTAKION 1:',summary.kontakion1Sections,
 'LANGUAGE BLOCKS:',summary.languageBlocks);
console.log('RED RESPONSE PREFIXES:',summary.redResponsePrefixes);
console.log('ADDED BREAKS:',summary.generatedLineBreaks,
 'ORIGINAL NEWLINES PRESERVED:',summary.sourceLineBreaksPreserved);
console.log('POTENTIALLY UNMATCHED:',summary.potentialUnmatchedRefrains,
 'UNCLASSIFIED AFTER COLON:',summary.unusualPostColonAddresses);
console.log('AUDIT REPORT:',output);
console.log('SOURCE TEXTS MODIFIED: NO');
