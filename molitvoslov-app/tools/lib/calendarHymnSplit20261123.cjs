'use strict';
// Split primary/other hymn into separate stable fields, without dropping any text.
// UCS-8 must first become real Church Slavonic Unicode for the Ponomar font.
const {looksLegacyUcs,fromUcs8}=require('./calendarUcsUnicode20261123.cjs');
const stripMarks=(s)=>String(s||'').normalize('NFD')
  .replace(/[\u0300-\u036f\u0483\u0486\u0487\u2de0-\u2dff]/gu,'');
const folded=(s)=>stripMarks(s).toLowerCase().replace(/[ѣ]/g,'е').replace(/[ѡ]/g,'о').replace(/[ꙋ]/g,'у');
const normalizeLines=s=>String(s||'').replace(/\r\n/g,'\n').trim();
const isAlternateHeading=(value,kind)=>{
  const key=kind==='troparion'?'тропар':'кондак';
  return new RegExp('^(?:(?:инъ?|иной|иныи|інш(?:ий|ій))\\s+)'+key,'iu')
    .test(folded(value).trim());
};
const isSimilarHymnHeading=(value,kind)=>{
  const key=kind==='troparion'?'тропар':'кондак';
  return new RegExp('^(?:'+key+'|инъ?\\s+'+key+'|иной\\s+'+key+')','iu').test(folded(value).trim());
};
const isPodoben=s=>/^(?:подобен|подобный)\b/iu.test(folded(s).trim());
const needsPonomar=s=>/[\u0300-\u036f\u0483\u0486\u0487\u2de0-\u2dffѣѡѻѿꙋꙗѧѵѳѯѱ]/iu.test(String(s||''));
const normalizeHeadingText=s=>normalizeLines(s);
const convertedField=(text)=>{
  if(!text||typeof text!=='string')return{text:text||'',converted:false};
  if(looksLegacyUcs(text))return{text:fromUcs8(text),converted:true};
  return{text,converted:false};
};
function splitOne(card,kind,suffix){
  const primaryKey=kind+'_content'+suffix;
  const primaryTitleKey=kind+'_title'+suffix;
  const altKey=kind+'_alternate_content'+suffix;
  const altTitleKey=kind+'_alternate_title'+suffix;
  const scriptKey=kind+'_script'+suffix;
  const altScriptKey=kind+'_alternate_script'+suffix;
  const raw=card[primaryKey];
  const changes=[],warnings=[];
  if(typeof raw!=='string'||!raw.trim())return{changes,warnings};
  const primary=convertedField(raw);
  const headings=convertedField(card[primaryTitleKey]);
  const blocks=normalizeLines(primary.text).split(/\n\s*\n+/u).map(s=>s.trim()).filter(Boolean);
  let altIndex=blocks.findIndex((chunk,index)=>index>0&&isAlternateHeading(chunk,kind));
  if(altIndex<0){
    // A whole hymn can consist of one long paragraph. Do not guess split.
    const likely=(folded(primary.text).match(new RegExp('(?:инъ?|иной|інший)\\s+'+
      (kind==='troparion'?'тропар':'кондак'),'giu'))||[]).length;
    if(likely)warnings.push({field:primaryKey,issue:'alternate hymn marker present without safe paragraph split'});
  }
  let mainText=normalizeLines(primary.text);
  let altText='';
  let altTitle='';
  if(altIndex>=0){
    if(card[altKey]&&String(card[altKey]).trim()) {
      warnings.push({field:altKey,issue:'alternate field already populated; review before splitting'});
    } else {
      let skip=altIndex+1;
      const titleParts=[blocks[altIndex]];
      if(skip<blocks.length&&isPodoben(blocks[skip])){
        titleParts.push(blocks[skip]);
        skip++;
      }
      altText=blocks.slice(skip).join('\n\n').trim();
      mainText=blocks.slice(0,altIndex).join('\n\n').trim();
      altTitle=titleParts.join('\n\n');
      if(!mainText||!altText||!isSimilarHymnHeading(altTitle,kind)){
        warnings.push({field:primaryKey,issue:'unsafe alternate split (missing heading or hymn text)'});
        mainText=normalizeLines(primary.text);altText='';altTitle='';
      }
    }
  }
  const original=String(raw).replace(/\r\n/g,'\n').trim();
  if(mainText!==original){card[primaryKey]=mainText;changes.push(primaryKey);}
  if(altText){card[altKey]=altText;changes.push(altKey);}
  const originalTitle=String(card[primaryTitleKey]||'');
  if(headings.text!==originalTitle){card[primaryTitleKey]=normalizeHeadingText(headings.text);changes.push(primaryTitleKey);}
  if(altTitle){card[altTitleKey]=altTitle;changes.push(altTitleKey);}
  const script=(primary.converted||headings.converted||needsPonomar(mainText))?'csl':'civil';
  if(script==='csl'&&card[scriptKey]!=='csl'){card[scriptKey]='csl';changes.push(scriptKey);}
  if(altText){
    const altScript=needsPonomar(altText)||primary.converted?'csl':'civil';
    if(altScript==='csl'&&card[altScriptKey]!=='csl'){
      card[altScriptKey]='csl';changes.push(altScriptKey);
    }
  }
  return{changes,warnings};
}
function transformFeast(card){
  if(!card||typeof card!=='object')return{card,warnings:[],changes:[]};
  const result={...card},warnings=[],changes=[];
  for(const kind of ['troparion','kontakion']){
    for(const suffix of ['', '_uk']){
      const res=splitOne(result,kind,suffix);
      changes.push(...res.changes);
      warnings.push(...res.warnings);
    }
  }
  return{card:result,changes,warnings};
}
module.exports={transformFeast,convertedField,needsPonomar,isAlternateHeading};
