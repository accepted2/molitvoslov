'use strict';
// Source-preserving Blagovest liturgical hymns:
// UCS8 font-encoded text -> proper Church-Slavonic Unicode, NOT civil/RU text.
// One hymn per slot; "Иной тропарь/кондак" gets its own fields.
// No network, no writes, no external dependencies.
const {fromUcs8,looksLegacyUcs} = require('./calendarUcs8Decode20261123.cjs');

const suffixes = ['', '_uk'];
const KINDS = ['troparion','kontakion'];
const ALT_FIELDS = KINDS.flatMap(kind=>suffixes.flatMap(suffix=>
  [kind+'_alt_title'+suffix,kind+'_alt_content'+suffix]));
const INFLECTED = {
  troparion: {label:'Иной тропарь',pattern:'троп'},
  kontakion: {label:'Иной кондак',pattern:'конд'},
};
const hasOldMixedGlyphs = s => typeof s === 'string' && looksLegacyUcs(s);
const unicodeCS = s => hasOldMixedGlyphs(s) ? fromUcs8(s) : s;
const toCslTitle = (title) => unicodeCS(title);
const isAlternativeHeading = (line,kind) => {
  const name=INFLECTED[kind].pattern;
  const legacy=new RegExp('^\\s*(?:И\\$нъ|Инъ|Иной)\\s+'+name+'[a-zа-яёіїє\\u0300-\\u036f]*','iu');
  const unicode=new RegExp('^\\s*И[\\u0486\\u0300\\u0301]*нъ\\s+'+name+'[а-яёіїє\\u0300-\\u036f]*','iu');
  return legacy.test(line)||unicode.test(line);
};
const parseAlternative = (value,kind) => {
  if(typeof value!=='string'||!value.trim())return null;
  const lines=value.split(/\r?\n/);
  const at=lines.findIndex(line=>isAlternativeHeading(line,kind));
  if(at<0)return null;
  if(at===0)return {error:'alternative heading found at start, cannot split primary'};
  const before=lines.slice(0,at).join('\n').trim();
  const alternativeLines=lines.slice(at);
  const title=alternativeLines.shift().trim();
  const after=alternativeLines.join('\n').trim();
  if(!before||!after)return {error:'cannot split empty primary or alternative'};
  // Preserve "Подобен" in its own hymn's text. Never discard the rubric.
  return {primary:before,alt_title:title,alt_content:after};
};
const prepareCard=(source)=> {
  if(!source||typeof source!=='object')return {card:source,changed:0,issues:[]};
  const card={...source};
  const issues=[];
  let changed=0;
  for(const kind of KINDS){
    for(const suffix of suffixes){
      const contentKey=kind+'_content'+suffix;
      const titleKey=kind+'_title'+suffix;
      const altTitleKey=kind+'_alt_title'+suffix;
      const altContentKey=kind+'_alt_content'+suffix;
      const rawContent=card[contentKey];
      if(typeof rawContent!=='string'||!rawContent)continue;
      const existingAlt=String(card[altContentKey]||'');
      const split=parseAlternative(rawContent,kind);
      if(split?.error){
        issues.push({field:contentKey,issue:split.error});
        continue;
      }
      if(split&&existingAlt){
        issues.push({field:contentKey,issue:'alternative already populated while original remains combined'});
        continue;
      }
      const newMain=unicodeCS(split?split.primary:rawContent);
      const newTitle=typeof card[titleKey]==='string'?toCslTitle(card[titleKey]):card[titleKey];
      if(newMain!==card[contentKey]){
        card[contentKey]=newMain;changed++;
      }
      if(newTitle!==card[titleKey]){
        card[titleKey]=newTitle;changed++;
      }
      if(split){
        if(parseAlternative(split.alt_content,kind)) {
          issues.push({field:contentKey,issue:'more than two hymn variants: manual review required'});
        }
        card[altTitleKey]=toCslTitle(split.alt_title);
        card[altContentKey]=unicodeCS(split.alt_content);
        changed+=2;
      } else if(existingAlt){
        const cleanAlt=unicodeCS(existingAlt);
        const cleanAltTitle=toCslTitle(String(card[altTitleKey]||''));
        if(cleanAlt!==existingAlt){card[altContentKey]=cleanAlt;changed++;}
        if(cleanAltTitle!==card[altTitleKey]){card[altTitleKey]=cleanAltTitle;changed++;}
      }
      // Script hints are used for Ponomar, not for translation selection.
      const isCS=hasOldMixedGlyphs(rawContent) ||
        /[ѣѡѻѿꙋꙗѧѳѵꙑѱѯ҃ⷣⷭ҇]/u.test(card[contentKey]||'');
      if(isCS)card[kind+'_script'+suffix]='csl';
      if(split&&isCS)card[kind+'_alt_script'+suffix]='csl';
      if(!split&&existingAlt&&
        /[ѣѡѻѿꙋꙗѧѳѵꙑѱѯ҃ⷣⷭ҇]/u.test(card[altContentKey]||'')){
        card[kind+'_alt_script'+suffix]='csl';
      }
      // Truly unsafe legacy data must be flagged, not silently accepted.
      for(const field of [contentKey,altContentKey]){
        if(card[field]&&hasOldMixedGlyphs(card[field]))
          issues.push({field,issue:'legacy UCS glyphs remain after conversion'});
      }
    }
  }
  return {card,changed,issues};
};
module.exports={prepareCard,parseAlternative,unicodeCS,ALT_FIELDS,hasOldMixedGlyphs};
