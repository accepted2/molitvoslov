#!/usr/bin/env node
'use strict';
/*
 * Read-only diagnostic for the 36-month Blagovest hymn staging report.
 * Groups duplicate failures by canonical card and field rather than date.
 * Does not change calendar JSON, DB, branch, or compiled application.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const report=path.join(root,'reports','blagovest-hymn-variants-audit-20261123.json');
if(!fs.existsSync(report)){
  console.error('AUDIT_MISSING: '+report);
  console.error('Run node tools/stage_blagovest_hymn_variants_20261123.cjs --stage first');
  process.exit(2);
}
const data=JSON.parse(fs.readFileSync(report,'utf8'));
const issueList=data.unsafe||[];
const coverage=data.coverageGaps||[];
const inferred=data.inferredMain||[];
const short=x=>String(x||'').replace(/\s+/g,' ').slice(0,180);
const normalize=x=>String(x||'').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/ё/g,'е')
  .replace(/[ії]/g,'и').replace(/є/g,'е').replace(/ґ/g,'г')
  .replace(/[^а-яa-z0-9]+/g,' ').trim();
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,16);
const groups=new Map();
for(const issue of issueList){
  const identity=issue.card||issue.id||issue.source_id||issue.title||'';
  const category=issue.issue||issue.reason||'unspecified';
  const field=issue.field||'';
  const key=[identity,field,category].join('|');
  if(!groups.has(key))groups.set(key,{
    card:identity,title:issue.title||'',field,issue:category,
    dates:[],languages:new Set(),sample:issue,
  });
  const item=groups.get(key);
  if(issue.date&&!item.dates.includes(issue.date))item.dates.push(issue.date);
  if(issue.lang)item.languages.add(issue.lang);
}
const dedup=[...groups.values()].map(g=>({
  card:g.card,title:short(g.title),field:g.field,issue:g.issue,
  dates:g.dates.sort(),languages:[...g.languages].sort(),
  sample:g.sample,
}));
const categories=new Map();
for(const item of dedup)categories.set(item.issue,(categories.get(item.issue)||0)+1);
const checks=[];
const overlap=(a,b)=>{
  const A=new Set(normalize(a).split(' ').filter(w=>w.length>4));
  const B=new Set(normalize(b).split(' ').filter(w=>w.length>4));
  if(!A.size||!B.size)return 0;
  let matched=0;for(const word of A)if(B.has(word))matched++;
  return matched/Math.max(1,Math.min(A.size,B.size));
};
for(const entry of inferred){
  const matches=(entry.candidates||[]).map(title=>({title,score:overlap(entry.source,title)}))
    .sort((a,b)=>b.score-a.score);
  checks.push({
    date:entry.date,lang:entry.lang||'',
    old_main:entry.source||'',candidates:(entry.candidates||[]).length,
    proposed_main:entry.suggested||'',
    best_text_match:matches[0]?.title||'',
    text_match_score:matches[0]?.score||0,
    requires_review:!(matches[0]?.score>=0.85),
  });
}
const summary={
  generated_at:new Date().toISOString(),
  input_report:report,
  original_summary:data.summary||{},
  ambiguous_hymn_occurrences:issueList.length,
  unique_hymn_issues:dedup.length,
  unique_issue_categories:categories.size,
  inferred_main_occurrences:inferred.length,
  inferred_main_requiring_review:checks.filter(x=>x.requires_review).length,
  missing_source_days:coverage.length,
  issue_categories:[...categories.entries()].sort((a,b)=>b[1]-a[1])
    .map(([issue,count])=>({issue,count})),
};
const output={
  summary,coverage,
  hymn_issues:dedup.sort((a,b)=>b.dates.length-a.dates.length),
  inferred_main:checks,
  notes:[
    'Text matches are hints only; a textual title match does NOT prove liturgical priority.',
    'Do not apply the 36-month staged files until one missing locale, unsafe hymns and inferred main feasts are verified.',
    'This report does not assert a replacement for legacy source cards without a canonical identity mapping.',
  ],
};
const out=path.join(root,'reports','blagovest-hymn-triage-20261123.json');
fs.writeFileSync(out,JSON.stringify(output,null,2)+'\n','utf8');
console.log('BLAGOVEST HYMN AUDIT TRIAGE');
console.log(JSON.stringify(summary,null,2));
console.log('\nCOVERAGE GAPS');
for(const x of coverage.slice(0,12))console.log(JSON.stringify(x));
console.log('\nTOP UNIQUE HYMN ISSUES');
for(const x of output.hymn_issues.slice(0,18))
  console.log(JSON.stringify({card:x.card,title:short(x.title),field:x.field,
    issue:x.issue,dates:x.dates.slice(0,5),languages:x.languages}));
console.log('\nINFERRED MAIN FEAST EXAMPLES');
for(const x of checks.filter(x=>x.requires_review).slice(0,14))
  console.log(JSON.stringify(x));
console.log('\nFULL TRIAGE REPORT: '+out);
console.log('READ-ONLY: original calendar files/database unchanged.');
