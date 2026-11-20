#!/usr/bin/env node
'use strict';
// Scoped local installer for the Third Hour, RU and traditional CS.
// Safe for a divergent working tree: never merges, stashes or replaces other files.
const fs = require('node:fs');
const path = require('node:path');
const marker = 'THIRD_HOUR_TYPOGRAPHY_SAFE_20261120_V2';
const root = [process.cwd(), path.resolve(__dirname, '..')]
  .find(dir => fs.existsSync(path.join(dir, 'src/services/hoursDocument.js')));
if (!root) throw Error('Run from molitvoslov-app. NO FILES MODIFIED.');
const paths = {
  ru: path.join(root, 'src/data/hoursThirdHourRussian.json'),
  cs: path.join(root, 'src/data/hoursThirdHourTraditional.json'),
  doc: path.join(root, 'src/services/hoursDocument.js'),
  css: path.join(root, 'src/components/reader/selectableDocumentReader/styles.js'),
};
for (const key of Object.keys(paths)) {
  if (!fs.existsSync(paths[key])) throw Error('Missing '+paths[key]+'. NO FILES MODIFIED.');
}
const before = Object.fromEntries(Object.entries(paths).map(([key,file]) =>
  [key, fs.readFileSync(file, 'utf8')]));
const requireCheck = (test, description) => {
  if (!test) throw Error(description + '. NO FILES MODIFIED.');
};
const oldData = {};
const edited = {};
for (const spec of [
  {key:'ru', field:'russian', title:'heading', presentation:'presentation',
   line:'preserveLineBreaks', prefix:'Аллилуия, аллилуия, аллилуия,',
   cue:'слава Тебе', amen:'Аминь',
   headings:['Молитва Святому Духу','Трисвятое','Молитва Святой Троице','Молитва Господня']},
  {key:'cs', field:'traditional', title:'traditionalHeading',
   presentation:'traditionalPresentation', line:'traditionalPreserveLineBreaks',
   prefix:'А҆ллилꙋ́їѧ, а҆ллилꙋ́їѧ, а҆ллилꙋ́їѧ,',
   cue:'сла́ва Тебѣ̀', amen:'А҆м́инь',
   headings:['Мл҃тва Ст҃о́мꙋ Дх҃ꙋ','Трист҃о́е','Мл҃тва Ст҃о́й Трⷪ҇цѣ','Мл҃тва Гдⷭ҇нѧ']}
]) {
  const data=JSON.parse(before[spec.key].replace(/^\uFEFF/, ''));
  requireCheck(data.entryId==='ordinary-3' && data.sections?.length===13 &&
    data.sections[0].rows.length===16 && data.sections[11].rows.length===8,
    'Unexpected Third Hour sections: '+spec.key);
  oldData[spec.key]=data;
  for (const [i,rowIndex] of [2,3,5,8].entries()) {
    const row=data.sections[0].rows[rowIndex];
    requireCheck(row[spec.title]===undefined || row[spec.title]===spec.headings[i],
      'Unexpected prayer heading at '+spec.key+':'+rowIndex);
    delete row[spec.title];
  }
  const alleluia=data.sections[4].rows[1];
  const source=alleluia[spec.field];
  requireCheck(typeof source==='string' && source.startsWith(spec.prefix),
    'Unexpected Alleluia text '+spec.key);
  const remainder=source.slice(spec.prefix.length).replace(/^\s+/u,'');
  requireCheck(remainder.startsWith(spec.cue), 'Unexpected Alleluia continuation '+spec.key);
  alleluia[spec.field]=spec.prefix+'\n'+remainder;
  alleluia[spec.line]=true;
  const preTropar=data.sections[6].rows[0];
  requireCheck(typeof preTropar[spec.field]==='string' &&
    (spec.key==='ru' ? preTropar[spec.field].startsWith('Слава Отцу') :
      preTropar[spec.field].startsWith('Сла́ва Ѻ҆ц҃ꙋ̀')),
    'Unexpected doxology before daily tropar '+spec.key);
  preTropar[spec.presentation]='tropar-intro';
  const ending=data.sections[11].rows[3];
  requireCheck(typeof ending[spec.field]==='string' &&
    ending[spec.field].includes(spec.amen), 'Unexpected final Amen '+spec.key);
  ending[spec.field]=ending[spec.field].replace(/\.\s*[\r\n]+\s*/u,'. ');
  requireCheck(!ending[spec.field].includes('\n') && ending[spec.field].includes('. '+spec.amen),
    'Failed to join final Amen '+spec.key);
  delete ending[spec.line];
  edited[spec.key]=JSON.stringify(data,null,2)+'\n';
  requireCheck(!edited[spec.key].includes('undefined'),
    'Invalid serialized '+spec.key);
}
requireCheck(before.doc.includes('isThirdHour') &&
  before.doc.includes('getThirdHourRussianSections') &&
  before.doc.includes('getThirdHourTraditionalMarks') &&
  before.doc.includes('row.russianPresentation') &&
  before.doc.includes('row.traditionalPresentation'),
  'Third Hour RU/traditional reader installation is missing or incompatible');
