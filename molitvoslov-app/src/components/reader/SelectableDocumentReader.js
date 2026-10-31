import React, {forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react';

import {StyleSheet, View} from 'react-native';

import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {WebView} from 'react-native-webview';

import {LinearGradient} from 'expo-linear-gradient';

import {deleteSavedItem, saveItem} from '../../services/savedItems';
import {getCachedPonomarFontDataUri, loadPonomarFontDataUri} from '../../services/ponomarFont';

import {buildHtml, scriptSafeJson} from './selectableDocumentReader/buildHtml';
import {getReadingSettings, DEFAULT_READING_SETTINGS} from '../../services/readerPreferences';

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
    focusTarget,
    topContentInset = 0,
    bottomContentInset = 0,
    respectBottomSafeArea = true,
    backgroundColor = '#FFF4DE',
    onSaved,
    onProgress,
    onAction,
    onMemorialOpen,
    onViewModeChange,
    onPageTurn,
    onReady,
    onReadingScroll,
  },
  ref
) {
  const insets = useSafeAreaInsets();
  const [readingSettings, setReadingSettings] = useState(DEFAULT_READING_SETTINGS);
  useEffect(() => {
    let active = true;
    getReadingSettings().then((settings) => { if (active) setReadingSettings(settings); }).catch(console.warn);
    return () => { active = false; };
  }, []);

  const webViewRef = useRef(null);

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

  useEffect(() => {
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
  }, [needsPonomar]);

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

  const html = useMemo(() => {
    console.warn('[reader] incoming FT =', JSON.stringify(focusTarget));
    const markup = buildHtml({
      documentData,
      savedProgress,
      focusTarget,
      topContentInset,
      bottomContentInset,
      ponomarFontDataUri,
    });
    // Preserve separate pagination and per-book themes for Bible/book readers.
    if (documentData.readerMode === 'book') return markup;
    const palette = readingSettings.palette === 'custom'
      ? {background: readingSettings.customBackground, text: readingSettings.customText, surface: readingSettings.customBackground}
      : (PALETTE_COLORS[readingSettings.palette] || PALETTE_COLORS.parchment);
    const size = Math.max(14, Math.min(28, Number(readingSettings.fontSize) || 17));
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
    return markup.replace('</style>', `${css}</style>`);
  }, [documentData, savedProgress, focusTarget, topContentInset, bottomContentInset, ponomarFontDataUri, readingSettings]);

  const inject = (script) => {
    webViewRef.current?.injectJavaScript(script + '; true;');
  };

  useImperativeHandle(
    ref,
    () => ({
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

      setBookTheme: (theme) => {
        inject(
          'window.readerApi && window.readerApi.setBookTheme(' +
            scriptSafeJson(theme || 'paper') +
            ')'
        );
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

    if (message.type === 'reading-scroll-activity') {
      onReadingScroll?.('activity');
      return;
    }
    if (message.type === 'reading-scroll') {
      onReadingScroll?.(message.direction);
      return;
    }
    if (message.type === 'view-mode') {
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

    if (message.type === 'memorial-open') {
      onMemorialOpen?.(message.context || null);

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
      } catch (deleteError) {
        console.log('Ошибка удаления выделения:', deleteError.message);

        inject("window.readerApi && window.readerApi.saveFailed('Не удалось удалить')");
      }

      return;
    }

    if (message.type !== 'save-selection') {
      return;
    }

    const itemConfig = itemConfigMap.get(Number(message.itemId));

    if (!itemConfig) {
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
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: respectBottomSafeArea ? Math.max(insets.bottom, 8) : 0,
          backgroundColor,
        },
      ]}
    >
      <WebView
        ref={webViewRef}
        source={{
          html,
        }}
        originWhitelist={['*']}
        javaScriptEnabled
        injectedJavaScript={documentData.readerMode === 'book' ? undefined : "(function() {\n var previous = window.scrollY || 0, pending = 0, direction = '', lastSent = 0;\n var post = function(type, dir) {\n   if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:type,direction:dir}));\n };\n window.addEventListener('scroll', function() {\n   var y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);\n   var delta = y - previous;\n   previous = y;\n   if (!delta) return;\n   var now = Date.now();\n   if (now - lastSent > 100) { post('reading-scroll-activity'); lastSent = now; }\n   if (Math.abs(delta) > 100) { pending = 0; direction = delta < 0 ? 'down' : 'up'; }\n   if (y <= 35) {\n     if (direction !== 'top') {\n       direction = 'top';\n       pending = 0;\n       post('reading-scroll', 'top');\n     }\n     return;\n   }\n   if (direction === 'top') { direction = ''; pending = 0; }\n   var next = delta < 0 ? 'up' : 'down';\n   if (next !== direction) {\n     pending += Math.abs(delta);\n     if (pending >= 5 || y < 35) {\n       direction = next;\n       pending = 0;\n       post('reading-scroll', next);\n     }\n   } else {\n     pending = 0;\n   }\n }, {passive:true});\n})(); true;"}
        scrollEnabled={documentData.readerMode !== 'book'}
        nestedScrollEnabled={documentData.readerMode !== 'book'}
        showsVerticalScrollIndicator={false}
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        textZoom={100}
        onMessage={handleMessage}
        onLoadEnd={onReady}
        style={[styles.webView, {backgroundColor: documentData.readerMode === 'book' ? backgroundColor : (readingSettings.palette === 'custom' ? readingSettings.customBackground : (PALETTE_COLORS[readingSettings.palette]?.background || backgroundColor))}]}
        onConsoleMessage={(event) => {
          const { message, lineNumber } = event.nativeEvent;
          if (message && (message.includes('[runtime]') || message.includes('[reader]') || message.includes('Error'))) {
            console.warn('[webview]', message, '@', lineNumber);
          }
        }}
      />

      {documentData.readerMode !== 'book' && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255, 244, 222, 0)', 'rgba(255, 244, 222, 0.72)', '#FFF4DE']}
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
