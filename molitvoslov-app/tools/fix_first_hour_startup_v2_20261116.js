(function patch() {
  const fs = require('fs');
  const path = require('path');
  const base = process.cwd();
  const locations = {
    css: path.join(base,'src/components/reader/selectableDocumentReader/styles.js'),
    reader: path.join(base,'src/components/reader/SelectableDocumentReader.js'),
    hours: path.join(base,'src/screens/HoursReadingScreen.js'),
  };
  const input = {};
  for (const [key,file] of Object.entries(locations)) {
    if (!fs.existsSync(file)) throw Error('Не найден файл: '+file);
    input[key] = fs.readFileSync(file,'utf8');
  }
  function replaceOnce(s,a,b,label){
    if (s.indexOf(a) < 0 || s.indexOf(a) !== s.lastIndexOf(a))
      throw Error(label + ': исходный код отличается от ожидаемого. Файлы не изменены.');
    return s.replace(a,b);
  }
  let {css,reader,hours} = input;
  const marker='hours-psalm-flex-word-20261116';
  if (!css.includes(marker)) {
    if (!css.includes('hours-initial-word') || !css.trimEnd().endsWith('`;'))
      throw Error('CSS читалки не совпадает с ожидаемым. Файлы не изменены.');
    const rule = `
    /* hours-psalm-flex-word-20261116 */
    .rule-item.hours-section-psalm .reader-text .hours-initial-word {
      display: inline-flex !important;
      flex-flow: row nowrap !important;
      align-items: baseline !important;
      gap: 0 !important;
      white-space: nowrap !important;
      word-spacing: 0 !important;
      letter-spacing: 0 !important;
      vertical-align: baseline !important;
      text-align: left !important;
    }
    .rule-item.hours-section-psalm .reader-text .hours-initial-word > span {
      display: inline !important;
      flex: 0 0 auto !important;
      margin: 0 !important;
      padding: 0 !important;
      word-spacing: 0 !important;
      letter-spacing: 0 !important;
    }
`;
    css=css.replace(/\s*`;\s*$/, '\n'+rule+'\n  `;\n');
  }
  if (!reader.includes('setTopContentInset: (height) => {')) {
    reader=replaceOnce(reader,'      goToProgress: (progress) => {',`      setTopContentInset: (height) => {
        const pixels = Math.max(14, Number(height || 0) + 14);
        inject("document.body && document.body.style.setProperty('--reader-top-padding', " +
          scriptSafeJson(pixels + 'px') + ")");
      },
      goToProgress: (progress) => {`,'Reader imperative handle');
  }
  if (!hours.includes('const hoursHeaderHeightRef = useRef(')) {
    hours=replaceOnce(hours,
      '  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);',
      `  const hoursHeaderHeightRef = useRef(insets.top + 56);
  const handleHoursHeaderHeight = (height) => {
    if (!Number.isFinite(Number(height)) || Number(height) <= 0) return;
    hoursHeaderHeightRef.current = Number(height);
    readerRef.current?.setTopContentInset(Number(height));
  };`,'Hours header');
    hours=replaceOnce(hours,'          topContentInset={headerHeight}',
      '          topContentInset={insets.top + 56}','Hours reader padding');
    hours=replaceOnce(hours,
      '          onReady={() => readerRef.current?.applyAppearance(appearance)}',
      `          onReady={() => {
            readerRef.current?.applyAppearance(appearance);
            readerRef.current?.setTopContentInset(hoursHeaderHeightRef.current);
          }}`,'Hours WebView ready');
    hours=replaceOnce(hours,'        onHeaderHeightChange={setHeaderHeight}',
      '        onHeaderHeightChange={handleHoursHeaderHeight}','Hours header callback');
  }
  if (!hours.includes('const [hoursModeReady, setHoursModeReady]')) {
    hours=replaceOnce(hours,
      '  const [viewMode, setViewMode] = useState(READER_LANGUAGE_MODES.CHURCH);',
      `  const [viewMode, setViewMode] = useState(READER_LANGUAGE_MODES.CHURCH);
  const [hoursModeReady, setHoursModeReady] = useState(false);`,'Hours mode state');
    hours=replaceOnce(hours,`    let active = true;
    setViewMode(READER_LANGUAGE_MODES.CHURCH);
    if (entryId) {
      getReaderLanguageModePreference({sourceType: 'hours', sourceId: entryId})
        .then((saved) => {
          if (active && VALID_MODES.includes(saved)) setViewMode(saved);
        })
        .catch((error) => console.warn('[hours] reader mode:', error?.message || error));
    }
    return () => {active = false;};`,
    `    let active = true;
    setHoursModeReady(false);
    setViewMode(READER_LANGUAGE_MODES.CHURCH);
    if (entryId) {
      getReaderLanguageModePreference({sourceType: 'hours', sourceId: entryId})
        .then((saved) => {
          if (active && VALID_MODES.includes(saved)) setViewMode(saved);
        })
        .catch((error) => console.warn('[hours] reader mode:', error?.message || error))
        .finally(() => {if (active) setHoursModeReady(true);});
    } else {
      setHoursModeReady(true);
    }
    return () => {active = false;};`,'Hours saved mode');
    hours=replaceOnce(hours,
      '      {((documentData?.sections?.length && content?.sections?.length) ||',
      '      {hoursModeReady && ((documentData?.sections?.length && content?.sections?.length) ||',
      'Hours rendering gate');
  }
  const changed = Object.entries(locations).map(([key,file])=>({file,old:input[key],next:({css,reader,hours})[key]})).filter(x=>x.old!==x.next);
  if (!changed.length) { console.log('OK: патч уже применён.'); return; }
  const suffix='.backup-hour-v2-'+new Date().toISOString().replace(/[:.]/g,'-');
  try{
    for(const x of changed) fs.writeFileSync(x.file+suffix,x.old,'utf8');
    for(const x of changed) fs.writeFileSync(x.file,x.next,'utf8');
  }catch(e){
    for(const x of changed) {try {fs.writeFileSync(x.file,x.old,'utf8')} catch(_) {}}
    throw e;
  }
  console.log('OK: исправлены файлы: '+changed.length);
  console.log('Первое слово псалма: без разрыва и распределения пробела между красной буквой и остальными буквами.');
  console.log('Первый час: изменение высоты шапки больше не перезагружает весь HTML.');
  console.log('Первый час: первоначальная загрузка ждёт выбранный язык, устраняя лишнее открытие ЦС перед RU.');
  console.log('Резервные копии: '+suffix);
})();