let doc=before.doc;
if (!doc.includes(marker)) {
  const whitelist="'shared-alleluia', 'shared-mercy', 'shared-heading',";
  requireCheck(doc.includes(whitelist), 'Hours presentation whitelist changed');
  doc=doc.replace(whitelist,whitelist+" 'tropar-intro',");
  const anchor='    // Only a specifically indicated cue is colored.';
  requireCheck(doc.includes(anchor), 'Hours styling hook not found');
  const extra=[
    '    // '+marker+' — do not change prayer text or its UTF-16 offsets.',
    "    if (isThirdHour && (language === 'russian' || language === 'traditional')) {",
    "      if (visualNote === 'tropar-intro') {",
    "        hoursMarks.splice(0, hoursMarks.length, {start: 0, end: text.length, kind: 'doxology'});",
    "      } else if (visualNote === 'shared-doxology' &&",
    "          /(?:Аминь|А҆м́инь)\\.?$/u.test(text)) {",
    "        hoursMarks.splice(0, hoursMarks.length, {start: 0, end: text.length, kind: 'devotional'});",
    "      }",
    "    }",
  ].join('\n')+'\n';
  doc=doc.replace(anchor,extra+anchor);
}
let css=before.css;
if (!css.includes(marker)) {
  const anchor='    #reader-scroll-track {';
  requireCheck(css.split(anchor).length===2, 'Hours CSS insertion point missing');
  const extra=[
    '    /* '+marker+' — only Third Hour pre-troparion cue. */',
    '    .rule-item.hours-third-hour .reader-text.hours-presentation-tropar-intro,',
    '    .rule-item.hours-third-hour .reader-text.hours-presentation-tropar-intro span {',
    '      color: var(--accent-dark) !important;',
    '      font-weight: 700 !important;',
    '      font-style: normal !important;',
    '    }',
    '    .rule-item.hours-third-hour.hours-traditional-section',
    '    .reader-text.hours-presentation-tropar-intro {',
    '      -webkit-text-stroke: 0.12px currentColor;',
    '    }',
    '',
  ].join('\n');
  css=css.replace(anchor,extra+anchor);
}
requireCheck(doc.includes(marker) && css.includes(marker), 'Partial Third Hour style');
const output={...edited,doc,css};
for (const key of ['doc','css']) {
  if (before[key].includes('\r\n') && !output[key].includes('\r\n')) {
    output[key]=output[key].replace(/\n/g,'\r\n');
  }
}
try {
  const {parse}=require('@babel/parser');
  parse(output.doc,{sourceType:'module',plugins:['jsx']});
  parse(output.css,{sourceType:'module',plugins:['jsx']});
} catch(error) {
  if(error.code!=='MODULE_NOT_FOUND') throw error;
  console.warn('WARN: @babel/parser not installed, syntax check skipped.');
}
const modified=Object.keys(paths).filter(k=>before[k]!==output[k]);
if(process.argv.includes('--dry-run')) {
  console.log('DRY RUN PASS: headings, Alleluia break, tropar accent and final Amen.');
  console.log('DRY RUN PASS: no source prayer or unrelated file replacement.');
  console.log('WOULD MODIFY: '+(modified.join(', ')||'none'));
  console.log('NO FILES MODIFIED.');
  process.exit(0);
}
if(!modified.length) {
  console.log('PASS: Third Hour correction already installed. NO FILES MODIFIED.');
  process.exit(0);
}
const backup=path.resolve(root,'..','build-backups',
  'hours-third-typography-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for (const key of modified)
  fs.copyFileSync(paths[key],path.join(backup,path.basename(paths[key])));
try {
  for (const key of modified) fs.writeFileSync(paths[key],output[key],'utf8');
} catch(error) {
  for (const key of modified)
    fs.copyFileSync(path.join(backup,path.basename(paths[key])),paths[key]);
  throw error;
}
console.log('PASS: Third Hour RU and CS traditional typography fixed.');
console.log('FILES CHANGED: '+modified.join(', '));
console.log('BACKUP: '+backup);
