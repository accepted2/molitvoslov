(function fixFromUploadedFiles() {
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const root = process.cwd();
  const originalHashes = {
    'src/screens/HoursReadingScreen.js': '568e61e9697758252e1a8d95173901b8a50f9b0e8890ac90cd4476a864cfe466',
    'src/components/reader/SelectableDocumentReader.js': '3e5c95209173864e19c4cbd2a940ebcf0ce185e9c506056e8a44322ab742cc59',
  };
  const finalHashes = {
    'src/screens/HoursReadingScreen.js': '4023e920c116683b02c2b10d98a93e78c1eb018aa8e9152607348d4e6b1efa80',
    'src/components/reader/SelectableDocumentReader.js': 'ef1e0cc40ff1ecaa89f81d34ab20f33eb709682e89f7f1ae9a9f798a0d899200',
  };
  const digest = x => crypto.createHash('sha256').update(x).digest('hex');
  function replaceOne(source, oldText, newText, label) {
    const idx = source.indexOf(oldText);
    if (idx === -1 || source.lastIndexOf(oldText) !== idx)
      throw Error('Не совпадает локальный код: ' + label + '. Ничего не записано.');
    return source.replace(oldText, newText);
  }
  function transformScreen(s) {
    s=replaceOne(s,
`  getReaderLanguageModePreference,
  saveReaderLanguageModePreference,`,
`  getReaderLanguageModePreference,
  getReadingSettings,
  DEFAULT_READING_SETTINGS,
  saveReaderLanguageModePreference,`, 'screen preferences imports');
    s=replaceOne(s,
`  const [viewMode, setViewMode] = useState(READER_LANGUAGE_MODES.CHURCH);`,
`  // Resolve locally stored language and reading settings before creating the
  // expensive WebView. Otherwise the First Hour opens with the wrong language
  // and immediately parses the complete document a second time.
  const [initialReaderState, setInitialReaderState] = useState(null);
  const initialReaderReady = initialReaderState?.entryId === entryId;
  const viewMode = initialReaderReady
    ? initialReaderState.mode : READER_LANGUAGE_MODES.CHURCH;
  const initialReadingSettings = initialReaderReady
    ? initialReaderState.settings : null;`, 'screen mode state');
    s=replaceOne(s,
`  useEffect(() => {
    let active = true;
    setViewMode(READER_LANGUAGE_MODES.CHURCH);
    if (entryId) {
      getReaderLanguageModePreference({sourceType: 'hours', sourceId: entryId})
        .then((saved) => {
          if (active && VALID_MODES.includes(saved)) setViewMode(saved);
        })
        .catch((error) => console.warn('[hours] reader mode:', error?.message || error));
    }
    return () => {active = false;};
  }, [entryId]);

  const handleViewModeChange = (nextMode) => {
    if (!VALID_MODES.includes(nextMode)) return;
    setViewMode(nextMode);
    if (entryId) {
      saveReaderLanguageModePreference({
        sourceType: 'hours',
        sourceId: entryId,
        mode: nextMode,
      }).catch((error) => console.warn('[hours] save reader mode:', error?.message || error));
    }
  };`,
`  useEffect(() => {
    let active = true;
    if (entryId) {
      Promise.all([
        getReaderLanguageModePreference({sourceType: 'hours', sourceId: entryId})
          .catch(error => {
            console.warn('[hours] reader mode:', error?.message || error);
            return null;
          }),
        getReadingSettings().catch(error => {
          console.warn('[hours] reading settings:', error?.message || error);
          return DEFAULT_READING_SETTINGS;
        }),
      ]).then(([saved, settings]) => {
        if (!active) return;
        const mode = VALID_MODES.includes(saved) ? saved
          : (VALID_MODES.includes(settings?.defaultMode)
            ? settings.defaultMode : READER_LANGUAGE_MODES.CHURCH);
        setInitialReaderState({entryId, mode, settings});
      });
    }
    return () => {active = false;};
  }, [entryId]);

  const handleViewModeChange = (nextMode) => {
    if (!initialReaderReady || !VALID_MODES.includes(nextMode) || nextMode === viewMode) return;
    setInitialReaderState(previous => previous?.entryId === entryId
      ? {...previous, mode: nextMode} : previous);
    if (entryId) {
      saveReaderLanguageModePreference({
        sourceType: 'hours',
        sourceId: entryId,
        mode: nextMode,
      }).catch((error) => console.warn('[hours] save reader mode:', error?.message || error));
    }
  };`, 'screen mode effect');
    s=replaceOne(s,
`  const readerBackground = resolveReaderAppearance(appearance).background;`,
`  const readerBackground = resolveReaderAppearance(appearance).background;
  // Progress is read from the local database. Mount only once both it and
  // language are ready to avoid replacing the WebView source after mount.
  const readerReady = initialReaderReady && progressReady;`, 'screen progress gate');
    s=replaceOne(s,
`      {((documentData?.sections?.length && content?.sections?.length) ||`,
`      {!readerReady ? (
        <View style={[styles.center, {paddingTop: hoursHeaderHeightRef.current}]}>
          <Text style={[styles.emptyText, {
            color: isDarkReaderBackground(readerBackground) ? '#F4E7D2' : '#80634B',
          }]}>
            Подготовка чтения…
          </Text>
        </View>
      ) : ((documentData?.sections?.length && content?.sections?.length) ||`, 'screen render gate');
    s=replaceOne(s,
`          savedProgress={progressReady ? savedProgress : null}`,
`          savedProgress={savedProgress}
          initialReadingSettings={initialReadingSettings}`, 'screen pref prop');
    s=replaceOne(s,
`        <View style={[styles.center, {paddingTop: headerHeight}]}>`,
`        <View style={[styles.center, {paddingTop: hoursHeaderHeightRef.current}]}>`, 'screen undefined header');
    s=replaceOne(s,
`        languageSwitcher={documentData?.viewSwitcher}`,
`        languageSwitcher={readerReady ? documentData?.viewSwitcher : null}`, 'screen language guard');
    return s;
  }
  function transformReader(s) {
    s=replaceOne(s,
`    documentData,
    savedProgress,
    focusTarget,`,
`    documentData,
    savedProgress,
    initialReadingSettings = null,
    focusTarget,`, 'reader initial props');
    s=replaceOne(s,
`  const [readingSettings, setReadingSettings] = useState(DEFAULT_READING_SETTINGS);`,
`  const [readingSettings, setReadingSettings] = useState(
    () => initialReadingSettings || DEFAULT_READING_SETTINGS
  );`, 'reader initial settings');
    s=replaceOne(s,
`  const scrollFallbackRef = useRef(null);

  const needsPonomar`,
`  const scrollFallbackRef = useRef(null);
  const isHoursDocument = documentData?.progressAnchorType === 'hours_row';

  const needsPonomar`, 'reader hours flag');
    s=replaceOne(s,
`  const [ponomarFontDataUri, setPonomarFontDataUri] = useState(() =>
    needsPonomar ? getCachedPonomarFontDataUri() : ''
  );

  useEffect(() => {
    if (!needsPonomar) {`,
`  const [ponomarFontDataUri, setPonomarFontDataUri] = useState(() =>
    needsPonomar ? getCachedPonomarFontDataUri() : ''
  );
  // The bundled Ponomar data URI is already available synchronously. A
  // state-driven update after switching Hours to traditional caused two full
  // WebView navigations (first without the font, then with ~450 KB of font).
  const effectivePonomarFontDataUri = isHoursDocument
    ? (needsPonomar ? getCachedPonomarFontDataUri() : '')
    : ponomarFontDataUri;

  useEffect(() => {
    if (isHoursDocument) return undefined;
    if (!needsPonomar) {`, 'reader font initialization');
    s=replaceOne(s,`  }, [needsPonomar]);`,`  }, [needsPonomar, isHoursDocument]);`, 'reader font effect');
    s=replaceOne(s,
`      ponomarFontDataUri,
      bookAppearance:`,
`      ponomarFontDataUri: effectivePonomarFontDataUri,
      bookAppearance:`, 'reader bundled font input');
    s=replaceOne(s,
`ponomarFontDataUri, htmlReadingSettings, embedded, embeddedTextStyle]);`,
`effectivePonomarFontDataUri, htmlReadingSettings, embedded, embeddedTextStyle]);`, 'reader HTML deps');
    s=replaceOne(s,
`  // HOURS_WEBVIEW_STABLE_SOURCE_20261116: avoid a new source identity on unrelated re-renders.
  // Language change still updates HTML and reloads the WebView as before.
  const webViewSource = useMemo(() => ({html}), [html]);

`, '', 'reader remove unused source');
    s=replaceOne(s,
`  const isHoursDocument = documentData?.progressAnchorType === 'hours_row';
  let hoursDisplayedHtml = html;`,
`  let hoursDisplayedHtml = html;`, 'reader duplicate flag');
    s=replaceOne(s,
`      previous.font === ponomarFontDataUri &&`,
`      previous.font === effectivePonomarFontDataUri &&`, 'reader cache font compare');
    s=replaceOne(s,
`        font: ponomarFontDataUri, focusTarget,`,
`        font: effectivePonomarFontDataUri, focusTarget,`, 'reader cache font update');
    return s;
  }
  const specs = [
    {name:'src/screens/HoursReadingScreen.js',patch:transformScreen},
    {name:'src/components/reader/SelectableDocumentReader.js',patch:transformReader},
  ];
  const all = [];
  let installed = 0;
  for(const spec of specs){
    const file = path.join(root,...spec.name.split('/'));
    if(!fs.existsSync(file))throw Error('Файл не найден: '+file);
    const original = fs.readFileSync(file);
    const hash = digest(original);
    if (hash === finalHashes[spec.name]) {
      installed++;
      continue;
    }
    if(hash !== originalHashes[spec.name]) throw Error(
      'Этот файл изменился после загрузки архива: '+spec.name+
      '\nОжидалось: '+originalHashes[spec.name]+'\nФактически: '+hash+
      '\nНикакие файлы не изменены.'
    );
    const oldText=original.toString('utf8');
    const eol=oldText.includes('\r\n')?'\r\n':'\n';
    const newText=spec.patch(oldText.replace(/\r\n/g,'\n')).replace(/\n/g,eol);
    const patched=Buffer.from(newText,'utf8');
    const patchedHash=digest(patched);
    if(patchedHash!==finalHashes[spec.name])throw Error(
      'Контрольная сумма результата не совпала: '+spec.name+
      '\nОжидалось: '+finalHashes[spec.name]+'\nФактически: '+patchedHash+
      '\nНичего не изменено.'
    );
    all.push({file,original,patched});
  }
  if(installed===specs.length){console.log('OK: исправление уже применено, повторно делать ничего не нужно.');return}
  if(installed>0)throw Error('Файлы исправлены частично. Ничего не изменено.');
  const suffix='.backup-hours-from-zip-20261116-'+new Date().toISOString().replace(/[:.]/g,'-');
  const written=[];
  try {
    for(const obj of all)fs.writeFileSync(obj.file+suffix,obj.original);
    for(const obj of all){fs.writeFileSync(obj.file,obj.patched);written.push(obj)}
  }catch(e){
    for(const obj of written)fs.writeFileSync(obj.file,obj.original);
    throw e;
  }
  console.log('OK: исправлены файлы: '+written.length);
  console.log('Веб-читатель не открывается до загрузки языка, настроек и локального прогресса.');
  console.log('Традиционный Ponomar загружается одновременно с HTML, без повторного перехода.');
  console.log('Исправлена ссылка на отсутствующий headerHeight; резервные копии: '+suffix);
})();
