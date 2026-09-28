import React, {useMemo, useRef} from 'react';

import {StyleSheet, View} from 'react-native';

import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {WebView} from 'react-native-webview';

import {LinearGradient} from 'expo-linear-gradient';

import {deleteSavedItem, saveItem} from '../../services/savedItems';

import {buildHtml, scriptSafeJson} from './selectableDocumentReader/buildHtml';

export default function SelectableDocumentReader({
  documentData,
  savedProgress,
  focusTarget,
  topContentInset = 0,
  bottomContentInset = 0,
  onSaved,
  onProgress,
  onAction,
  onViewModeChange,
  onPageTurn,
}) {
  const insets = useSafeAreaInsets();

  const webViewRef = useRef(null);

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

  const html = useMemo(
    () =>
      buildHtml({
        documentData,
        savedProgress,
        focusTarget,
        topContentInset,
        bottomContentInset,
      }),
    [documentData, savedProgress, focusTarget, topContentInset, bottomContentInset]
  );

  const inject = (script) => {
    webViewRef.current?.injectJavaScript(script + '; true;');
  };

  const handleMessage = async (event) => {
    let message;

    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
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

        metadata: itemConfig.metadata || {},
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
          paddingBottom: Math.max(insets.bottom, 8),
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
        scrollEnabled={documentData.readerMode !== 'book'}
        nestedScrollEnabled={documentData.readerMode !== 'book'}
        showsVerticalScrollIndicator={false}
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        textZoom={100}
        onMessage={handleMessage}
        style={styles.webView}
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
}

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
