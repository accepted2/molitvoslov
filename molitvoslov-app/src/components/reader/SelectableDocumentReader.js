import React, {forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react';

import {StyleSheet, View} from 'react-native';

import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {WebView} from 'react-native-webview';

import {LinearGradient} from 'expo-linear-gradient';

import {deleteSavedItem, saveItem} from '../../services/savedItems';
import {shareContent, isPrivateShareSource, resolveSelectedShareTarget} from '../../services/contentSharing';
import {shareImportableContent} from '../../services/shareInvitations';
import {getCachedPonomarFontDataUri, loadPonomarFontDataUri} from '../../services/ponomarFont';

import {buildHtml, scriptSafeJson} from './selectableDocumentReader/buildHtml';
import {getReadingSettings, DEFAULT_READING_SETTINGS} from '../../services/readerPreferences';
import {applyReaderAppearance, resolveReaderAppearance, isDarkReaderBackground, withOpacity} from '../../services/scopedReaderAppearance';

const PALETTE_COLORS = {
  parchment: {background: '#FFF4DE', surface: '#F8E9CF', text: '#3E2A1D'},
  warm: {background: '#DEBE94', surface: '#E8CDA8', text: '#3B281A'},
  ivory: {background: '#FFFDF3', surface: '#F5EFE0', text: '#352D26'},
  night: {background: '#29231F', surface: '#413831', text: '#F4E7D2'},
};

const SelectableDocumentReader = forwardRef(function SelectableDocumentReader(
  {
    documentData,
    savedProgress,
    initialReadingSettings = null,
    focusTarget,
    topContentInset = 0,
    bottomContentInset = 0,
    respectBottomSafeArea = true,
    backgroundColor = '#FFF4DE',
    initialAppearance = null,
    onSaved,
    onProgress,
    onAction,
    onPsalmMenu,
    onCrossReference,
    onMemorialOpen,
    onViewModeChange,
    onPageTurn,
    onReady,
    onReadingScroll,
    onNativeReadingScroll,
    embedded = false,
    embeddedTextStyle = null,
    onEmbeddedSelection,
  },
  ref
) {
  const insets = useSafeAreaInsets();
  const [readingSettings, setReadingSettings] = useState(
    () => initialReadingSettings || DEFAULT_READING_SETTINGS
  );
  // Native chrome must follow the scoped color choice without rebuilding HTML.
  const [chromeBackground, setChromeBackground] = useState(null);
  const [embeddedHeight, setEmbeddedHeight] = useState(120);
  const embeddedSaveResolverRef = useRef(null);
  const resolveEmbeddedSave = result => {
    if (embeddedSaveResolverRef.current) {
      embeddedSaveResolverRef.current(result);
      embeddedSaveResolverRef.current = null;
    }
  };
  useEffect(() => {
    let active = true;
    getReadingSettings().then((settings) => {
      if (!active) return;
      setReadingSettings(previous => {
        const fields = ['defaultMode', 'fontSize', 'interfaceScale', 'palette', 'customBackground', 'customText'];
        return fields.every(field => previous?.[field] === settings?.[field])
          ? previous : settings;
      });
    }).catch(console.warn);
    return () => { active = false; };
  }, []);

  const webViewRef = useRef(null);
  const hoursProfileStartRef = useRef(0); // HOURS_WEBVIEW_PROFILE_V2_20261116

  const appearanceRef = useRef(initialAppearance);
  // Update the book's initial theme only when its HTML actually changes.
  // Colour-slider gestures must NOT re-create the Bible's paginated WebView.
  const initialBookAppearanceRef = useRef(initialAppearance);
  if (documentData.readerMode === 'book' && initialAppearance) {
    appearanceRef.current = initialAppearance;
    initialBookAppearanceRef.current = initialAppearance;
  }
  const languageProgressRef = useRef(null);
  const scrollFallbackRef = useRef(null);
  const isHoursDocument = documentData?.progressAnchorType === 'hours_row';

  const needsPonomar = useMemo(
    () =>
      (documentData.sections || []).some((section) =>
        (section.rows || []).some((row) =>
          (row.blocks || []).some((block) => block?.metadata?.language === 'traditional')
        )
      ),
    [documentData.sections]
  );

  const [ponomarFontDataUri, setPonomarFontDataUri] = useState(() =>
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
    if (!needsPonomar) {
      setPonomarFontDataUri('');
      return undefined;
    }

    const cached = getCachedPonomarFontDataUri();

    if (cached) {
      setPonomarFontDataUri(cached);
      return undefined;
    }

    let active = true;

    loadPonomarFontDataUri()
      .then((dataUri) => {
        if (active && dataUri) {
          setPonomarFontDataUri(dataUri);
        }
      })
      .catch((fontError) => {
        console.log('Ошибка загрузки шрифта Ponomar для WebView:', fontError?.message || fontError);
      });

    return () => {
      active = false;
    };
  }, [needsPonomar, isHoursDocument]);

  const itemConfigMap = useMemo(() => {
    const result = new Map();

    (documentData.sections || []).forEach((section) => {
      (section.rows || []).forEach((row) => {
        (row.blocks || []).forEach((block) => {
          result.set(Number(block.id), block);
        });
      });
    });

    return result;
  }, [documentData.sections]);

  const htmlReadingSettings = documentData.readerMode === 'book' ? null : readingSettings;
  const html = useMemo(() => {
    const profileHtmlStart=isHoursDocument?Date.now():0;
    if(isHoursDocument)console.warn('[HOURS_PIPELINE_20261116] HTML_START',
      't='+profileHtmlStart,'mode='+String(documentData.viewSwitcher?.activeKey));
    console.warn('[reader] incoming FT =', JSON.stringify(focusTarget));
    const captured = languageProgressRef.current;
    const switchingLanguage = !!captured || scrollFallbackRef.current !== null;
    const effectiveProgress = captured?.anchorId
      ? {anchor_type: documentData.progressAnchorType, anchor_id: captured.anchorId, offset: captured.offset, offsetRatio: captured.offsetRatio ?? null}
      : savedProgress;
    const markup = buildHtml({
      documentData,
      savedProgress: effectiveProgress,
      focusTarget: switchingLanguage ? null : focusTarget,
      topContentInset,
      bottomContentInset,
      ponomarFontDataUri: effectivePonomarFontDataUri,
      bookAppearance: documentData.readerMode === 'book' && initialBookAppearanceRef.current
        ? (() => {
            const resolved = resolveReaderAppearance(initialBookAppearanceRef.current);
            return {...resolved, dark: isDarkReaderBackground(resolved.background)};
          })()
        : null,
    });
    // Preserve separate pagination and per-book themes for Bible/book readers.
    if (documentData.readerMode === 'book') return markup;
    const embeddedCss = embedded
      ? `body.embedded-reader .reader-text {
          font-size: ${Math.max(12, Number(embeddedTextStyle?.fontSize) || 16)}px !important;
          line-height: ${Math.max(16, Number(embeddedTextStyle?.lineHeight) || 26)}px !important;
          color: ${String(embeddedTextStyle?.color || '#3E2A1D')};
          text-align: ${embeddedTextStyle?.textAlign === 'center' ? 'center' : 'justify'};
        }`
      : '';
    const palette = !embedded && htmlReadingSettings?.palette === 'custom'
      ? {background: htmlReadingSettings.customBackground, text: htmlReadingSettings.customText, surface: htmlReadingSettings.customBackground}
      : (embedded ? PALETTE_COLORS.parchment
        : (PALETTE_COLORS[htmlReadingSettings?.palette] || PALETTE_COLORS.parchment));
    const size = Math.max(14, Math.min(28, Number(htmlReadingSettings?.fontSize) || 17));
    // One reading-size source for every non-book document category.
    // Ponomar glyphs are visually smaller than civil Cyrillic at the same px size.
    const traditionalSize = Math.min(30, size + 2);
    const css = `body:not(.book-mode) {--background: ${palette.background}; --surface: ${palette.surface}; --text: ${palette.text}; --reading-font-size: ${size}px; --traditional-reading-font-size: ${traditionalSize}px;}
      body:not(.book-mode) .reader-text {font-size: var(--reading-font-size) !important; line-height: 1.7 !important;}
      body:not(.book-mode) .reader-language-traditional .reader-text {font-size: var(--traditional-reading-font-size) !important; line-height: 1.7 !important;}
      body:not(.book-mode) .reader-language-traditional .reader-text .liturgical-word {font-size: inherit;}
      body:not(.book-mode) .reader-text.akathist-church,
      body:not(.book-mode) .reader-text.akathist-russian,
      body:not(.book-mode) .reader-text.psalter-reading-prayers,
      body:not(.book-mode) .reader-text.psalter-glory,
      body:not(.book-mode) .reader-text.psalter-prayer {line-height: 1.7 !important;}`;
    const finalHtml = markup.replace('</style>', `${css}${embeddedCss}</style>`);
    if(isHoursDocument)console.warn('[HOURS_PIPELINE_20261116] HTML_DONE',
      't='+Date.now(),'durationMs='+(Date.now()-profileHtmlStart),
      'mode='+String(documentData.viewSwitcher?.activeKey),'chars='+finalHtml.length);
    return finalHtml;
  }, [documentData, savedProgress, focusTarget, topContentInset, bottomContentInset, effectivePonomarFontDataUri, htmlReadingSettings, embedded, embeddedTextStyle]);

  // HOURS_STABLE_CONTENT_20261116:
  // Preserve the same WebView HTML across progress and measured-inset updates.
  // Switching tabs changes documentData, and appearance/font changes retain
  // their own invalidation. Other reader categories are unaffected.
  const hoursHtmlCacheRef = useRef(null);
  let hoursDisplayedHtml = html;
  if (isHoursDocument) {
    const previous = hoursHtmlCacheRef.current;
    const sameDocument = previous &&
      previous.documentData === documentData &&
      previous.settings === htmlReadingSettings &&
      previous.font === effectivePonomarFontDataUri &&
      previous.focusTarget === focusTarget &&
      previous.hasSavedProgress === !!savedProgress &&
      previous.embedded === embedded &&
      previous.embeddedStyle === embeddedTextStyle;
    if (sameDocument) {
      hoursDisplayedHtml = previous.html;
    } else {
      hoursHtmlCacheRef.current = {
        documentData, settings: htmlReadingSettings,
        font: effectivePonomarFontDataUri, focusTarget,
        hasSavedProgress: !!savedProgress,
        embedded, embeddedStyle: embeddedTextStyle, html,
      };
    }
  }
  const stableHoursWebViewSource = useMemo(
    () => ({html: isHoursDocument ? hoursDisplayedHtml : html}),
    [isHoursDocument, isHoursDocument ? hoursDisplayedHtml : html]
  );

  const inject = (script) => {
    webViewRef.current?.injectJavaScript(script + '; true;');
  };

  useImperativeHandle(
    ref,
    () => ({
      setTopContentInset: (height) => {
        const pixels = Math.max(14, Number(height || 0) + 14);
        inject("document.body && document.body.style.setProperty('--reader-top-padding', " +
          scriptSafeJson(pixels + 'px') + ")");
      },
      goToProgress: (progress) => {
        if (!progress) {
          return;
        }

        inject(
          'window.readerApi && window.readerApi.goToProgress(' + scriptSafeJson(progress) + ')'
        );
      },

      setBookFontSize: (size) => {
        inject(
          'window.readerApi && window.readerApi.setBookFontSize(' + Number(size || 16.5) + ')'
        );
      },

      changeViewMode: (key) => {
        inject('window.readerApi && window.readerApi.changeViewMode(' + scriptSafeJson(key) + ')');
      },
      updateAction: (actionKey,result) => {
        if(!result)return;
        inject('window.readerApi && window.readerApi.updateAction('+
          scriptSafeJson(actionKey)+','+scriptSafeJson(result.label||'')+','+
          (result.active?'true':'false')+','+
          (result.savedItem?.id||result.savedItemId||'null')+')');
      },

      applyAppearance: (appearance) => {
        appearanceRef.current = appearance;
        const nextBackground = resolveReaderAppearance(appearance).background;
        setChromeBackground(current => current === nextBackground ? current : nextBackground);
        applyReaderAppearance(webViewRef.current, appearance);
      },

      saveEmbeddedSelection: () => new Promise(resolve => {
        if (!embedded || !webViewRef.current) {
          resolve({ok: false, message: 'Молитва не открыта'});
          return;
        }
        // A lost bridge message should not freeze the global toolbar.
        const timeout = setTimeout(() => {
          resolveEmbeddedSave({ok: false, message: 'Нет ответа от чтения. Повторите сохранение.'});
        }, 12000);
        embeddedSaveResolverRef.current = result => {
          clearTimeout(timeout);
          resolve(result);
        };
        inject('window.readerApi && window.readerApi.saveEmbeddedSelection()');
      }),
      shareEmbeddedSelection: () => {
        if(embedded)inject('window.readerApi && window.readerApi.shareEmbeddedSelection()');
      },
      clearEmbeddedSelection: () => {
        inject('window.readerApi && window.readerApi.clearEmbeddedSelection()');
      },
      setBookTheme: (theme) => {
        inject(
          'window.readerApi && window.readerApi.setBookTheme(' +
            scriptSafeJson(theme || 'paper') +
            ')'
        );
      },
      applyBookAppearance: (appearance) => {
        if (!appearance) return;
        const next=resolveReaderAppearance(appearance);
        appearanceRef.current=appearance;
        setChromeBackground(current=>current===next.background?current:next.background);
        applyReaderAppearance(webViewRef.current,appearance);
        inject('window.readerApi && window.readerApi.setBookAppearance('+
          scriptSafeJson({
            fontSize:next.fontSize,palette:next.palette,
            background:next.background,text:next.text,
            dark:isDarkReaderBackground(next.background),
          })+')');
      },
    }),
    []
  );

  const handleMessage = async (event) => {
    let message;

    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message?.type === 'hours-webview-profile' && documentData?.progressAnchorType === 'hours_row') {
      console.warn('[HOURS_WEBVIEW_PROFILE_V2_20261116][DOM]', JSON.stringify(message));
      return;
    }


    if (embedded && message.type === 'embedded-selection-info') {
      onEmbeddedSelection?.(message);
      return;
    }
    if (embedded && message.type === 'reader-height') {
      const measured = Number(message.height);
      if (Number.isFinite(measured) && measured > 0) {
        setEmbeddedHeight(current => Math.abs(current - measured) >= 2
          ? Math.max(50, Math.min(100000, measured)) : current);
      }
      return;
    }
    if (message.type === 'reading-scroll-activity') {
      onReadingScroll?.('activity');
      return;
    }
    if (message.type === 'reading-scroll') {
      onReadingScroll?.(message.direction);
      return;
    }
    if (message.type === 'view-mode') {
      languageProgressRef.current = message.progress?.anchorId ? message.progress : null;
      scrollFallbackRef.current = Number.isFinite(message.progress?.scrollRatio)
        ? message.progress.scrollRatio
        : null;
      onViewModeChange?.(message.value);

      return;
    }

    if (message.type === 'page-turn') {
      onPageTurn?.(message.direction);

      return;
    }

    if (message.type === 'progress') {
      onProgress?.({
        anchorType: documentData.progressAnchorType,

        anchorId: Number(message.anchorId),

        offset: Math.max(0, Number(message.offset || 0)),

        progressPercent: Math.max(0, Math.min(Number(message.progressPercent || 0), 100)),

        pageIndex: Number.isFinite(Number(message.pageIndex)) ? Number(message.pageIndex) : null,

        pageCount: Number.isFinite(Number(message.pageCount)) ? Number(message.pageCount) : null,
      });

      return;
    }

    if (message.type === 'bible-cross-reference') {
      onCrossReference?.(String(message.key || ''));
      return;
    }

    if (message.type === 'memorial-open') {
      onMemorialOpen?.(message.context || null);

      return;
    }

    if (message.type === 'share-section') {
      // Share visible liturgical content immediately, without an API invitation.
      const sections=Array.isArray(documentData.sections)?documentData.sections:[];
      const index=Number(message.sectionIndex);
      const selected=message.wholeDocument?sections:
        (Number.isInteger(index)&&index>=0&&index<sections.length?[sections[index]]:[]);
      if(!selected.length && !message.wholeDocument)return;
      const blocks=selected.flatMap(section=>
        (section.rows||[]).flatMap(row=>row.blocks||[]));
      const first=blocks.find(block=>block?.sourceType && block?.metadata)||
        blocks.find(block=>block?.sourceType);
      const target=first?resolveSelectedShareTarget(first):{};
      const title=message.wholeDocument
        ? (documentData.title||'Молитвослов')
        : (selected[0]?.title||first?.itemTitle||documentData.title||'Молитва');
      const text=selected.flatMap(section=>
        (section.rows||[]).map(row=>{
          const parts=(row.blocks||[]).map(block=>String(block?.text||'').trim())
            .filter(Boolean);
          return [...new Set(parts)].join('\n\n');
        }).filter(Boolean)).join('\n\n');
      await shareContent({title,text:message.wholeDocument?'':text,
        linkOnly:!!message.wholeDocument,screen:target.screen,params:target.params});
      return;
    }

    if (message.type === 'psalm-menu') {
      const psalmId=Number(message.psalmId);
      if(Number.isInteger(psalmId)&&psalmId>0)onPsalmMenu?.(psalmId);
      return;
    }
    if (message.type === 'section-action') {
      if (!onAction) {
        return;
      }

      try {
        const result = await onAction(message.actionKey);

        if (result) {
          inject(
            'window.readerApi && window.readerApi.updateAction(' +
              scriptSafeJson(message.actionKey) +
              ',' +
              scriptSafeJson(result.label || '') +
              ',' +
              (result.active ? 'true' : 'false') +
              ',' +
              (result.savedItem?.id || result.savedItemId || 'null') +
              ')'
          );

          if (result.savedItem && result.itemId) {
            inject(
              'window.readerApi && window.readerApi.saveSucceeded(' +
                Number(result.itemId) +
                ',' +
                scriptSafeJson(result.savedItem) +
                ')'
            );
          }

          if (result.removedSavedItemId && result.itemId) {
            inject(
              'window.readerApi && window.readerApi.removeSavedItem(' +
                Number(result.itemId) +
                ',' +
                Number(result.removedSavedItemId) +
                ')'
            );
          }
        }
      } catch (actionError) {
        console.log('Ошибка действия reader:', actionError);
      }

      return;
    }

    if (message.type === 'remove-selection') {
      try {
        await deleteSavedItem(Number(message.savedItemId));

        inject(
          'window.readerApi && window.readerApi.removeSavedItem(' +
            Number(message.itemId) +
            ',' +
            Number(message.savedItemId) +
            ')'
        );
        resolveEmbeddedSave({ok: true});
      } catch (deleteError) {
        console.log('Ошибка удаления выделения:', deleteError.message);

        inject("window.readerApi && window.readerApi.saveFailed('Не удалось удалить')");
        resolveEmbeddedSave({ok: false, message: 'Не удалось удалить'});
      }

      return;
    }

    if (message.type === 'share-selection') {
      const itemConfig=itemConfigMap.get(Number(message.itemId));
      if(!itemConfig || !String(message.text||'').trim())return;
      const title=message.itemTitle || itemConfig.itemTitle ||
        itemConfig.sourceTitle || documentData.title || 'Цитата';
      if(isPrivateShareSource(itemConfig.sourceType)){
        // Private notes may only be imported via an expiring invitation.
        await shareImportableContent({
          kind:'quote',title,text:message.text,privateContent:true,
          fallbackText:message.text,
        });
      }else{
        // Public excerpts do not need authentication, network requests or
        // a temporary server-side copy. Include the source deep link.
        const target=resolveSelectedShareTarget(itemConfig);
        await shareContent({
          title,text:message.text,screen:target.screen,params:target.params,
        });
      }
      return;
    }

    if (message.type !== 'save-selection') {
      return;
    }

    const itemConfig = itemConfigMap.get(Number(message.itemId));

    if (!itemConfig) {
      resolveEmbeddedSave({ok: false, message: 'Текст не найден'});
      return;
    }

    try {
      const saved = await saveItem({
        save_type: message.saveType || 'fragment',

        source_type: itemConfig.sourceType,

        source_id: itemConfig.sourceId,

        anchor_type: itemConfig.anchorType,

        anchor_id: itemConfig.anchorId,

        source_title: itemConfig.sourceTitle || documentData.title || '',

        item_title: itemConfig.itemTitle || '',

        text: message.text,

        start_offset: Number(message.start),

        end_offset: Number(message.end),

        metadata: {
          ...(itemConfig.metadata || {}),
          font_family:
            itemConfig.metadata?.font_family ||
            itemConfig.metadata?.fontFamily ||
            itemConfig.metadata?.reader_font ||
            (itemConfig.metadata?.language === 'traditional' ? 'Ponomar' : 'serif'),
          ...(Array.isArray(message.segments) && message.segments.length > 1
            ? {
                selection_segments: message.segments.map((segment) => ({
                  item_id: Number(segment.item_id ?? segment.itemId),
                  start: Number(segment.start),
                  end: Number(segment.end),
                })),
              }
            : {}),
        },
      });

      onSaved?.(saved, itemConfig);
      resolveEmbeddedSave({ok: true});

      inject(
        'window.readerApi && window.readerApi.saveSucceeded(' +
          Number(message.itemId) +
          ',' +
          scriptSafeJson(saved) +
          ')'
      );
    } catch (error) {
      console.log('Ошибка сохранения выделения:', error.response?.data || error.message);

      inject("window.readerApi && window.readerApi.saveFailed('Не удалось сохранить')");
      resolveEmbeddedSave({ok: false, message: 'Не удалось сохранить'});
    }
  };

  const pageBackground = embedded || documentData.readerMode === 'book'
    ? backgroundColor
    : (chromeBackground || (readingSettings.palette === 'custom'
      ? readingSettings.customBackground
      : (PALETTE_COLORS[readingSettings.palette]?.background || backgroundColor)));

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: embedded ? 0 : (respectBottomSafeArea ? Math.max(insets.bottom, 8) : 0),
          backgroundColor: pageBackground,
        },
        embedded && {flex: 0, height: embeddedHeight},
      ]}
    >
      <WebView
        ref={webViewRef}
        source={stableHoursWebViewSource}
        originWhitelist={['*']}
        javaScriptEnabled
        injectedJavaScript={documentData.readerMode === 'book' ? undefined : "(function() {\n var previous = window.scrollY || 0, pending = 0, direction = '', lastSent = 0;\n var post = function(type, dir) {\n   if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:type,direction:dir}));\n };\n window.addEventListener('scroll', function() {\n   var y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);\n   var delta = y - previous;\n   previous = y;\n   if (!delta) return;\n   var now = Date.now();\n   if (now - lastSent > 100) { post('reading-scroll-activity'); lastSent = now; }\n   if (Math.abs(delta) > 100) { pending = 0; direction = delta > 0 ? 'down' : 'up'; }\n   if (y <= 35) {\n     if (direction !== 'top') {\n       direction = 'top';\n       pending = 0;\n       post('reading-scroll', 'top');\n     }\n     return;\n   }\n   if (direction === 'top') { direction = ''; pending = 0; }\n   var next = delta < 0 ? 'up' : 'down';\n   if (next !== direction) {\n     pending += Math.abs(delta);\n     if (pending >= 5 || y < 35) {\n       direction = next;\n       pending = 0;\n       post('reading-scroll', next);\n     }\n   } else {\n     pending = 0;\n   }\n }, {passive:true});\n})(); true;"}
        scrollEnabled={!embedded && documentData.readerMode !== 'book'}
        nestedScrollEnabled={!embedded && documentData.readerMode !== 'book'}
        showsVerticalScrollIndicator={false}
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        textZoom={100}
        onMessage={handleMessage}
        onScroll={onNativeReadingScroll}
        scrollEventThrottle={16}
        onLoadStart={() => {
          if (documentData?.progressAnchorType === 'hours_row') {
            console.warn('[HOURS_PIPELINE_20261116] WEBVIEW_START',
              't='+Date.now(),'mode='+String(documentData.viewSwitcher?.activeKey));
            hoursProfileStartRef.current = Date.now();
            console.warn('[HOURS_WEBVIEW_PROFILE_V2_20261116][LOAD_START]',
              'mode='+String(documentData.viewSwitcher?.activeKey),
              'htmlChars='+html.length);
          }
        }}
        onLoadEnd={(event) => {
          if (documentData?.progressAnchorType === 'hours_row') {
            console.warn('[HOURS_PIPELINE_20261116] WEBVIEW_DONE',
              't='+Date.now(),'mode='+String(documentData.viewSwitcher?.activeKey));
            console.warn('[HOURS_WEBVIEW_PROFILE_V2_20261116][LOAD_END]',
              'mode='+String(documentData.viewSwitcher?.activeKey),
              'elapsedMs='+(hoursProfileStartRef.current ? Date.now()-hoursProfileStartRef.current : 'start_missing'),
              'htmlChars='+html.length);
            webViewRef.current?.injectJavaScript(
              "(function(){var nav=performance.getEntriesByType('navigation')[0];" +
              "var payload={type:'hours-webview-profile',mode:" +
              JSON.stringify(documentData.viewSwitcher?.activeKey || '') +
              ",webNowMs:Math.round(performance.now()),domContentLoadedMs:nav?Math.round(nav.domContentLoadedEventEnd):null,loadMs:nav?Math.round(nav.loadEventEnd):null,domNodes:document.getElementsByTagName('*').length,readerTextNodes:document.querySelectorAll('.reader-text').length};" +
              "window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(payload));})();true;"
            );
          }

          // Bible pages already have their scoped colours in the initial HTML.
          // The screen's onReady applies the latest palette after the bridge is
          // ready; a generic late injection must never overwrite book textures.
          if (appearanceRef.current && !embedded && documentData.readerMode !== 'book') {
            applyReaderAppearance(webViewRef.current, appearanceRef.current);
          }
          if (embedded) {
            inject("(function(){var node=document.getElementById('reader');" +
              "if(!node)return;var send=function(){" +
              "var h=Math.ceil(node.getBoundingClientRect().height+2);" +
              "window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(" +
              "JSON.stringify({type:'reader-height',height:h}));};" +
              "send();if(typeof ResizeObserver!=='undefined')new ResizeObserver(send).observe(node);" +
              "setTimeout(send,150);})();");
          }
          const ratio = scrollFallbackRef.current;
          const captured = languageProgressRef.current;
          scrollFallbackRef.current = null;
          languageProgressRef.current = null;
          if (ratio !== null && !captured) {
            inject('setTimeout(function(){var max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);window.scrollTo(0,max*' + Math.max(0,Math.min(1,ratio)) + ');},120)');
          }
          onReady?.(event);
        }}
        style={[styles.webView, {backgroundColor: pageBackground}, embedded && {flex: 0, height: embeddedHeight}]}
        onConsoleMessage={(event) => {
          const { message, lineNumber } = event.nativeEvent;
          if (message && (message.includes('[runtime]') || message.includes('[reader]') || message.includes('Error'))) {
            console.warn('[webview]', message, '@', lineNumber);
          }
        }}
      />

      {!embedded && documentData.readerMode !== 'book' && (
        <LinearGradient
          pointerEvents="none"
          colors={[withOpacity(pageBackground, 0), withOpacity(pageBackground, 0.72), pageBackground]}
          locations={[0, 0.58, 1]}
          style={[
            styles.bottomFade,
            {
              bottom: Math.max(insets.bottom, 8),
            },
          ]}
        />
      )}
    </View>
  );
});

export default SelectableDocumentReader;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF4DE',
  },

  webView: {
    flex: 1,
    backgroundColor: '#FFF4DE',
  },

  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 28,
  },
});
