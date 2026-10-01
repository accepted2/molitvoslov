import React, {useEffect, useMemo, useState} from 'react';

import {Pressable, StyleSheet, Text, useWindowDimensions, View} from 'react-native';

import {getSavedItems} from '../../services/savedItems';
import {
  READER_LANGUAGE_MODES,
  buildReaderLanguageOptions,
} from '../../services/readerLanguageModes';

import SelectableDocumentReader from './SelectableDocumentReader';

const normalizeText = (value) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]*\n+/g, '\uE000')
    .replace(/\n/g, ' ')
    .replace(/\uE000/g, '\n\n')
    .trim();

export default function ExpandablePrayerBlock({
  title,
  text,
  secondaryText = '',
  traditionalText = '',
  onCollapse,
  onExpand,
  saveProps = null,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [savedItems, setSavedItems] = useState([]);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [viewMode, setViewMode] = useState(READER_LANGUAGE_MODES.BOTH);

  const {height: windowHeight} = useWindowDimensions();

  const readerHeight = Math.max(500, Math.min(windowHeight * 0.78, 720));

  const normalizedText = useMemo(() => {
    let source = String(text || '');

    if (saveProps?.metadata?.section === 'prayers_before') {
      source = source.replace(/^s*Разумно да будет, како подобает особь пети Псалтирьs*/iu, '');
    }

    return normalizeText(source);
  }, [text, saveProps?.metadata?.section]);

  const normalizedSecondaryText = useMemo(() => normalizeText(secondaryText), [secondaryText]);

  const normalizedTraditionalText = useMemo(
    () => normalizeText(traditionalText),
    [traditionalText]
  );

  useEffect(() => {
    if (!isOpen || !saveProps?.sourceType || !saveProps?.sourceId) {
      return;
    }

    loadSaved();
  }, [
    isOpen,
    saveProps?.sourceType,
    saveProps?.sourceId,
    saveProps?.anchorType,
    saveProps?.anchorId,
  ]);

  useEffect(() => {
    if (
      (viewMode === READER_LANGUAGE_MODES.BOTH || viewMode === READER_LANGUAGE_MODES.RUSSIAN) &&
      !normalizedSecondaryText
    ) {
      setViewMode(READER_LANGUAGE_MODES.CHURCH);
      return;
    }

    if (viewMode === READER_LANGUAGE_MODES.TRADITIONAL && !normalizedTraditionalText) {
      setViewMode(READER_LANGUAGE_MODES.CHURCH);
    }
  }, [viewMode, normalizedSecondaryText, normalizedTraditionalText]);

  const loadSaved = async () => {
    try {
      const saved = await getSavedItems({
        source_type: saveProps.sourceType,
        source_id: saveProps.sourceId,
        anchor_type: saveProps.anchorType,
        anchor_id: saveProps.anchorId,
      });

      setSavedItems(saved);
    } catch (error) {
      console.log(
        'Ошибка загрузки сохранений молитвенного блока:',
        error.response?.data || error.message
      );
    }
  };

  const documentData = useMemo(() => {
    if (!saveProps || (!normalizedText && !normalizedSecondaryText && !normalizedTraditionalText)) {
      return null;
    }

    const blocks = [];
    const normalizedSaved = [];

    const addBlock = ({id, value, language, label = '', className = ''}) => {
      if (!value) {
        return;
      }

      blocks.push({
        id,
        text: value,
        label,
        sourceType: saveProps.sourceType,
        sourceId: saveProps.sourceId,
        anchorType: saveProps.anchorType,
        anchorId: saveProps.anchorId,
        sourceTitle: saveProps.sourceTitle || title,
        itemTitle: saveProps.itemTitle || title,
        fullSaveType: 'prayer',
        className,
        metadata: {
          ...(saveProps.metadata || {}),
          language,
        },
      });

      savedItems
        .filter((item) => {
          if (item.start_offset === null || item.end_offset === null) {
            return false;
          }

          const savedLanguage = item.metadata?.language || 'church';
          return savedLanguage === language;
        })
        .forEach((item) => {
          normalizedSaved.push({
            ...item,
            anchor_id: id,
          });
        });
    };

    const psalterClass =
      saveProps.sourceType === 'psalter' ? 'psalter-prayer psalter-reading-prayers' : '';

    if (viewMode === READER_LANGUAGE_MODES.TRADITIONAL) {
      addBlock({
        id: 3,
        value: normalizedTraditionalText,
        language: 'traditional',
        className: psalterClass,
      });
    } else if (viewMode === READER_LANGUAGE_MODES.RUSSIAN) {
      addBlock({
        id: 2,
        value: normalizedSecondaryText,
        language: 'russian',
        className: psalterClass ? `${psalterClass} secondary` : 'secondary',
      });
    } else {
      addBlock({
        id: 1,
        value: normalizedText,
        language: 'church',
        label:
          viewMode === READER_LANGUAGE_MODES.BOTH && normalizedSecondaryText
            ? 'Церковнославянский'
            : '',
        className: psalterClass,
      });

      if (viewMode === READER_LANGUAGE_MODES.BOTH) {
        addBlock({
          id: 2,
          value: normalizedSecondaryText,
          language: 'russian',
          label: 'Русский',
          className: psalterClass ? `${psalterClass} secondary` : 'secondary',
        });
      }
    }

    return {
      title: '',
      description: '',
      viewSwitcher: {
        activeKey: viewMode,
        options: buildReaderLanguageOptions({
          hasRussian: !!normalizedSecondaryText,
          hasTraditional: !!normalizedTraditionalText,
        }),
      },
      progressAnchorType: saveProps.anchorType,
      savedItems: normalizedSaved,
      sections: [
        {
          progressAnchorId: Number(saveProps.anchorId),
          trackProgress: false,
          title: '',
          rows: [
            {
              layout:
                viewMode === READER_LANGUAGE_MODES.BOTH && blocks.length > 1 ? 'parallel' : 'stack',
              sharedTitle:
                saveProps?.metadata?.section === 'prayers_before'
                  ? 'Разумно да будет, како подобает особь пети Псалтирь'
                  : '',
              blocks,
            },
          ],
        },
      ],
    };
  }, [
    normalizedSecondaryText,
    normalizedText,
    normalizedTraditionalText,
    saveProps,
    savedItems,
    title,
    viewMode,
  ]);

  if (!normalizedText && !normalizedSecondaryText && !normalizedTraditionalText) {
    return null;
  }

  const toggle = () => {
    if (isOpen) {
      setIsOpen(false);
      onCollapse?.();
      return;
    }

    setIsOpen(true);
    onExpand?.();
  };

  const collapse = () => {
    setIsOpen(false);
    onCollapse?.();
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isOpen ? `Свернуть ${title}` : `Развернуть ${title}`}
        style={({pressed}) => [styles.header, pressed && styles.pressed]}
        onPress={toggle}
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
      >
        <View style={styles.headerContent}>
          <Text style={styles.title}>{title}</Text>

          {!isOpen && (
            <Text style={styles.preview} numberOfLines={2}>
              {normalizedText || normalizedSecondaryText || normalizedTraditionalText}
            </Text>
          )}
        </View>

        <Text style={styles.arrow}>{isOpen ? '▴' : '▾'}</Text>
      </Pressable>

      {isOpen && (
        <View style={styles.content}>
          {documentData ? (
            <View style={[styles.reader, {height: readerHeight}]}>
              <SelectableDocumentReader
                documentData={documentData}
                savedProgress={null}
                onViewModeChange={setViewMode}
              />
            </View>
          ) : (
            <Text style={styles.prayerText}>{normalizedText}</Text>
          )}

          <Pressable
            style={({pressed}) => [styles.collapseButton, pressed && styles.collapsePressed]}
            onPress={collapse}
          >
            <Text style={styles.collapseIcon}>▴</Text>
            <Text style={styles.collapseText}>Свернуть</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8E9CF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(123, 79, 36, 0.18)',
    overflow: 'hidden',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },

  pressed: {
    opacity: 0.7,
  },

  headerContent: {
    flex: 1,
    paddingRight: 12,
  },

  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#5A3822',
  },

  preview: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20,
    color: '#765238',
    fontFamily: 'serif',
  },

  arrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(123, 79, 36, 0.20)',
    backgroundColor: '#EEDCC0',
    color: '#7A4F2D',
    fontSize: 17,
    lineHeight: 27,
    textAlign: 'center',
    fontWeight: '700',
  },

  content: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(123, 79, 36, 0.16)',
  },

  reader: {
    marginTop: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },

  prayerText: {
    paddingTop: 16,
    fontSize: 17,
    lineHeight: 28,
    color: '#3E2A1D',
    fontFamily: 'serif',
    textAlign: 'justify',
  },

  collapseButton: {
    alignSelf: 'center',
    minHeight: 30,
    marginTop: 6,
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#EEDCC0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  collapsePressed: {
    opacity: 0.7,
  },

  collapseIcon: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#7A4F2D',
  },

  collapseText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#7A4F2D',
  },
});
