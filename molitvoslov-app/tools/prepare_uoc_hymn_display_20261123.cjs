#!/usr/bin/env node
'use strict';
// Read-only canonical UOC card presentation export (2025-2027).
// One icon URL per card; every hymn variant separate; civil script first.
// Reuses the deterministic UCS-8 -> civil converter from the civic-only branch.
// Does NOT write the source SQLite, bundled months or Django models.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const {convertLegacyUcsToCivil, looksLegacyUcs} =
  require('./lib/calendarUcsCivic20261123.cjs');

const root = path.resolve(__dirname, '..');
const defaultDb = [
  path.resolve(root, 'data/uoc_calendar_2025_2027_preview.sqlite3'),
  'C:/m/svetilnik-uk-preview/data/uoc_calendar_2025_2027_preview.sqlite3',
  'C:/m/orthodox-telegram-bot/data/uoc_calendar_2025_2027_preview.sqlite3',
].find(p => fs.existsSync(p));
const args = process.argv.slice(2);
const getOption = (name, fallback) => {
  const at = args.indexOf(name);
  if (at < 0) return fallback;
  if (!args[at + 1] || args[at + 1].startsWith('--'))
    throw new Error('Missing value for ' + name);
  return args[at + 1];
};
if (args.some((a,i) => a.startsWith('--') &&
    !['--db','--outdir'].includes(a)))
  throw new Error('Usage: node tools/prepare_uoc_hymn_display_20261123.cjs [--db path] [--outdir path]');
const dbPath = path.resolve(getOption('--db', defaultDb || ''));
if (!fs.existsSync(dbPath) || !fs.statSync(dbPath).isFile())
  throw new Error('UOC SQLite not found. Pass --db path to the CLEANED_PREVIEW.sqlite3 (no writes).');
const outdir = path.resolve(getOption('--outdir',
  path.join(root,'reports/uoc-civil-card-manifest-20261123')));
const sha256 = input => crypto.createHash('sha256').update(input).digest('hex');
const TRAD = /[ѣѢѡѠѻѺѿѾѧѦѵѴѳѲѯѮѱѰꙋꙊꙗꙖ\u0483\u0486\u0487\u2de0-\u2dff]/u;
const good = text => typeof text === 'string' && text.trim() &&
  !looksLegacyUcs(text) && !TRAD.test(text);
