#!/usr/bin/env node
'use strict';
// Editorial third-hour typography, using the same renderer and liturgical
// visual rules as the approved First Hour. Never replace prayers or Psalms,
// invent translations, or change persistent text selection/bookmark offsets.
// Only existing editorial flags and Third-Hour-only CSS are modified.
// Supports --dry-run; creates backups before any writes; repeat is a no-op.
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const jsonPath=path.join(root,'src/data/hoursThirdHourEditorial.json');
const cssPath=path.join(root,'src/components/reader/selectableDocumentReader/styles.js');
const originalJson=fs.readFileSync(jsonPath,'utf8');
const originalCss=fs.readFileSync(cssPath,'utf8');
const marker='MOLITVOSLOV_THIRD_HOUR_FIRST_HOUR_PRESENTATION_20261120_V1';
const original=JSON.parse(originalJson.replace(/^\uFEFF/u,''));
if(original.entryId!=='ordinary-3'||original.version!==1||
  !Array.isArray(original.sections)||original.sections.length!==13)
 throw Error('Unexpected Third Hour source. NO FILES MODIFIED.');
const paired=original.presentationVersion===marker&&originalCss.includes(marker);
if(paired){
 console.log('PASS: Third Hour already follows First Hour typography. NO FILES MODIFIED.');
 process.exit(0);
}
if(original.presentationVersion===marker||originalCss.includes(marker))
 throw Error('Partial typography patch detected. Review local changes. NO FILES MODIFIED.');
const expected=[
 ['opening',''],['psalm','Псалом 16'],['psalm','Псалом 24'],
 ['psalm','Псалом 50'],['postpsalm',''],['instruction',''],
 ['hymn',''],['conditional',null],['prayer',''],['rubric',''],
 ['conditional',null],['prayer',''],['prayer','Молитва святого Мардария']
];
for(let i=0;i<expected.length;i++){
 const s=original.sections[i],kind=expected[i][0],title=expected[i][1];
 if(s.kind!==kind||(title!==null&&String(s.title||'')!==title)||!Array.isArray(s.rows))
  throw Error('Third Hour section '+i+' changed. NO FILES MODIFIED.');
}
const beforeText=JSON.stringify(original.sections.map(s=>s.rows.map(r=>[
 r.church??null,r.russian??null,r.traditional??null
])));
const result=JSON.parse(JSON.stringify(original));
const section=result.sections;
const flag=(obj,key,value,description)=>{
 if(obj[key]!==undefined&&obj[key]!==value)
   throw Error('Unexpected local '+description+' metadata. NO FILES MODIFIED.');
 obj[key]=value;
};
const removeFlag=(obj,key,expectedValue,description)=>{
 if(obj[key]!==undefined && obj[key]!==expectedValue)
   throw Error('Unexpected local '+description+' metadata. NO FILES MODIFIED.');
 delete obj[key];
};
// Keep all three "Приидите" lines together without three large gaps.
for(const index of [13,14])flag(section[0].rows[index],'compactAfter',true,
 'opening "Приидите" compact-after');
// First Hour: a Psalm ending should not receive a second line following
// its final "Господи, помилуй". The section itself owns its border.
removeFlag(section[4].rows[2],'dividerAfter',true,'post-Psalm final mercy');
// First Hour: "Богородичен:" is directly followed by its own prayer.
flag(section[6].rows[3],'compactAfter',true,'ordinary Bogorodichen caption');
flag(section[7].rows[4],'compactAfter',true,'Lenten Bogorodichen caption');
// First Hour: Trisagion rubric connects to the next optional sequence,
// without a duplicate section border.
flag(section[9],'noBottomDivider',true,'Trisagion-to-kontakia transition');
// First Hour: a single rule marks the start of the final prayer section.
flag(section[11],'dividerBefore',true,'final prayers separator');
// Avoid a double border immediately before Mardarius' own title.
removeFlag(section[11].rows[7],'dividerAfter',true,'closing reader Amen');
// Source texts, row order, section IDs, and accordion IDs remain unchanged.
result.presentationVersion=marker;
const afterText=JSON.stringify(result.sections.map(s=>s.rows.map(r=>[
 r.church??null,r.russian??null,r.traditional??null
])));
if(afterText!==beforeText)
 throw Error('Source text unexpectedly changed. NO FILES MODIFIED.');
