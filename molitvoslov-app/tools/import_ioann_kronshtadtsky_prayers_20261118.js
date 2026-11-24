#!/usr/bin/env node
'use strict';
// Add three public-domain prayers by St. John of Kronstadt from Azbyka.
// Safe for an already heavily modified offlineContent.json.
// Does not modify other sections, existing prayers, or backend DB.
// --dry-run is read only; creates a backup before first write.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/data/offlineContent.json');
const sourceUrl = 'https://azbyka.ru/molitvoslov/blagodarenie-za-vsyakoe-blagodeyanie-bozhie.html';
const rootSlug = 'raznye-molitvy';
const categorySlug = 'molitvy-ioanna-kronshtadtskogo';
const categoryName = 'Молитвы святого праведного Иоанна Кронштадтского';
const PRAYERS = [
  {
    "slug": "ioann-kronshtadtsky-blagodarenie-za-bozhii-milosti",
    "title": "Благодарственная молитва ко Господу",
    "text": "Господи! Что я принесу Тебе, чем отблагодарствую Тебя за Твои непрестанные, величайшие мне и людям Твоим милости Твои? Ибо вот я каждое мгновение оживляюсь Духом Твоим Святым, каждое мгновение дышу воздухом, Тобою разлитым, легким, приятным, здоровым, укрепляющим, просвещаюсь Твоим радостным и животворным светом, духовным и вещественным; питаюсь духовною пищею пресладкою и животворною и питием таковым же – Святыми Тайнами Тела и Крови Твоей, и пищею и питиями сладости вещественными; Ты одеваешь меня пресветлым, прекрасным, царским одеянием – Собою Самим, по Писанию: во Христа крестившиеся, во Христа облеклись (Гал.3:27), и одеждами красоты во храме и вне его вещественными; очищаешь мои прегрешения, исцеляешь и очищаешь страсти мои греховные, многие и лютые, отъемлешь мое душевное растление в державе безмерной благости, премудрости и крепости Твоей; исполняешь Духом Твоим Святым, Духом святыни, благодати, подаеши душе моей правду, мир и радость, пространство, силу, дерзновение, мужество, крепость; драгоценным здравием и тело мое одаряешь; научаешь руце мои на ополчение и персты мои на брань (Пс.143:1) с невидимыми врагами моего спасения и блаженства и с врагами святыни и державы славы Твоей – с духами злобы поднебесными; венчаешь успехами дела мои, о имени Твоем совершаемые.\n\nЗа всё сие благодарю, славлю и благословляю всеблагую, отеческую, всесильную державу Твою, Боже, Спасителю, Благодетелю наш. Но познан буди тако, якоже мне познался еси, Человеколюбче, и прочим людям Твоим, да ведают Тебя, Отца всех, Твою благость, Твой промысл, Твою премудрость и силу и прославят Тебя со Отцем и Святым Духом ныне и присно и во веки веков. Аминь."
  },
  {
    "slug": "ioann-kronshtadtsky-blagodarenie-za-dary",
    "title": "Иная благодарственная молитва ко Господу",
    "text": "Благодарю Тя, Господи Боже мой, за дарование мне бытия, за рождение меня в христианской вере, за Пречистую Деву Марию, Ходатаицу о спасении рода нашего, за святых Угодников Твоих, молящихся за нас, за Ангела Хранителя, за общественное богослужение, поддерживающее в нас веру и добродетель, за Священное Писание, за Святые Таинства, а в особенности Тело и Кровь Твою, за таинственные благодатные утешения, за надежду получить Царствие Небесное и за все блага, Тобою мне дарованные."
  },
  {
    "slug": "ioann-kronshtadtsky-molitva-ko-presvyatoi-troitse",
    "title": "Молитва ко Пресвятой Троице",
    "text": "О Троице, Боже наш, про́стое Существо, создавший и душу нашу по образу Твоему, да в Тебе жизнь и мир свой имеем!\n\nО Троице, Питательница и Надежда наша! Даждь нам в Тебе единой всегда надежду свою полагать, в Тебе единой жизнь и покой обретать.\n\nО Троице! Ты, как мать, носишь всех нас на руках Своих и всех нас питаешь из рук Своих, как нежнейшая мать! Ты никогда не забываешь и не забудешь нас; ибо Ты Сам сказал: если и женщина забудет чадо свое – Я не забуду тебя (Ис.49:15), то есть не перестану питать, охранять, защищать и спасать тебя."
  }
];
const fail = reason => { throw new Error(reason + ' — NO FILES MODIFIED.'); };
const normalizeText = value => String(value || '').replace(/\r\n/g, '\n').trim();
const original = fs.readFileSync(file, 'utf8');
const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
const source = original.slice(bom.length);
let data;
try { data = JSON.parse(source); } catch (error) { fail('Invalid offlineContent.json: ' + error.message); }
if (!Array.isArray(data.categories) || !data.category_texts ||
    !data.texts || typeof data.texts !== 'object' || !data.prayer_rules) {
  fail('Unexpected offline content schema');
}
const rootCategory = data.categories.find(category => category.slug === rootSlug);
if (!rootCategory || !(Number(rootCategory.id) > 0)) fail('Missing parent category ' + rootSlug);
const categories = data.categories;
const rows = data.category_texts;
const textIndex = data.texts;
const maxId = values => Math.max(0, ...values.map(x => Number(x?.id)).filter(Number.isFinite));
const maxCategoryId = maxId(categories);
let category = categories.find(item => item.slug === categorySlug);
let changed = false;
const summary = [];
if (category) {
  if (Number(category.parent) !== Number(rootCategory.id)) fail('Subcategory exists under different parent');
} else {
  const siblingOrders = categories.filter(item => Number(item.parent) === Number(rootCategory.id))
    .map(item => Number(item.order || 0));
  category = {
    id: maxCategoryId + 1,
    name: categoryName,
    name_uk: '',
    slug: categorySlug,
    parent: rootCategory.id,
    order: Math.max(0, ...siblingOrders) + 10,
    icon: '',
  };
  categories.push(category);
  changed = true;
  summary.push('Created category ' + categorySlug);
}
if (rows[categorySlug] && !Array.isArray(rows[categorySlug])) fail('Invalid category row array');
if (!rows[categorySlug]) {
  rows[categorySlug] = [];
  changed = true;
}
const usedTextIds = new Set(Object.values(textIndex)
  .map(text => Number(text?.id)).filter(Number.isFinite));
