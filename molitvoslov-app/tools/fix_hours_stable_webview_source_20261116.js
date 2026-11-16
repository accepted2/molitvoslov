(function applyFix(){
  const fs = require('fs');
  const path = require('path');
  const file = path.join(process.cwd(),'src/components/reader/SelectableDocumentReader.js');
  if(!fs.existsSync(file))throw Error('Не найден: '+file);
  const original=fs.readFileSync(file,'utf8');
  const marker='HOURS_WEBVIEW_STABLE_SOURCE_20261116';
  if(original.includes(marker)){console.log('OK: stable source уже применён');return}
  // This is a single React source-identity change, no document or content changes.
  if(!/import\s+React[^\n]*\buseMemo\b/.test(original))
    throw Error('useMemo не обнаружен — исходный компонент отличается, файлы не изменены.');
  const patterns=[
    /source\s*=\s*\{\s*\{\s*html\s*,?\s*\}\s*\}/g,
    /source\s*=\s*\{\s*\{\s*html\s*:\s*html\s*,?\s*\}\s*\}/g
  ];
  const matches=patterns.flatMap(re=>[...original.matchAll(re)]);
  if(matches.length!==1)throw Error('Ожидался ровно один source={{html}}, обнаружено '+matches.length+'. Ничего не изменено.');
  const anchor='  const inject = (script) => {';
  if(original.split(anchor).length!==2)throw Error('Не найден уникальный inject; файлы не изменены.');
  let modified=original.replace(anchor,
    `  // HOURS_WEBVIEW_STABLE_SOURCE_20261116: avoid a new source identity on unrelated re-renders.
  // Language change still updates HTML and reloads the WebView as before.
  const webViewSource = useMemo(() => ({html}), [html]);

`+anchor);
  modified=modified.replace(matches[0][0],'source={webViewSource}');
  if(modified===original)throw Error('Изменения не созданы.');
  const suffix='.backup-stable-source-'+new Date().toISOString().replace(/[:.]/g,'-');
  fs.writeFileSync(file+suffix,original,'utf8');
  fs.writeFileSync(file,modified,'utf8');
  console.log('OK: stable WebView source применён. Создан бэкап: '+suffix);
  console.log('Повторное создание source без изменения HTML теперь исключено. Запусти Metro и проверь повторы LOAD_START.');
})();
