#!/usr/bin/env node
'use strict';
// Read-only audit of the local canonical 58 Akathists. Checks the
// supplementary Trinity prayer and the first Kontakia of both screenshot
// examples using the ACTUAL WebView first-word and break collectors.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const content=JSON.parse(fs.readFileSync(path.join(app,'src/data/offlineContent.json'),'utf8').replace(/^\uFEFF/u,''));
const runtime=fs.readFileSync(path.join(app,'src/components/reader/selectableDocumentReader/runtime.js'),'utf8');
const screen=fs.readFileSync(path.join(app,'src/screens/AkathistScreen.js'),'utf8');
const akathists=Object.entries(content.akathists?.by_slug||{});
if(!akathists.length)throw Error('No Akathist records in offlineContent.json');
const take=(a,b)=>{
 const x=runtime.indexOf(a),y=runtime.indexOf(b,x);
 if(x<0||y<=x)throw Error('Runtime helper changed: '+a);
 return runtime.slice(x,y);
};
const matcher=new Function(
 take('const normalizedAkathistTextWithIndex = value =>','const HIGHLIGHT_COMBINING')+
 '\n'+take('const collectAkathistWordRanges = (value, pattern',
 'const collectPsalterPrayerAccentRanges = value =>')+
 '\nreturn {red:collectAkathistRefrainRanges,'+
 'breaks:collectAkathistJoyBreaks};'
)();
const normalize=value=>{
 let text=String(value||'').replace(/\r\n/g,'\n').replace(/[\u00ad\u200b]/g,'');
 const notes=text.match(/(?:^|\n)\s*Примечани(?:е|я)\s*(?=\n|$)/iu);
 if(notes&&notes.index!==undefined)text=text.slice(0,notes.index);
 const lines=text.split('\n'),output=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();
  if(!line)continue;
  const letters=line.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^А-Яа-яЁё]/g,'');
  const next=lines[i+1]?.trim()||'';
  if(letters.length>0&&letters.length<=2&&next&&/^[А-Яа-яЁё\u0300-\u036f]/u.test(next)){
   output.push(line+next);i++;
  }else output.push(line);
 }
 return output.join('\n').replace(/\n{2,}/g,'\n').trim();
};
const plain=value=>String(value||'').replace(/[\u00ad\u200b]/gu,'')
 .normalize('NFD').replace(/[\u0300-\u036f\u0483-\u0489]/gu,'');
const slugs=['akafist-rozhdestvu-hristovu','akafist-presvjatoj-i-zhivotvorjashhej-troice'];
const details=[],problems=[];
let firstKontakionCount=0,prayerSectionCount=0;
for(const [slug,akathist] of akathists){
 for(const section of akathist.sections||[]){
  if(section.section_type==='prayer')prayerSectionCount++;
  if(section.section_type==='kontakion'&&Number(section.number)===1)firstKontakionCount++;
 }
 if(!slugs.includes(slug))continue;
 const first=(akathist.sections||[]).find(section=>
  section.section_type==='kontakion'&&Number(section.number)===1);
 const source=normalize(first?.text?.content);
 const spans=source?matcher.red(source,false,true):[];
 const decorated=spans.map(p=>({word:source.slice(p.start,p.end),
  start:p.start,preceding:source.slice(Math.max(0,p.start-40),p.start).replace(/\n/g,' ⏎ ')}));
 const breaks=source?[...matcher.breaks(source,false,true)]:[];
 const targetWord=slug==='akafist-rozhdestvu-hristovu'?'Слава':'Свят';
 const matches=decorated.filter(item=>plain(item.word).toLowerCase()===targetWord.toLowerCase());
 if(!matches.length)problems.push('Expected '+targetWord+' in Kontakion 1 of '+slug);
 for(const item of matches){
  if(!breaks.includes(item.start) && !/[\r\n][ \t]*$/u.test(source.slice(0,item.start)))
   problems.push('No visual break before '+item.word+' in '+slug);
 }
 details.push({slug,title:akathist.title||slug,
  firstKontakionPresent:!!first,
  textLength:source.length,coloredFirstWords:decorated,
  insertedBreaks:breaks.length,
  hasFirstKontakionTarget:matches.length>0});
}
const trinity=content.akathists.by_slug['akafist-presvjatoj-i-zhivotvorjashhej-troice'];
const existsInCanonical=!!trinity&&[
 ...(trinity.sections||[]).map(s=>s.text?.content),
 trinity.common_rule?.ending?.content,
].some(text=>/Пресвятая[ \t]+Троице,[ \t]+Единосущная[ \t]+Державо/iu.test(plain(text)));
if(!trinity)problems.push('Canonical Trinity Akathist not found');
if(!screen.includes("addSpecial(TRINITY_AKATHIST_PRAYER,"))
 problems.push('Supplementary Trinity prayer is not mounted in AkathistScreen');
const report={generatedAt:new Date().toISOString(),
 akathists:akathists.length,firstKontakionCount,prayerSectionCount,
 trinitySpecificPrayer:{canonicalExists:existsInCanonical,
  supplementalShownWhenCanonicalMissing:!existsInCanonical,
  supportedLanguage:'church'},
 examples:details,problems};
const dest=path.join(app,'reports','akathist-prayer-and-first-kontakion-audit-20261120.json');
fs.mkdirSync(path.dirname(dest),{recursive:true});
fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n','utf8');
console.log('AKATHISTS:',akathists.length,'KONTAKION 1:',firstKontakionCount,'PRAYER SECTIONS:',prayerSectionCount);
console.log('NATIVITY KONTAKION 1:',details.find(d=>d.slug===slugs[0])?.hasFirstKontakionTarget?'PASS':'NOT CONFIRMED');
console.log('TRINITY KONTAKION 1:',details.find(d=>d.slug===slugs[1])?.hasFirstKontakionTarget?'PASS':'NOT CONFIRMED');
console.log('TRINITY SPECIFIC PRAYER IN CANONICAL JSON:',existsInCanonical);
console.log('TRINITY SPECIFIC PRAYER SUPPLEMENT VISIBLE:',!!trinity&&!existsInCanonical);
console.log('AUDIT PROBLEMS:',problems.length);
console.log('REPORT:',dest);
console.log('NO PRAYER SOURCE DATA MODIFIED.');
if(problems.length)process.exitCode=1;
