(function patchHoursLoading(){
  const fs=require('fs'),path=require('path');
  const filename=path.join(process.cwd(),'src/components/reader/SelectableDocumentReader.js');
  if(!fs.existsSync(filename))throw Error('Не найден файл: '+filename);
  const original=fs.readFileSync(filename,'utf8');
  const tag='HOURS_FONT_PROGRESS_STABILIZER_20261116';
  if(original.includes(tag)){console.log('OK: исправление уже применено');return}
  let s=original;
  function replaceOnce(oldVal,newVal,label){
    const at=s.indexOf(oldVal);
    if(at<0 || at!==s.lastIndexOf(oldVal))throw Error(label+': не найден уникальный участок; файл не изменён.');
    s=s.replace(oldVal,newVal);
  }
  replaceOnce(
    `  const [ponomarFontDataUri, setPonomarFontDataUri] = useState(() =>
    needsPonomar ? getCachedPonomarFontDataUri() : ''
  );`,
    `  const [ponomarFontDataUri, setPonomarFontDataUri] = useState(() =>
    needsPonomar ? getCachedPonomarFontDataUri() : ''
  );
  // HOURS_FONT_PROGRESS_STABILIZER_20261116: bundled Ponomar is synchronous.
  // For Hours, avoid rendering once without the font and again after its effect.
  const hoursFontUri = documentData?.progressAnchorType === 'hours_row'
    ? (needsPonomar ? getCachedPonomarFontDataUri() : '')
    : ponomarFontDataUri;
  const hoursInitialProgressRef = useRef(savedProgress);
  const hoursPendingProgressRef = useRef(null);
  const hoursWebViewReadyRef = useRef(false);`,
    'font state');
  const effectStart=s.indexOf('  useEffect(() => {\n    if (!needsPonomar) {');
  const effectEnd=s.indexOf('  const itemConfigMap = useMemo(',effectStart);
  if(effectStart<0||effectEnd<0)throw Error('Ponomar effect отличается; файл не изменён.');
  const effect=s.slice(effectStart,effectEnd);
  if(!effect.includes('  }, [needsPonomar]);'))throw Error('Не совпали зависимости эффекта шрифта; файл не изменён.');
  const revised=effect.replace('  useEffect(() => {\n    if (!needsPonomar) {',
    `  useEffect(() => {
    // Hours use the synchronous bundled font directly; no state transition.
    if (documentData?.progressAnchorType === 'hours_row') return undefined;
    if (!needsPonomar) {`)
  .replace('  }, [needsPonomar]);','  }, [needsPonomar, documentData?.progressAnchorType]);');
  s=s.slice(0,effectStart)+revised+s.slice(effectEnd);
  replaceOnce('      savedProgress: effectiveProgress,',
    `      savedProgress: documentData?.progressAnchorType === 'hours_row' && !captured?.anchorId
        ? hoursInitialProgressRef.current : effectiveProgress,`,
    'initial progress payload');
  replaceOnce('      ponomarFontDataUri,','      ponomarFontDataUri: hoursFontUri,','HTML font input');
  replaceOnce('ponomarFontDataUri, htmlReadingSettings, embedded, embeddedTextStyle]);',
    'hoursFontUri, htmlReadingSettings, embedded, embeddedTextStyle]);',
    'HTML memo dependencies');
  const injectAnchor='  const inject = (script) => {';
  if(s.indexOf(injectAnchor)<0)throw Error('Не найден inject; файл не изменён.');
  // Insert effect after inject, which supports useRef-driven late progress restoration.
  const injectBlock=`  const inject = (script) => {
    webViewRef.current?.injectJavaScript(script + '; true;');
  };`;
  replaceOnce(injectBlock,
   `${injectBlock}

  const flushHoursPendingProgress = () => {
    const current = hoursPendingProgressRef.current;
    if (!current || !hoursWebViewReadyRef.current) return;
    const anchorId = Number(current.anchor_id);
    if (!Number.isFinite(anchorId) || anchorId <= 0) {
      hoursPendingProgressRef.current = null;
      return;
    }
    inject('window.readerApi && window.readerApi.goToProgress(' +
      scriptSafeJson({anchorId, offset: Math.max(0, Number(current.offset || 0))}) + ')');
    hoursPendingProgressRef.current = null;
  };

  useEffect(() => {
    if (documentData?.progressAnchorType !== 'hours_row' ||
        !savedProgress || savedProgress === hoursInitialProgressRef.current) return;
    // A late progress read should scroll the existing WebView, not reload
    // and reparse the full First Hour HTML a second time.
    hoursPendingProgressRef.current = savedProgress;
    flushHoursPendingProgress();
  }, [savedProgress, documentData?.progressAnchorType]);`,
   'late progress effect');
  const loadStartRe=/onLoadStart\s*=\s*\{\s*\([^)]*\)\s*=>\s*\{/g;
  const matches=[...s.matchAll(loadStartRe)];
  if(matches.length>1)throw Error('Несколько onLoadStart; файл не изменён.');
  if(matches.length===1){
    const m=matches[0];
    s=s.slice(0,m.index+m[0].length)+
      `\n          if (documentData?.progressAnchorType === 'hours_row') hoursWebViewReadyRef.current = false;`+
      s.slice(m.index+m[0].length);
  } else {
    const opening='        onLoadEnd={(event) => {';
    replaceOnce(opening,
      `        onLoadStart={() => {
          if (documentData?.progressAnchorType === 'hours_row') hoursWebViewReadyRef.current = false;
        }}
${opening}`,
      'onLoadStart insertion');
  }
  replaceOnce('        onLoadEnd={(event) => {',
    `        onLoadEnd={(event) => {
          if (documentData?.progressAnchorType === 'hours_row') {
            hoursWebViewReadyRef.current = true;
            flushHoursPendingProgress();
          }`,
    'onLoadEnd completion');
  const backup=filename+'.backup-hours-font-progress-'+new Date().toISOString().replace(/[:.]/g,'-');
  fs.writeFileSync(backup,original,'utf8');
  fs.writeFileSync(filename,s,'utf8');
  console.log('OK: применена стабилизация загрузки Часов. Бэкап '+backup);
  console.log('Шрифт Ponomar в Часах берётся синхронно, без лишней загрузки.');
  console.log('Запоздалый прогресс чтения применяется без повторного HTML.');
  console.log('Языки, молитвы и все остальные читалки не изменены.');
})();