const sortedVariants = (a,b) => Number(a.variant) - Number(b.variant);
const choose = (rows, issues, card, kind, variant) => {
  const preferred = rows
    .filter(r => (r.language === 'civil' || r.language === 'uk') &&
      good(r.content) && (!r.heading || good(r.heading)))
    .sort((a,b) => (a.language==='uk'?0:1)-(b.language==='uk'?0:1)
        || Number(b.display_choice)-Number(a.display_choice));
  if (preferred.length) return {...preferred[0], conversion_status:'original_civil'};
  for (const raw of rows.filter(r=>r.language==='church')) {
    const body = convertLegacyUcsToCivil(raw.content);
    const title = convertLegacyUcsToCivil(raw.heading || '');
    const failed = [...body.problems,...title.problems];
    if (failed.length || !good(body.text) || (title.text && !good(title.text))) {
      issues.push({card_id:card,kind,variant,reason:'unsafe_conversion',
        warnings:failed.length?failed:['output not civil'],
        original_preview:raw.content.slice(0,150),
        proposed_preview:String(body.text || '').slice(0,150)});
      continue;
    }
    return {...raw,content:body.text,heading:title.text,
      language:'civil',conversion_status:'ucs8_to_civil_review_required'};
  }
  issues.push({card_id:card,kind,variant,reason:'no_clean_civil_or_safe_conversion',
    source_languages:rows.map(r=>r.language)});
  return null;
};
const db = new DatabaseSync(dbPath,{readOnly:true});
try {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all().map(row=>row.name));
  if (!['card','hymn','mobile_icon','icon','day'].every(name=>tables.has(name)))
    throw new Error('Not the canonical UOC card catalogue.');
  if (db.prepare('SELECT COUNT(*) AS n FROM card').get().n !== 3791)
    throw new Error('Unexpected canonical card count, refuse to export.');
  if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok')
    throw new Error('SQLite integrity check failed.');
  const cards=db.prepare('SELECT card_id,title_ru,title_uk FROM card ORDER BY card_id').all();
  const iconRows=new Map(db.prepare('SELECT card_id,url,selection_status,rights_status FROM mobile_icon')
    .all().map(row=>[row.card_id,row]));
  const allHymns=db.prepare(
    "SELECT card_id,kind,language,variant,heading,content,display_choice FROM hymn " +
    "WHERE kind IN ('tropar','kondak') ORDER BY card_id,kind,variant,language"
  ).all();
  const grouped=new Map();
  for(const h of allHymns) {
    let table=grouped.get(h.card_id);
    if(!table){table=new Map();grouped.set(h.card_id,table);}
    const key=h.kind+':'+h.variant;
    if(!table.has(key))table.set(key,[]);
    table.get(key).push(h);
  }
  const out=[],issues=[],counts={
    cards:0,selected_icons:0,missing_icons:0,variants_original_civil:0,
    variants_proposed_civic_conversion:0,variants_not_safe:0,
    additional_troparia:0,additional_kontakia:0,
  };
  for (const card of cards) {
    counts.cards++;
    const icon=iconRows.get(card.card_id);
    const selectedIcon=icon?.url || null;
    if(selectedIcon)counts.selected_icons++; else counts.missing_icons++;
    const hymns=[],groups=grouped.get(card.card_id) || new Map();
    for(const [key,rows] of groups) {
      const [kind,index]=key.split(':');
      const variant=Number(index);
      const chosen=choose(rows,issues,card.card_id,kind,variant);
      if(!chosen){counts.variants_not_safe++;continue;}
      counts[chosen.conversion_status==='original_civil'?
        'variants_original_civil':'variants_proposed_civic_conversion']++;
      if(variant>1)counts[kind==='tropar'?'additional_troparia':'additional_kontakia']++;
      hymns.push({
        kind,variant,language:'civil',
        heading:chosen.heading || '',
        content:chosen.content,
        conversion_status:chosen.conversion_status,
      });
    }
    hymns.sort((a,b)=>(a.kind==='tropar'?0:1)-(b.kind==='tropar'?0:1) ||
      sortedVariants(a,b));
    out.push({
      card_id:card.card_id,title_ru:card.title_ru,title_uk:card.title_uk,
      // Preview only; publication rights and actual pixels are not implied.
      selected_icon_url:selectedIcon,
      icon_status:icon?.selection_status || 'missing',
      icon_rights:icon?.rights_status || 'unknown',
      hymns,
    });
  }
  fs.mkdirSync(outdir,{recursive:true});
  const file=path.join(outdir,'UOC_CARD_CIVIL_HYMNS_3791.jsonl');
  fs.writeFileSync(file,out.map(x=>JSON.stringify(x)).join('\n')+'\n','utf8');
  const report=path.join(outdir,'UOC_CIVIL_CONVERSION_REVIEW.json');
  fs.writeFileSync(report,JSON.stringify(issues,null,2)+'\n','utf8');
  const manifest=path.join(outdir,'SUMMARY.json');
  fs.writeFileSync(manifest,JSON.stringify({
    generated_at:new Date().toISOString(),
    db_path:dbPath,db_sha256:sha256(fs.readFileSync(dbPath)),
    counts,issues:issues.length,
    note:'Pure preview export; no SQLite writes or edits to existing app calendar. '+
      'All proposed UCS conversions require editorial QA before publication.',
  },null,2)+'\n','utf8');
  console.log(JSON.stringify({counts,review_needed:issues.length,
    output:outdir},null,2));
} finally {
  db.close();
}
