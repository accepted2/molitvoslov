#!/usr/bin/env node
'use strict';
// Only uploaded Church Slavonic Traditional Communion preparation.
const fs=require('fs'),path=require('path'),{parse}=require('@babel/parser');
const app=path.resolve(__dirname,'..');
const files=['src/components/reader/PrayerRuleReader.js','src/screens/PrayerRuleScreen.js'];
const dry=process.argv.includes('--dry-run');
const marker='/* COMMUNION_TRAD_VISUAL_V3 */';
function insist(value,message){if(!value)throw Error(message)}
function one(text,from,to,label){
  if(text.includes(to))return text;
  const n=text.split(from).length-1;
  insist(n===1,label+': expected one anchor, got '+n);
  return text.replace(from,to);
}
const css=[
 '    '+marker,
 '    /* Non-bold brown Ponomar headings as in the combined canons. */',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-title,',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .section-title {',
 "      font-family: 'Ponomar', Georgia, serif !important;",
 '      font-weight: 400 !important; font-style: normal !important;',
 '      color: var(--secondary, #5A3822) !important;',
 '    }',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .section-title {',
 '      font-size: 20px; line-height: 1.5; margin-bottom: 6px !important;',
 '    }',
 '    /* All five troparia of tone eight and the penitential troparia form one unit. */',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-joined {',
 '      border-bottom: 0 !important; margin-bottom: 3px !important; padding-bottom: 1px !important;',
 '    }',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-joined .communion-initial {',
 '      font-size: inherit !important; font-weight: 400 !important;',
 '    }',
 '    /* Doxologies red, no extra heading or colon. */',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-glory .reader-text,',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-glory .reader-text span {',
 '      color: var(--liturgical, #9B3B32) !important;',
 '    }',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-refrain .reader-text {',
 '      color: var(--liturgical, #9B3B32) !important;',
 '    }',
 '    /* Festival instruction and "other verses" are comments. */',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-note {',
 '      border-bottom: 0 !important; margin-bottom: 3px !important; padding-bottom: 0 !important;',
 '    }',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .rule-item.communion-trad-note .instruction {',
 '      color: var(--secondary, #5A3822) !important;',
 '      font-size: 14px; line-height: 1.4; font-style: italic; text-align: center;',
 '    }',
 '    /* Count and bow notes: bold brown, not liturgical red. */',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .reader-text span.communion-note,',
 '    body.communion-preparation.traditional-mode.communion-traditional-source .reader-text span.communion-count-note {',
 '      color: var(--secondary, #5A3822) !important;',
 '      font-weight: 700 !important; font-style: normal !important; white-space: nowrap;',
 '    }',
 ''
].join('\n');

function patchReader(s){
  insist(s.includes('const traditionalReadingRule = completeCommunionTraditionalRule(rule, viewMode);'),
    'Traditional Communion full-text reader is not installed');
  const old="import {completeCommunionTraditionalRule} from '../../services/communionTraditionalRule';";
  const newer="import {completeCommunionTraditionalRule, getCommunionTraditionalCountRanges} from '../../services/communionTraditionalRule';";
  s=one(s,old,newer,'Import counting rubrics');
  if(!s.includes(marker)){
    const anchor='    /* The first "Слава..." text and next "И ныне..." text form one';
    s=one(s,anchor,css+anchor,'Scoped CSS');
  }
  if(!s.includes("wrapper.classList.add('communion-trad-joined')")){
    const anchor='          if (paschalOpeningItemIds.has(Number(item.id))) {';
    const classes=[
      '          if (DATA.rule?.communionTraditionalEdition) {',
      "            if (item.communionTraditionalTroparionSet) wrapper.classList.add('communion-trad-joined');",
      "            if (item.communionTraditionalDoxology) wrapper.classList.add('communion-trad-glory');",
      "            if (item.communionTraditionalRefrain) wrapper.classList.add('communion-trad-refrain');",
      "            if (item.communionTraditionalNote) wrapper.classList.add('communion-trad-note');",
      '          }',
      ''
    ].join('\n');
    s=one(s,anchor,classes+anchor,'Traditional item classes');
  }
  if(!s.includes('getCommunionTraditionalCountRanges(value)')){
    const begin=s.indexOf('const buildHtml = ({');
    const end=s.indexOf('\nconst PrayerRuleReader = forwardRef',begin);
    insist(begin>=0&&end>begin,'Cannot isolate the HTML builder');
    let build=s.slice(begin,end);
    const regex=/communionTypographyByItem\[String\(item\.id\)\] = \{[\s\S]*?\n\s*\};/g;
    const hits=[...build.matchAll(regex)];
    insist(hits.length===1,'Count-note metadata anchor count '+hits.length);
    build=build.replace(regex,oldBlock=>oldBlock+
      "\n        if (traditionalReadingRule?.communionTraditionalEdition && viewMode === 'traditional') {\n"+
      "          communionTypographyByItem[String(item.id)].ranges.push(...getCommunionTraditionalCountRanges(value));\n"+
      "        }");
    s=s.slice(0,begin)+build+s.slice(end);
  }
  return s;
}
function patchScreen(s){
  const old="import {hasCommunionTraditionalEdition} from '../services/communionTraditionalRule';";
  const newer="import {COMMUNION_TRADITIONAL_NAME, hasCommunionTraditionalEdition} from '../services/communionTraditionalRule';";
  if(!s.includes(newer)){
    if(s.includes(old))s=s.replace(old,newer);
    else s=one(s,
      "import {READER_LANGUAGE_MODES, buildReaderLanguageOptions} from '../services/readerLanguageModes';",
      "import {READER_LANGUAGE_MODES, buildReaderLanguageOptions} from '../services/readerLanguageModes';\n"+newer,
      'Traditional native title import');
  }
  if(!s.includes('viewMode === MODE_TRADITIONAL && hasCommunionTraditionalEdition(rule)')){
    s=one(s,
      "title={getLocalizedField(rule, 'name', language) || t('reading.prayerRule')}",
      "title={viewMode === MODE_TRADITIONAL && hasCommunionTraditionalEdition(rule)\n"+
      "          ? COMMUNION_TRADITIONAL_NAME\n"+
      "          : getLocalizedField(rule, 'name', language) || t('reading.prayerRule')}",
      'Native header Church Slavonic title');
  }
  return s;
}
function verify(reader,screen){
  for(const part of [marker,"wrapper.classList.add('communion-trad-joined')",
    'getCommunionTraditionalCountRanges(value)',"wrapper.classList.add('communion-trad-glory')"])
    insist(reader.includes(part),'Missing reader visual feature '+part);
  insist(reader.split(marker).length===2,'Duplicate CSS');
  insist(screen.includes('COMMUNION_TRADITIONAL_NAME') &&
    screen.includes('viewMode === MODE_TRADITIONAL && hasCommunionTraditionalEdition(rule)'),
    'Native title not scoped to Communion Traditional');
}
function checkSource(){
  const helper=fs.readFileSync(path.join(app,'src/services/communionTraditionalRule.js'),'utf8');
  const source=JSON.parse(fs.readFileSync(path.join(app,'src/data/communionTraditionalSource.json'),'utf8'));
  parse(helper,{sourceType:'module',plugins:['jsx']});
  insist(helper.includes('getCommunionTraditionalCountRanges') &&
    helper.includes('communionTraditionalTroparionSet'),'Update traditional Communion helper first');
  insist(source.groups.length===27 && source.groups.reduce((sum,g)=>sum+g.blocks.length,0)===108,
    'Incorrect traditional manuscript content');
}
let changes=[];
try{
  checkSource();
  for(let i=0;i<files.length;i++){
    const filename=path.join(app,files[i]),original=fs.readFileSync(filename,'utf8');
    const result=[patchReader,patchScreen][i](original.replace(/\r\n/g,'\n'));
    parse(result,{sourceType:'module',plugins:['jsx']});
    insist([patchReader,patchScreen][i](result)===result,'Not safely repeatable: '+files[i]);
    const output=original.includes('\r\n')?result.replace(/\n/g,'\r\n'):result;
    changes.push({filename,relative:files[i],original,output});
  }
  verify(changes[0].output,changes[1].output);
}catch(e){console.error('STOP:',e.message);console.error('NO SOURCE FILES MODIFIED.');process.exit(1)}
console.log('PASS: traditional rubrics, united troparia, Church Slavonic titles.');
console.log('TO UPDATE:',changes.filter(c=>c.original!==c.output).map(c=>c.relative).join(', ')||'none');
if(dry){console.log('DRY RUN. NO SOURCE FILES MODIFIED.');process.exit(0)}
changes=changes.filter(c=>c.original!==c.output);
if(!changes.length){console.log('ALREADY APPLIED.');process.exit(0)}
const backup=path.join(app,'..','build-backups','communion-traditional-visual-'+new Date().toISOString().replace(/[:.]/g,'-'));
try{
  for(const c of changes){
    const dest=path.join(backup,c.relative);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.writeFileSync(dest,c.original,'utf8');
  }
  for(const c of changes)fs.writeFileSync(c.filename,c.output,'utf8');
  for(const c of changes)parse(fs.readFileSync(c.filename,'utf8'),{sourceType:'module',plugins:['jsx']});
}catch(e){
  for(const c of changes)fs.writeFileSync(c.filename,c.original,'utf8');
  console.error('FAILED. ORIGINAL FILES RESTORED:',e.message);process.exit(1)
}
changes.forEach(c=>console.log('UPDATED:',c.relative));
console.log('SUCCESS. BACKUP:',backup);
