// Safe local patch for First Hour reader. Never overwrites other local work.
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const stylesPath = path.join(root, 'src/components/reader/selectableDocumentReader/styles.js');
const readerPath = path.join(root, 'src/components/reader/SelectableDocumentReader.js');
const tag = 'first-hour-psalm-initial-spacing-20261116';
const css = `
    /* ${tag}: keep the highlighted glyph visually joined to its word. */
    .rule-item.hours-section-psalm .reader-text .hours-initial-word > .hours-mark-initial {
      margin-right: -0.10em !important;
    }
`;
const oldSetting = 'getReadingSettings().then((settings) => { if (active) setReadingSettings(settings); }).catch(console.warn);';
const newSetting = `getReadingSettings().then((settings) => {
      if (!active) return;
      setReadingSettings(previous => {
        const fields = ['defaultMode', 'fontSize', 'interfaceScale', 'palette', 'customBackground', 'customText'];
        return fields.every(field => previous?.[field] === settings?.[field])
          ? previous : settings;
      });
    }).catch(console.warn);`;
function read(file) { if (!fs.existsSync(file)) throw Error('Файл не найден: ' + file); return fs.readFileSync(file,'utf8'); }
const originalStyles = read(stylesPath), originalReader = read(readerPath);
let styles = originalStyles, reader = originalReader;
if (!styles.includes(tag)) {
  const anchor = '    .rule-item.hours-section .reader-text .hours-mark-initial {';
  if (!styles.includes(anchor) || !styles.includes('hours-initial-word')) throw Error('Не найдена ожидаемая разметка для буквицы. Никаких файлов не изменено.');
  styles = styles.replace(anchor, css + anchor);
}
if (!reader.includes("const fields = ['defaultMode', 'fontSize', 'interfaceScale', 'palette', 'customBackground', 'customText'];")) {
  if (!reader.includes(oldSetting)) throw Error('Загрузка настроек в читалке отличается от ожидаемой. Никаких файлов не изменено.');
  reader = reader.replace(oldSetting, newSetting);
}
if (styles === originalStyles && reader === originalReader) { console.log('OK: оба исправления уже присутствуют'); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const changes = [[stylesPath,originalStyles,styles], [readerPath,originalReader,reader]].filter(([p,a,b])=>a!==b);
try {
  for (const [file,oldValue] of changes) fs.writeFileSync(file + '.backup-first-hour-' + stamp, oldValue, 'utf8');
  for (const [file,_,newValue] of changes) fs.writeFileSync(file,newValue,'utf8');
} catch (error) {
  for (const [file,oldValue] of changes) fs.writeFileSync(file,oldValue,'utf8');
  throw error;
}
console.log('OK: исправлено файлов: '+ changes.length);
console.log('1. Уменьшен визуальный отступ после красной буквы первого слова псалма.');
console.log('2. Пропущена повторная сборка HTML, если глобальные настройки чтения не поменялись.');
console.log('Созданы резервные копии изменённых файлов.');