const expectedAccordions=['third-hour-lent-tropar','third-hour-fasting-kontakia'];
const actualAccordions=result.sections.filter(s=>s.collapsible===true).map(s=>s.accordionId);
if(JSON.stringify(actualAccordions)!==JSON.stringify(expectedAccordions))
 throw Error('Third Hour accordions differ from expected. NO FILES MODIFIED.');
const anchor=[
 '    .rule-item.hours-third-hour.hours-collapsible',
 '    .reader-text.hours-presentation-rubric-label {',
 '      color: var(--liturgical) !important;',
 '      font-weight: 600 !important;',
 '      font-style: normal !important;',
 '      text-align: left !important;',
 '      text-align-last: left !important;',
 '    }',
].join('\n');
let css=originalCss.replace(/\r\n/g,'\n');
if(css.split(anchor).length!==2)
 throw Error('Third Hour CSS anchor differs. NO FILES MODIFIED.');
const addition=[
 '',
 '    /* '+marker,
 '       Mirror the First Hour editorial rhythm while preserving Church',
 '       Slavonic text and speaker cues. These rules apply ONLY to Hour 3.',
 '       Normal prayer prose fills each line; dialogues stay left aligned.',
 '       Psalm headings, prayer initials and rubric reds remain inherited',
 '       from the same First Hour renderer, not duplicated overrides. */',
 '    .rule-item.hours-third-hour.hours-section-opening',
 '    .reader-text.hours-prose {',
 '      text-align: justify !important;',
 '      text-align-last: left !important;',
 '      text-justify: inter-word;',
 '    }',
 '    .rule-item.hours-third-hour.hours-section-opening',
 '    .reader-text.hours-dialogue,',
 '    .rule-item.hours-third-hour.hours-section-opening',
 '    .reader-text.hours-response,',
 '    .rule-item.hours-third-hour.hours-section-opening',
 '    .reader-text.hours-mercy-left {',
 '      text-align: left !important;',
 '      text-align-last: left !important;',
 '    }',
 '    .rule-item.hours-third-hour .reader-row.hours-row-compact-after {',
 '      margin-bottom: 2px !important;',
 '    }',
].join('\n');
css=css.replace(anchor,anchor+addition);
parse(css,{sourceType:'module',plugins:['jsx']});
const oldEol=originalJson.includes('\r\n')?'\r\n':'\n';
let jsonOut=JSON.stringify(result,null,2)+'\n';
if(oldEol==='\r\n')jsonOut=jsonOut.replace(/\n/g,'\r\n');
if(originalJson.startsWith('\uFEFF'))jsonOut='\uFEFF'+jsonOut;
let cssOut=css;
if(originalCss.includes('\r\n'))cssOut=cssOut.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: Third Hour 13 sections, 3 full Psalms and two accordions retained.');
 console.log('DRY RUN PASS: all original prayers/verses and text offsets identical.');
 console.log('DRY RUN PASS: First Hour style, rubrics, divider rhythm, justified prose.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(root,'..','build-backups','hours-third-match-first-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(jsonPath,path.join(backup,'hoursThirdHourEditorial.json'));
fs.copyFileSync(cssPath,path.join(backup,'styles.js'));
fs.writeFileSync(jsonPath,jsonOut,'utf8');
fs.writeFileSync(cssPath,cssOut,'utf8');
console.log('PASS: Hour 3 now uses First Hour\'s reading/spacing presentation.');
console.log('PASS: all prayer and Psalm source strings remain exactly unchanged.');
console.log('BACKUP:',backup);
