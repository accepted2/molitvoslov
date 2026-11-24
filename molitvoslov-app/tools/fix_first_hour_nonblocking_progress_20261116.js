(function apply(){
  const fs=require('fs'),path=require('path');
  const file=path.join(process.cwd(),'src/screens/HoursReadingScreen.js');
  if(!fs.existsSync(file)) throw Error('Не найден: '+file);
  const original=fs.readFileSync(file,'utf8');
  const eol=original.includes('\r\n')?'\r\n':'\n';
  let src=original.replace(/\r\n/g,'\n');
  if(src.includes('HOURS_NONBLOCKING_PROGRESS_20261116')) {
    console.log('OK: исправление уже применено');return;
  }
  function swap(a,b,label){
    const pos=src.indexOf(a);
    if(pos<0||src.lastIndexOf(a)!==pos)throw Error(label+': локальный файл отличается от присланного. Изменений нет.');
    src=src.replace(a,b);
  }
  swap(`  const readerRef = useRef(null);`,
`  const readerRef = useRef(null);
  // HOURS_NONBLOCKING_PROGRESS_20261116
  const hoursStartedRef = useRef(Date.now());
  const hoursWebViewReadyRef = useRef(null);
  const hoursRestoredRef = useRef(null);
  const hoursSwitchedRef = useRef(false);
  const hoursSwitchAtRef = useRef(0);`,'refs');
  swap(`    let active = true;
    if (entryId) {
      Promise.all([`,
`    let active = true;
    const languageStartedAt = Date.now();
    if (entryId) {
      Promise.all([`,'mode start');
  swap(`        setInitialReaderState({entryId, mode, settings});`,
`        console.warn('[HOURS_STARTUP_20261116] languageAndSettingsMs=' +
          (Date.now() - languageStartedAt) + ' entry=' + entryId);
        setInitialReaderState({entryId, mode, settings});`,'mode timing');
  swap(`  const handleViewModeChange = (nextMode) => {
    if (!initialReaderReady || !VALID_MODES.includes(nextMode) || nextMode === viewMode) return;`,
`  const handleViewModeChange = (nextMode) => {
    if (!initialReaderReady || !VALID_MODES.includes(nextMode) || nextMode === viewMode) return;
    hoursSwitchedRef.current = true;
    hoursSwitchAtRef.current = Date.now();
    console.warn('[HOURS_STARTUP_20261116] modeChangeRequest=' + nextMode);`,'switch timing');
  swap(`  // Progress is read from the local database. Mount only once both it and
  // language are ready to avoid replacing the WebView source after mount.
  const readerReady = initialReaderReady && progressReady;`,
`  // First Hour must not wait for the entire reading-progress SQLite query.
  // Restore the position in the existing WebView, never by changing its HTML.
  const readerReady = initialReaderReady &&
    (entryId === 'ordinary-1' || progressReady);
  const restoreFirstHourPosition = () => {
    if (entryId !== 'ordinary-1' ||
        hoursWebViewReadyRef.current !== entryId ||
        !progressReady || !savedProgress || linkFocusTarget ||
        hoursSwitchedRef.current || hoursRestoredRef.current === entryId) return;
    const anchorId = Number(savedProgress.anchor_id ?? savedProgress.anchorId);
    if (!Number.isInteger(anchorId) || anchorId <= 0) return;
    hoursRestoredRef.current = entryId;
    readerRef.current?.goToProgress({
      anchorId, offset: Math.max(0, Number(savedProgress.offset || 0))
    });
    console.warn('[HOURS_STARTUP_20261116] restoredProgressMs=' +
      (Date.now() - hoursStartedRef.current) + ' entry=' + entryId);
  };
  useEffect(() => {
    if (entryId) console.warn('[HOURS_STARTUP_20261116] progressReadyMs=' +
      (progressReady ? Date.now() - hoursStartedRef.current : 'pending') +
      ' entry=' + entryId);
    restoreFirstHourPosition();
  }, [entryId, progressReady, savedProgress, linkFocusTarget]);
  useEffect(() => {
    hoursStartedRef.current = Date.now();
    hoursWebViewReadyRef.current = null;
    hoursRestoredRef.current = null;
    hoursSwitchedRef.current = false;
    hoursSwitchAtRef.current = 0;
  }, [entryId]);`,'progress gate');
  swap(`          savedProgress={savedProgress}
          initialReadingSettings={initialReadingSettings}`,
`          savedProgress={entryId === 'ordinary-1' ? null : savedProgress}
          initialReadingSettings={initialReadingSettings}`,'progress prop');
  swap(`          onReady={() => {
            readerRef.current?.applyAppearance(appearance);
            readerRef.current?.setTopContentInset(hoursHeaderHeightRef.current);
          }}`,
`          onReady={() => {
            hoursWebViewReadyRef.current = entryId;
            console.warn('[HOURS_STARTUP_20261116] webViewReadyMs=' +
              (Date.now() - hoursStartedRef.current) +
              ' mode=' + viewMode + ' entry=' + entryId +
              (hoursSwitchAtRef.current ?
                ' switchMs=' + (Date.now() - hoursSwitchAtRef.current) : ''));
            readerRef.current?.applyAppearance(appearance);
            readerRef.current?.setTopContentInset(hoursHeaderHeightRef.current);
            restoreFirstHourPosition();
          }}`,'onReady');
  const backup=file+'.backup-hours-nonblocking-'+new Date().toISOString().replace(/[:.]/g,'-');
  fs.writeFileSync(backup,original,'utf8');
  try{fs.writeFileSync(file,src.replace(/\n/g,eol),'utf8')}
  catch(e){fs.writeFileSync(file,original,'utf8');throw e}
  console.log('OK: Первый час не ждёт SQLite для показа текста.');
  console.log('Поздний прогресс восстанавливается без перезагрузки.');
  console.log('Другие часы не изменены. Backup: '+backup);
})();
