(function apply(){
const fs=require('fs'),path=require('path'),root=process.cwd();
const files={
 doc:path.join(root,'src/services/hoursDocument.js'),
 edit:path.join(root,'src/services/hoursFirstHourEditorial.js'),
};
const before={};for(const [k,p] of Object.entries(files)){if(!fs.existsSync(p))throw Error('Не найден файл '+p);before[k]=fs.readFileSync(p,'utf8')}
let doc=before.doc.replace(/\r\n/g,'\n'),edit=before.edit.replace(/\r\n/g,'\n');
const tag='HOURS_FAST_EDITORIAL_20261116';
if(doc.includes(tag)&&edit.includes(tag)){console.log('OK: ускорение уже применено');return}
if(doc.includes(tag)||edit.includes(tag))throw Error('Частичная установка; ничего не изменено');
const once=(s,a,b,label)=>{
 const i=s.indexOf(a);
 if(i<0||i!==s.lastIndexOf(a))throw Error('Локальный участок отличается: '+label+'. Файлы не изменены.');
 return s.replace(a,b);
};
doc=once(doc,
`  const firstHourEdit = isFirstHour
    ? getEditedFirstHour(content)
    : {applied: false};
  const firstHourRussian = isFirstHour ? getFirstHourRussianSections() : null;
  const useFirstHourEdit = firstHourEdit.applied &&
    (viewMode === READER_LANGUAGE_MODES.CHURCH ||
      viewMode === READER_LANGUAGE_MODES.BOTH);`,
`  // HOURS_FAST_EDITORIAL_20261116:
  // The editorial Church Slavonic Psalm pass is not needed for RU/traditional.
  // Never scan and normalize the complete Psalter for modes that do not use it.
  const modeNeedsEditorial = isFirstHour &&
    (viewMode === READER_LANGUAGE_MODES.CHURCH ||
     viewMode === READER_LANGUAGE_MODES.BOTH);
  const firstHourEdit = modeNeedsEditorial
    ? getEditedFirstHour(content) : {applied: false};
  const firstHourRussian = isFirstHour &&
    (viewMode === READER_LANGUAGE_MODES.RUSSIAN ||
     viewMode === READER_LANGUAGE_MODES.BOTH)
    ? getFirstHourRussianSections() : null;
  const useFirstHourEdit = modeNeedsEditorial && firstHourEdit.applied;`,
 'unconditional First Hour editorial pass');
const start=edit.indexOf('const accentlessWithOffsets = (value) => {');
const end=edit.indexOf('\nconst locateOldAfterPsalm =',start);
if(start<0||end<0||edit.indexOf('const accentlessWithOffsets = (value) => {',start+1)!==-1)
 throw Error('Не найден однозначный сканер редакционного псалма; файлы не изменены.');
const oldScanner=edit.slice(start,end);
if(!oldScanner.includes('const normalized = clean(cluster);')||!oldScanner.includes('positions.push(beginning);'))
 throw Error('Сканер отличается от ожидаемого; файлы не изменены.');
const optimized=`// HOURS_FAST_EDITORIAL_20261116: Most Psalm letters are plain Cyrillic.
// Avoid running Unicode normalize(), regex replacement, locale lowercase
// and trim() for *every glyph* on Android Hermes. Keep the original
// output and UTF-16 offsets, including the existing whitespace behaviour.
const accentlessWithOffsets = (value) => {
  const source = String(value || '');
  const chars = [];
  const positions = [];
  const stripped = /[\\u0300\\u0301\\u0340\\u0341\\u0483-\\u0489]/u;
  const trailingMark = /[\\u0300-\\u036f\\u0483-\\u0489]/u;
  for (let i = 0; i < source.length;) {
    const beginning = i;
    const code = source.codePointAt(i);
    const base = String.fromCodePoint(code);
    i += base.length;
    let cluster = base;
    let otherCombining = false;
    while (i < source.length && trailingMark.test(source[i])) {
      const mark = source[i++];
      cluster += mark;
      if (!stripped.test(mark)) otherCombining = true;
    }
    // clean(cluster) trims individual spaces; preserve this old behaviour
    // so editorial cut points cannot shift inadvertently in this patch.
    if (/\\s/u.test(base) || stripped.test(base)) continue;
    // Fast path: ordinary Cyrillic/ASCII characters + stress marks
    // removed by clean(). Normalization is unnecessary for these clusters.
    const simple = !otherCombining && (
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0x410 && code <= 0x44f) ||
      code === 0x401 || code === 0x451 ||
      (code >= 0x460 && code <= 0x52f && code !== 0x48d && code !== 0x48c) ||
      (code >= 0xa640 && code <= 0xa69f)
    );
    const normalized = simple ? base : clean(cluster);
    for (const char of normalized) {
      chars.push(char);
      positions.push(beginning);
    }
  }
  return {plain: chars.join('').toLocaleLowerCase('ru'), positions};
};
`;
edit=edit.slice(0,start)+optimized+edit.slice(end);
const changes=[{file:files.doc,orig:before.doc,next:doc.replace(/\n/g,before.doc.includes('\r\n')?'\r\n':'\n')},
{file:files.edit,orig:before.edit,next:edit.replace(/\n/g,before.edit.includes('\r\n')?'\r\n':'\n')}];
const suffix='.backup-hours-editorial-fast-'+new Date().toISOString().replace(/[:.]/g,'-');
try{
 for(const e of changes)fs.writeFileSync(e.file+suffix,e.orig,'utf8');
 for(const e of changes)fs.writeFileSync(e.file,e.next,'utf8');
}catch(err){for(const e of changes)try{fs.writeFileSync(e.file,e.orig,'utf8')}catch(_){};throw err}
console.log('OK: ускорена обработка Первого часа. Файлов: '+changes.length);
console.log('RU и ЦС традиционный больше не запускают редакционную обработку церковнославянских псалмов.');
console.log('ЦС и ЦС+RU обрабатывают диакритику без тысяч повторных Unicode normalize().');
console.log('Резервные копии: '+suffix);
})();
