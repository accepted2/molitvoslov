#!/usr/bin/env node
'use strict';
// Read-only audit of the actual bundled Trinity Akathist, Ikos 1.
// Compare EVERY line-opening "Свят еси" / "Свят, Свят, Свят" with
// first-word red spans and visual/source breaks from the real WebView.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const content=JSON.parse(fs.readFileSync(path.join(app,'src/data/offlineContent.json'),'utf8').replace(/^\uFEFF/u,''));
const runtime=fs.readFileSync(path.join(app,'src/components/reader/selectableDocumentReader/runtime.js'),'utf8');
const slug='akafist-presvjatoj-i-zhivotvorjashhej-troice';
const akathist=content.akathists?.by_slug?.[slug];
if(!akathist)throw Error('Trinity Akathist not found in bundled content');
const ikos=(akathist.sections||[]).find(s=>s.section_type==='ikos'&&Number(s.number)===1);
if(!ikos)throw Error('Trinity Akathist Ikos 1 not found in bundled content');
if(!runtime.includes('MOLITVOSLOV_AKATHIST_SHARED_SVYAT_REFRAIN_V1'))
 throw Error('Apply the mixed-Svyat reader patch before the corpus audit.');
const take=(a,b)=>{
 const x=runtime.indexOf(a),y=runtime.indexOf(b,x);
 if(x<0||y<=x)throw Error('WebView function changed: '+a);
 return runtime.slice(x,y);
};
const r=new Function(
 take('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
 '\n'+take('const collectAkathistWordRanges = (value, pattern',
 'const collectPsalterPrayerAccentRanges = value =>')+
 '\nreturn {normalize:normalizedAkathistRefrainWithIndex,'+
 'red:collectAkathistRefrainRanges,breaks:collectAkathistJoyBreaks};'
)();
const normalizeText=value=>{
 let text=String(value||'').replace(/\r\n/g,'\n').replace(/[\u00ad\u200b]/g,'');
 const notes=text.match(/(?:^|\n)\s*Примечани(?:е|я)\s*(?=\n|$)/iu);
 if(notes&&notes.index!==undefined)text=text.slice(0,notes.index);
 const out=[],lines=text.split('\n');
 for(let i=0;i<lines.length;i++){
  const current=lines[i].trim();
  if(!current)continue;
  const letters=current.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^А-Яа-яЁё]/g,'');
  const next=lines[i+1]?.trim()||'';
  if(letters.length>0&&letters.length<=2&&next&&
     /^[А-Яа-яЁё\u0300-\u036f]/u.test(next)){
   out.push(current+next);i++;
  }else out.push(current);
 }
 return out.join('\n').replace(/\n{2,}/g,'\n').trim();
};
const variants=[['content','church'],['traditional_content','traditional'],
 ['translation','russian'],['translation_uk','ukrainian']];
const sections=[];let failures=0;
for(const [field,lang] of variants){
 const source=normalizeText(ikos.text?.[field]);
 if(!source)continue;
 const {normalized,originalIndex}=r.normalize(source);
 const pattern=/(?:^|[.!?…;:\n]\s*)(Свят(?:[ \t]*,[ \t]*Свят[ \t]*,[ \t]*Свят|[ \t]+еси))(?=[\s,;:.!?…]|$)/gimu;
 const expectations=[];
 for(const match of normalized.matchAll(pattern)){
  const startNorm=match.index+match[0].lastIndexOf(match[1]);
  const start=originalIndex[startNorm];
  if(Number.isFinite(start))expectations.push(start);
 }
 const actual=r.red(source,true);
 const starts=new Set(actual.map(p=>p.start));
 const breaks=new Set(r.breaks(source,true));
 const missing=expectations.filter(at=>!starts.has(at));
 const missingLines=expectations.filter(at=>at>0&&
  !breaks.has(at)&&!(/[\r\n][ \t]*$/u.test(source.slice(0,at))));
 const nonFirst=actual.filter(p=>expectations.includes(p.start)&&
  source.slice(p.start,p.end).normalize('NFD')
  .replace(/[\u0300-\u036f\u0483-\u0489]/gu,'').toLowerCase()!=='свят');
 failures+=missing.length+missingLines.length+nonFirst.length;
 sections.push({language:lang,expectedResponseLines:expectations.length,
  redFirstWords:actual.map(p=>source.slice(p.start,p.end)),
  missingRedStarts:missing,missingBreaks:missingLines,
  unrelatedRedStarts:nonFirst,
  sourceLineBreaks:expectations.length-[...breaks].length,
  insertedBreaks:breaks.size});
}
if(!sections.some(s=>s.language==='church'))
 throw Error('Trinity Ikos 1 has no Church Slavonic text');
if((sections.find(s=>s.language==='church')?.expectedResponseLines||0)<3)
 throw Error('Too few recurring Свят response lines detected; inspect actual Ikos source.');
const result={generatedAt:new Date().toISOString(),slug,ikos:1,variants:sections,
 issues:failures};
const filename=path.join(app,'reports','akathist-trinity-svyat-ikos1-audit-20261120.json');
fs.mkdirSync(path.dirname(filename),{recursive:true});
fs.writeFileSync(filename,JSON.stringify(result,null,2)+'\n','utf8');
for(const part of sections)console.log(part.language.toUpperCase()+
 ': response lines '+part.expectedResponseLines+
 ', first words red '+part.redFirstWords.length+
 ', missing '+part.missingRedStarts.length+
 ', missing newlines '+part.missingBreaks.length);
console.log('AUDIT ISSUES:',failures);
console.log('REPORT:',filename);
console.log('SOURCE TEXTS MODIFIED: NO');
if(failures)process.exitCode=1;
