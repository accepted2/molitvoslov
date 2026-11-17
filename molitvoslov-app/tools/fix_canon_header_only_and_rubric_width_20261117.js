(function applyCanonHeaderOnlyAndRubricWidth() {
 const fs=require('fs'), path=require('path');
 const tag='CANON_HEADER_ONLY_ACTIONS_RUBRIC_40_20261117';
 const names=[
 'src/screens/CanonScreen.js',
 'src/components/reader/ReaderBookmarkMenu.js',
 'src/components/reader/selectableDocumentReader/runtime.js',
 'src/components/reader/selectableDocumentReader/styles.js'
 ];
 const entries=names.map(name=>{
   const file=path.join(process.cwd(),...name.split('/'));
   if(!fs.existsSync(file)) throw Error('Не найден файл: '+name);
   const original=fs.readFileSync(file,'utf8');
   return {name,file,original,eol:original.includes('\r\n')?'\r\n':'\n',source:original.replace(/\r\n/g,'\n')};
 });
 if(entries.every(e=>e.source.includes(tag))){console.log('OK: изменения уже применены.');return;}
 if(entries.some(e=>e.source.includes(tag)))throw Error('Обнаружено частичное применение. Файлы не изменены.');
 const once=(entry,old,newText,label)=>{
   let idx=entry.source.indexOf(old);
   if(idx<0||entry.source.indexOf(old,idx+1)>=0)
    throw Error(entry.name+': участок '+label+' не найден однозначно. Изменений нет.');
   entry.source=entry.source.replace(old,newText);
 };
 const [canon,menu,runtime,styles]=entries;
 once(canon,
 "      action: {\n        key: `canon:${canon.id}`,",
 "      // "+tag+": only the fixed reading header has save/share actions.\n      hideInlineActions: true,\n      action: {\n        key: `canon:${canon.id}`,",
 'flag for all canon views');
 once(canon,
 "        savedItemsRef.current = savedItemsRef.current.filter((item) => item.id !== existing.id);\n\n        return {",
 "        savedItemsRef.current = savedItemsRef.current.filter((item) => item.id !== existing.id);\n        setSavedItems(savedItemsRef.current);\n\n        return {",
 'refresh whole canon saved status after removal');
 once(canon,
 "    savedItemsRef.current = [saved, ...savedItemsRef.current];\n\n    return {",
 "    savedItemsRef.current = [saved, ...savedItemsRef.current];\n    setSavedItems(savedItemsRef.current);\n\n    return {",
 'refresh whole canon saved status after add');
 once(canon,
 "      <ReaderBookmarkMenu\n        onShare={() => shareContent({",
 "      <ReaderBookmarkMenu\n        onSave={() => handleAction(`canon:${canon.id}`)}\n        isSaved={!!documentData.action?.active}\n        onShare={() => shareContent({",
 'header save canon action');
 once(menu,
 "  onShare = null,\n",
 "  onShare = null,\n  onSave = null,\n  isSaved = false,\n  // "+tag+": these props are opt-in for canon only.\n",
 'menu props');
 once(menu,
 "  const [saving, setSaving] = useState(false);",
 "  const [saving, setSaving] = useState(false);\n  const [savingWhole, setSavingWhole] = useState(false);\n  const [wholeSaved, setWholeSaved] = useState(!!isSaved);",
 'whole-collection saving state');
 once(menu,
 "    if (visible) {\n      setMessage('');\n    }\n  }, [visible]);",
 "    if (visible) {\n      setMessage('');\n      setWholeSaved(!!isSaved);\n    }\n  }, [visible, isSaved]);",
 'reset menu state');
 once(menu,
 "  const addBookmark = async () => {",
 `  const saveWholeCanon = async () => {
    if (!onSave || savingWhole) return;
    setSavingWhole(true);
    setMessage('');
    try {
      const result = await onSave();
      if (result && typeof result.active === 'boolean') {
        setWholeSaved(result.active);
        setMessage(result.active ? 'Канон добавлен в избранное' : 'Канон убран из избранного');
      } else {
        setMessage('Не удалось сохранить канон');
      }
    } catch (error) {
      setMessage('Не удалось изменить избранное');
      console.warn('[canon] save whole:', error?.message || error);
    } finally {
      setSavingWhole(false);
    }
  };

  const addBookmark = async () => {`,
 'whole collection save handler');
 once(menu,
 "          {!!onShare && (",
 `          {!!onSave && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={wholeSaved ? 'Убрать канон из избранного' : 'Сохранить весь канон'}
              disabled={savingWhole}
              onPress={saveWholeCanon}
              style={({pressed}) => [
                styles.action,
                savingWhole && styles.actionDisabled,
                pressed && !savingWhole && styles.pressed,
              ]}
            >
              <View style={styles.iconWrap}>
                {savingWhole ? <ActivityIndicator size="small" color={colors.accent} /> :
                  <Ionicons
                    name={wholeSaved ? 'bookmark' : 'bookmark-outline'}
                    size={22} color={colors.accent}
                  />}
              </View>
              <View style={styles.actionTextWrap}>
                <Text style={styles.actionTitle}>
                  {wholeSaved ? 'Убрать канон из избранного' : 'Сохранить весь канон'}
                </Text>
                <Text style={styles.actionSubtitle}>
                  {wholeSaved ? 'Удалить сохранённый канон' : 'Добавить целиком в избранное'}
                </Text>
              </View>
            </Pressable>
          )}

          {!!onShare && (`,
 'show save in header menu');
 once(runtime,
 "    const reader = document.getElementById( 'reader' );",
 "    const reader = document.getElementById( 'reader' );\n    // "+tag+"\n    reader.classList.toggle('canon-no-inline-actions', !!DATA.document.hideInlineActions);",
 'scope reader class');
 once(runtime,
 "        let documentSave=null;",
 "        if (!DATA.document.hideInlineActions) {\n        let documentSave=null;",
 'hide document title menu');
 once(runtime,
 "        reader.appendChild( documentHeader );",
 "        }\n        reader.appendChild( documentHeader );",
 'close document menu condition');
 once(runtime,
 "            if(section.action && !psalmMenu){",
 "            if(section.action && !psalmMenu && !DATA.document.hideInlineActions){",
 'remove section button data');
 once(runtime,
 "            if(psalmMenu){",
 "            if(DATA.document.hideInlineActions){\n              // Canon headers are display-only; only fixed header has actions.\n            }else if(psalmMenu){",
 'disable chapter / song menu');
 once(runtime,
 `                    if (block.sourceType === 'canon' && block.canonTypography?.standaloneInlineLabel) {
                      inline.classList.add('canon-long-label');
                    }`,
 `                    if (block.sourceType === 'canon') {
                      // Always measure canon label against available line width.
                      inline.classList.add('canon-width-aware-label');
                    }`,
 'measure all canon inline labels');
 once(runtime,
 "    itemTextMap.forEach( ( _text, itemId ) => renderTextItem( itemId ) );",
 `    itemTextMap.forEach( ( _text, itemId ) => renderTextItem( itemId ) );
    // ${tag}: move the canon text below labels wider than 40% of the
    // available text column. Recalculate after fonts load and on resize.
    const layoutCanonInlineLabels = () => {
      const nodes = reader.querySelectorAll('.reader-inline.canon-width-aware-label');
      if (!nodes.length) return;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;
      nodes.forEach(node => {
        const label = node.querySelector('.reader-inline-label');
        if (!label) return;
        const computed = window.getComputedStyle(label);
        context.font = computed.font && computed.font !== ''
          ? computed.font
          : computed.fontStyle + ' ' + computed.fontWeight + ' ' +
            computed.fontSize + ' ' + computed.fontFamily;
        const labelWidth = context.measureText(label.textContent || '').width;
        const availableWidth = node.getBoundingClientRect().width;
        if (availableWidth > 0) {
          node.classList.toggle(
            'canon-auto-long-label',
            labelWidth > 0.4 * availableWidth
          );
        }
      });
    };
    const scheduleCanonLabelLayout = () => {
      window.requestAnimationFrame(layoutCanonInlineLabels);
    };
    scheduleCanonLabelLayout();
    if (document.fonts?.ready) {
      document.fonts.ready.then(scheduleCanonLabelLayout).catch(() => {});
    }
    window.addEventListener('resize', scheduleCanonLabelLayout);`,
 'exact 40 percent label threshold');
 const terminator='\n  `;';
 const i=styles.source.lastIndexOf(terminator);
 if(i<0||!['\n  `;','\n  `;\n'].includes(styles.source.slice(i)))throw Error('Конец WebView CSS отличается');
 const css=`
    /* ${tag}: only canon readers opt into these rules. */
    body:not(.book-mode) .canon-no-inline-actions .document-header .rule-title {
      padding-left: 6px !important;
      padding-right: 6px !important;
    }
    body:not(.book-mode) .canon-no-inline-actions .section-header .prayer-title {
      padding-left: 8px !important;
      padding-right: 8px !important;
    }
    .rule-item.canon-section .reader-inline.canon-auto-long-label .reader-inline-label,
    .rule-item.canon-section .reader-inline.canon-auto-long-label .reader-text {
      display: block !important;
    }
    .rule-item.canon-section .reader-inline.canon-auto-long-label .reader-inline-label {
      margin-right: 0 !important;
      margin-bottom: 3px;
    }
`;
 styles.source=styles.source.slice(0,i)+css+styles.source.slice(i);
 if(!entries.every(e=>e.source.includes(tag)))throw Error('Неполное изменение');
 const backups='.backup-canon-header-only-'+new Date().toISOString().replace(/[:.]/g,'-');
 const written=[];
 try{
   for(const e of entries)fs.writeFileSync(e.file+backups,e.original,'utf8');
   for(const e of entries){fs.writeFileSync(e.file,e.source.replace(/\n/g,e.eol),'utf8');written.push(e);}
 }catch(error){
   for(const e of written)try{fs.writeFileSync(e.file,e.original,'utf8')}catch(_){}
   throw error;
 }
 console.log('OK: все внутренние трёхточечные меню канонов удалены из рендера (название, песни, разделы).');
 console.log('OK: сохранение всего канона, удаление его из избранного и отправка — из меню шапки.');
 console.log('OK: рубрики длиной более 40% строки переводят текст на новую строку, остальные — нет.');
 console.log('Резервные копии: '+backups);
})();
