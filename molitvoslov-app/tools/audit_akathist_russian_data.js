#!/usr/bin/env node
// Read-only audit of Akathist CS/RU content in the CURRENT offlineContent.json.
// Structural coverage does not certify translation quality or provenance.
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const getArg = flag => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
};
const input = path.resolve(getArg('--input') || path.join(appRoot, 'src/data/offlineContent.json'));
const output = path.resolve(getArg('--output') || path.join(appRoot, 'reports/akathist_russian_quality.json'));
const importReportPath = getArg('--import-report');
const normalize = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f\u0483-\u0489]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();
const archaicWords = /\b(?:яко|аще|есмь|еси|мя|тя|вопием|сие|сице|идеже|днесь|аще|даждь|веси|обретается|рече|приими|несть|зовуща)\b/gu;
const expected = [
  ...Array.from({length: 13}, (_, index) => 'kontakion:' + (index + 1)),
  ...Array.from({length: 12}, (_, index) => 'ikos:' + (index + 1)),
];
function auditOne(slug, akathist) {
  const sections = new Map();
  for (const item of akathist.sections || []) {
    if (!item || !['kontakion', 'ikos', 'prayer'].includes(item.section_type)) continue;
    const key = item.section_type + ':' + item.number;
    if (!sections.has(key)) sections.set(key, item);
  }
  const missing = [];
  const suspect = [];
  let translated = 0;
  for (const key of expected) {
    const item = sections.get(key);
    const church = String(item?.text?.content || '').trim();
    const russian = String(item?.text?.translation || '').trim();
    if (!russian) {
      missing.push(key);
      continue;
    }
    translated++;
    const reasons = [];
    const c = normalize(church), ru = normalize(russian);
    const archaicMatches = [...ru.matchAll(archaicWords)];
    if (archaicMatches.length >= 2) reasons.push('archaic_words_in_russian_field');
    if (church.length >= 180 && russian.length / church.length < 0.20) {
      reasons.push('translation_shorter_than_one_fifth_of_source');
    }
    if (c.length >= 40 && c === ru) reasons.push('same_as_church_slavonic');
    if (reasons.length) suspect.push({
      section: key,
      source_chars: church.length,
      translation_chars: russian.length,
      reasons,
    });
  }
  const prayers = [...sections.values()]
    .filter(item => item.section_type === 'prayer' && item.text?.content?.trim());
  const missingPrayers = prayers.filter(item => !item.text?.translation?.trim())
    .map(item => 'prayer:' + item.number);
  const missingSpecials = ['troparion', 'kontakion_before']
    .filter(name => akathist[name]?.content?.trim() && !akathist[name]?.translation?.trim());
  let category = translated === 0 ? 'no_russian' : translated < 25 ? 'partial_russian_fields' : 'all_main_fields_filled';
  if (suspect.length) category = 'suspect_russian_fields';
  return {
    slug, title: String(akathist.title || slug),
    category, main_total: expected.length, main_translated: translated,
    missing_main: missing, missing_prayers: missingPrayers,
    missing_specials: missingSpecials, suspicious_sections: suspect,
    // This is NOT a verification stamp: it only describes nonempty fields.
    structurally_complete: missing.length === 0 &&
      missingPrayers.length === 0 && missingSpecials.length === 0,
  };
}
function main() {
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  const catalog = data.akathists?.by_slug;
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw Error('Invalid offlineContent.json: akathists.by_slug is missing');
  }
  let allowed = null;
  if (importReportPath) {
    const report = JSON.parse(fs.readFileSync(path.resolve(importReportPath), 'utf8'));
    if (report.source !== 'https://azbyka.ru/molitvoslov/akafisty-v-pravoslavnom-kalendare.html') {
      throw Error('Unrecognized Akathist import provenance report');
    }
    allowed = new Set(Object.values(report.pages || {})
      .filter(item => item?.status === 'imported')
      .map(item => item.slug));
  }
  const records = Object.entries(catalog)
    .filter(([slug]) => !allowed || allowed.has(slug))
    .map(([slug, akathist]) => auditOne(slug, akathist));
  const categories = {};
  for (const item of records) categories[item.category] = (categories[item.category] || 0) + 1;
  const result = {
    generated_at: new Date().toISOString(),
    input, scope: importReportPath ? 'imported_only' : 'all_offline_akathists',
    count: records.length, categories,
    // A positive structural result does not prove that Russian was actually translated.
    note: 'Fields-only and lexical heuristics; manually compare each claimed translation to its original source.',
    records,
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log('Akathists examined:', records.length);
  for (const [category, count] of Object.entries(categories)) console.log(category + ':', count);
  console.log('Warning: complete fields do NOT establish actual Russian translation accuracy.');
  for (const item of records.filter(item =>
    item.category === 'suspect_russian_fields' || item.category === 'partial_russian_fields').slice(0, 12)) {
    console.log('REVIEW', item.slug, item.main_translated + '/25', 'suspect:', item.suspicious_sections.length);
  }
  console.log('Read-only report:', output);
}
if (require.main === module) {
  try {main();} catch (e) {console.error('Audit error:', e.message); process.exitCode = 1;}
}
module.exports = {auditOne};
