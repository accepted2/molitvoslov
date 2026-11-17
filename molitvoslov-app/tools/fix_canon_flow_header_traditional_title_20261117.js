(function installCanonFlowingHeaderAndJustifiedTitle() {
 const fs=require('fs'), path=require('path');
 const tag='CANON_FLOWING_LONG_HEADER_JUSTIFIED_TRAD_TITLE_20261117';
 const names=[
  'src/components/navigation/FixedSectionHeader.js',
  'src/screens/CanonScreen.js',
  'src/components/reader/selectableDocumentReader/runtime.js',
  'src/components/reader/selectableDocumentReader/styles.js'
 ];
 const files=names.map(name=>{
  const filename=path.join(process.cwd(),...name.split('/'));
  if(!fs.existsSync(filename))throw Error('Не найден: '+name);
  const before=fs.readFileSync(filename,'utf8');
  return {name,filename,before,eol:before.includes('\r\n')?'\r\n':'\n',code:before.replace(/\r\n/g,'\n')};
 });
 if(files.every(f=>f.code.includes(tag))){
  console.log('OK: длинный заголовок и выравнивание ЦС-трад уже исправлены.');return;
 }
 if(files.some(f=>f.code.includes(tag)))throw Error('Найдено частичное применение. Ничего не записано.');
 const [header,canon,runtime,styles]=files;
 const once=(file,oldText,newText,label)=>{
   const i=file.code.indexOf(oldText);
   if(i<0||file.code.indexOf(oldText,i+1)>=0)throw Error(file.name+': не найден уникальный блок '+label+'; файлов не меняли.');
   file.code=file.code.replace(oldText,newText);
 };
 once(header,
  `  titleOffsetY = 0,
  readingHidden = false,`,
  `  titleOffsetY = 0,
  // ${tag}: opt-in only, keeps short titles and non-canon headers unchanged.
  flowLongTitleWithLanguage = false,
  readingHidden = false,`,
  'opt-in header prop');
 once(header,
  `  const [titleLines, setTitleLines] = useState(1);
  const extraTitleHeight = showTitle ? Math.max(0, titleLines - 1) * Math.ceil((compactReading ? 20 : 25) * uiScale) : 0;`,
  `  const [titleLines, setTitleLines] = useState(1);
  const [lastTitleLineWidth, setLastTitleLineWidth] = useState(0);
  const [titleLineWidth, setTitleLineWidth] = useState(0);
  const [languagePillWidth, setLanguagePillWidth] = useState(80);
  const useFlowTitle = flowLongTitleWithLanguage && compactReading &&
    String(title || '').length > 42 && !!onLanguageChange &&
    Array.isArray(languageSwitcher?.options) &&
    languageSwitcher.options.some(option => option.key === languageSwitcher?.activeKey);
  const lineHeight = (compactReading ? 20 : 25) * uiScale;
  const flowReady = titleLineWidth > 0 && lastTitleLineWidth > 0;
  const flowPillBelow = useFlowTitle && flowReady &&
    lastTitleLineWidth + languagePillWidth + 8 > titleLineWidth;
  const extraFlowHeight = flowPillBelow ? Math.ceil(26 * uiScale) : 0;
  const extraTitleHeight = showTitle
    ? Math.max(0, titleLines - 1) * Math.ceil(lineHeight)
    : 0;`,
  'measure actual final line for the language control');
 once(header,
 `  const headerHeight = contentTop + (compactReading ? 44 : (minimal ? 45 : 36)) + extraTitleHeight;`,
 `  const headerHeight = contentTop + (compactReading ? 44 : (minimal ? 45 : 36)) +
    extraTitleHeight + extraFlowHeight;`,
 'reactive height for final-line language control');
 once(header,
 `                compactReading && {height: 44 + extraTitleHeight},`,
 `                compactReading && {height: 44 + extraTitleHeight + extraFlowHeight},`,
 'title height');
 once(header,
 `              <View style={styles.titleLine}>
                <Text`,
 `              <View
                style={[
                  styles.titleLine,
                  useFlowTitle && styles.titleLineFlow,
                  flowPillBelow && {paddingBottom: extraFlowHeight},
                ]}
                onLayout={useFlowTitle
                  ? event => {
                      const width = event.nativeEvent.layout.width;
                      setTitleLineWidth(prev => Math.abs(prev - width) < 0.5 ? prev : width);
                    }
                  : undefined}
              >
                <Text`,
 'line layout width');
 once(header,
 `                  style={[styles.title, styles.titleFlex, compactReading && styles.titleReading, chromeDark && styles.titleDark, {`,
 `                  style={[styles.title, styles.titleFlex, compactReading && styles.titleReading,
                    useFlowTitle && styles.titleFlowText, chromeDark && styles.titleDark, {`,
 'allow title whole horizontal width');
 once(header,
 `                    setTitleLines((previous) => previous === count ? previous : count);
                  }}`,
 `                    setTitleLines((previous) => previous === count ? previous : count);
                    if (useFlowTitle) {
                      const lastLine = event.nativeEvent?.lines?.[count - 1];
                      const width = Number(lastLine?.width || 0);
                      setLastTitleLineWidth(prev => Math.abs(prev - width) < 0.5 ? prev : width);
                    }
                  }}`,
 'track last line width');
 once(header,
 `                    onPress={() => setLanguageOpen(true)}
                    style={({pressed}) => [styles.languagePill, {backgroundColor: chrome.pill, borderColor: chrome.border}, pressed && styles.pressed]}`,
 `                    onPress={() => setLanguageOpen(true)}
                    onLayout={useFlowTitle
                      ? event => {
                          const width = event.nativeEvent.layout.width;
                          setLanguagePillWidth(prev => Math.abs(prev - width) < 0.5 ? prev : width);
                        }
                      : undefined}
                    style={({pressed}) => [
                      styles.languagePill,
                      {backgroundColor: chrome.pill, borderColor: chrome.border},
                      useFlowTitle && styles.flowLanguagePill,
                      useFlowTitle && {
                        left: flowPillBelow ? 0 : Math.max(0, lastTitleLineWidth + 6),
                        top: Math.max(0, (titleLines - 1) * lineHeight - 1) +
                          (flowPillBelow ? 6 : 0),
                        opacity: flowReady ? 1 : 0,
                      },
                      pressed && styles.pressed,
                    ]}`,
 'position button at the real last-line baseline');
 once(header,
 `  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 5,
  },`,
 `  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 5,
  },
  // ${tag}: full-width text; only the final line has an inline language pill.
  titleLineFlow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    position: 'relative',
    width: '100%',
  },
  titleFlowText: {
    flexShrink: 0,
    width: '100%',
  },
  flowLanguagePill: {
    position: 'absolute',
    zIndex: 3,
    flexShrink: 0,
  },`,
 'layout style scoped to long headings');
 // Ensure the tab is measured and the dropdown remains functional.
 once(canon,
 `        title={viewMode === MODE_TRADITIONAL &&
          canon.slug === THEOTOKOS_TRADITIONAL_SLUG
            ? THEOTOKOS_TRADITIONAL_TITLE
            : getLocalizedField(canon, 'title', language) || title || t('reading.canon')}`,
 `        title={getLocalizedField(canon, 'title', language) || title || t('reading.canon')}
        flowLongTitleWithLanguage`,
 'never translate fixed top header based on reader mode');
 once(canon,
 `      title: isTheotokosTraditional
        ? THEOTOKOS_TRADITIONAL_TITLE
        : getLocalizedField(canon, 'title', language) || title || t('reading.canon'),`,
 `      title: isTheotokosTraditional
        ? THEOTOKOS_TRADITIONAL_TITLE
        : getLocalizedField(canon, 'title', language) || title || t('reading.canon'),
      // ${tag}: only the inner reader title is translated & justified.
      justifyTraditionalDocumentTitle: isTheotokosTraditional,`,
 'justify inner title only, preserving traditional translation');
 once(runtime,
 `    const reader = document.getElementById( 'reader' );`,
 `    const reader = document.getElementById( 'reader' );
    // ${tag} - opt-in to the Theotokos traditional document heading.
    reader.classList.toggle(
      'canon-traditional-document-justified',
      DATA.document.justifyTraditionalDocumentTitle === true
    );`,
 'reader-scoped CSS marker');
 const tail='\n  `;';
 const pos=styles.code.lastIndexOf(tail);
 if(pos<0||!['\n  `;','\n  `;\n'].includes(styles.code.slice(pos)))
    throw Error('Не найден конец стилей читателя; ничего не записано.');
 const additional=`
    /* ${tag}: traditional Theotokos title, distinct from the native header. */
    body:not(.book-mode) .canon-traditional-document-justified .document-header {
      justify-content: flex-start !important;
    }
    body:not(.book-mode) .canon-traditional-document-justified .document-header .rule-title {
      width: 100% !important;
      padding: 0 2px !important;
      margin: 0 !important;
      text-align: justify !important;
      text-align-last: left !important;
      text-justify: inter-word;
      font-family: 'Ponomar', Georgia, serif !important;
      font-weight: 400 !important;
    }
`;
 styles.code=styles.code.slice(0,pos)+additional+styles.code.slice(pos);
 if(!files.every(f=>f.code.includes(tag)))throw Error('Изменение получилось неполным. Ничего не записано.');
 const suffix='.backup-canon-flow-title-20261117-'+new Date().toISOString().replace(/[:.]/g,'-');
 const done=[];
 try{
  for(const f of files)fs.writeFileSync(f.filename+suffix,f.before,'utf8');
  for(const f of files){fs.writeFileSync(f.filename,f.code.replace(/\n/g,f.eol),'utf8');done.push(f);}
 }catch(error){
  for(const f of done)try{fs.writeFileSync(f.filename,f.before,'utf8');}catch(_){}
  throw error;
 }
 console.log('OK: верхний заголовок канона больше не зависит от вкладки ЦС-трад.');
 console.log('OK: длинное название занимает всю доступную ширину; выбор перевода расположен у последней строки.');
 console.log('OK: если переключатель не помещается у последней строки, он переносится под название.');
 console.log('OK: заголовок внутри канона остаётся ЦС-трад и выравнивается по ширине.');
 console.log('OK: другие читатели, тексты, закладки и переводы не меняются.');
 console.log('Резервные копии: '+suffix);
})();