const usedRowIds = new Set(Object.values(rows).flat()
  .map(row => Number(row?.id)).filter(Number.isFinite));
let nextTextId = Math.max(0, ...usedTextIds) + 1;
let nextRowId = Math.max(0, ...usedRowIds) + 1;
for (let i = 0; i < PRAYERS.length; i++) {
  const prayer = PRAYERS[i];
  const stored = textIndex[prayer.slug];
  if (stored && normalizeText(stored.translation) !== normalizeText(prayer.text)) {
    fail('Prayer slug already exists with different content: ' + prayer.slug);
  }
  let text = stored;
  if (!text) {
    while (usedTextIds.has(nextTextId)) nextTextId += 1;
    text = {
      id: nextTextId++,
      slug: prayer.slug,
      title: prayer.title,
      title_uk: '',
      traditional_title: '',
      description: 'Святой праведный Иоанн Кронштадтский',
      description_uk: '',
      content: '',
      traditional_content: '',
      translation: prayer.text,
      translation_uk: '',
      categories: [category],
      description_position: 'after',
      language: 'ru',
      source_url: sourceUrl,
    };
    textIndex[prayer.slug] = text;
    changed = true;
    summary.push('Added prayer ' + prayer.title);
  }
  const list = rows[categorySlug];
  const existingRow = list.find(row => row?.text?.slug === prayer.slug);
  if (existingRow) {
    if (Number(existingRow.text.id) !== Number(text.id)) fail('Existing category row has conflicting id: ' + prayer.slug);
  } else {
    while (usedRowIds.has(nextRowId)) nextRowId += 1;
    list.push({id: nextRowId++, category, text, order: (i + 1) * 10});
    changed = true;
    summary.push('Linked prayer ' + prayer.title);
  }
}
if (rows[categorySlug].filter(row => PRAYERS.some(p => p.slug === row?.text?.slug)).length !== PRAYERS.length) {
  fail('Prayer category integrity check failed');
}
if (!changed) {
  console.log('PASS: all three St John of Kronstadt prayers already installed. No changes.');
  process.exit(0);
}
if (process.argv.includes('--dry-run')) {
  console.log('DRY RUN PASS. Would add/update:');
  for (const line of summary) console.log(' - ' + line);
  console.log('NO FILES MODIFIED');
  process.exit(0);
}
// Keep version hashes deterministic for cache invalidation when new content ships.
// Preserve original JSON formatting if it was compact or pretty printed.
const {schema_version, content_version, generated_at, ...versionSource} = data;
const stableObject = value => Array.isArray(value) ? value.map(stableObject) :
  value && typeof value === 'object' ? Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableObject(value[key])])
  ) : value;
data.content_version = crypto.createHash('sha256').update(
  JSON.stringify(stableObject(versionSource)), 'utf8'
).digest('hex');
data.generated_at = new Date().toISOString();
const pretty = /^\{\s*\n/.test(source);
let serialized = JSON.stringify(data, null, pretty ? 2 : 0) + '\n';
if (source.includes('\r\n')) serialized = serialized.replace(/\n/g, '\r\n');
const backupDir = path.resolve(root, '..', 'build-backups',
  'ioann-kronshtadtsky-before-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive: true});
const backupFile = path.join(backupDir, 'offlineContent.json');
fs.copyFileSync(file, backupFile);
const temporary = file + '.ioann-import-tmp';
try {
  fs.writeFileSync(temporary, bom + serialized, 'utf8');
  const checked = JSON.parse(fs.readFileSync(temporary, 'utf8').replace(/^\uFEFF/, ''));
  if (checked.category_texts[categorySlug].length < 3) fail('Final validation failed');
  fs.renameSync(temporary, file);
} catch (error) {
  try {fs.unlinkSync(temporary);} catch {}
  throw error;
}
console.log('PASS: 3 complete prayers added to offlineContent.json in ' + categoryName);
console.log('Source: ' + sourceUrl);
console.log('Backup: ' + backupFile);
console.log('Note: rebuild the bundled search database before the next APK release.');
