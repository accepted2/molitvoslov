import React, {
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  saveItem,
} from '../../services/savedItems';

import {
  colors,
  radius,
  spacing,
} from '../../theme';


const MAX_SELECTION_LENGTH =
  500;

const WORD_PATTERN =
  /^[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ\u0400-\u052F\u0300-\u036F\u0483-\u0489'’\-]+$/;


const clamp = (
  value,
  min,
  max
) =>
  Math.max(
    min,
    Math.min(
      value,
      max
    )
  );


const trimRange = (
  text,
  start,
  end
) => {
  let nextStart =
    clamp(
      start,
      0,
      text.length
    );

  let nextEnd =
    clamp(
      end,
      nextStart,
      text.length
    );

  while (
    nextStart < nextEnd &&
    /\s/.test(
      text[nextStart]
    )
  ) {
    nextStart += 1;
  }

  while (
    nextEnd > nextStart &&
    /\s/.test(
      text[nextEnd - 1]
    )
  ) {
    nextEnd -= 1;
  }

  return {
    start: nextStart,
    end: nextEnd,
  };
};


const sameRange = (
  first,
  second
) =>
  first.start ===
    second.start &&
  first.end ===
    second.end;


const getSentenceRange = (
  text,
  anchor
) => {
  let start =
    clamp(
      anchor,
      0,
      text.length
    );

  let end =
    start;

  while (
    start > 0 &&
    !/[.!?…]/.test(
      text[start - 1]
    )
  ) {
    start -= 1;
  }

  while (
    start < text.length &&
    /\s/.test(
      text[start]
    )
  ) {
    start += 1;
  }

  while (
    end < text.length &&
    !/[.!?…]/.test(
      text[end]
    )
  ) {
    end += 1;
  }

  if (
    end < text.length
  ) {
    end += 1;
  }

  return trimRange(
    text,
    start,
    end
  );
};


const getParagraphRange = (
  text,
  anchor
) => {
  const position =
    clamp(
      anchor,
      0,
      text.length
    );

  const before =
    text.slice(
      0,
      position
    );

  const after =
    text.slice(
      position
    );

  const leftBreak =
    Math.max(
      before.lastIndexOf(
        '\n\n'
      ),
      before.lastIndexOf(
        '\r\n\r\n'
      )
    );

  const start =
    leftBreak === -1
      ? 0
      : leftBreak + 2;

  const candidates =
    [
      after.indexOf(
        '\n\n'
      ),
      after.indexOf(
        '\r\n\r\n'
      ),
    ].filter(
      value =>
        value >= 0
    );

  const rightBreak =
    candidates.length
      ? Math.min(
          ...candidates
        )
      : -1;

  const end =
    rightBreak === -1
      ? text.length
      : position +
        rightBreak;

  return trimRange(
    text,
    start,
    end
  );
};


const classifySelection = ({
  text,
  range,
  fullSaveType,
}) => {
  const normalized =
    trimRange(
      text,
      range.start,
      range.end
    );

  const wholeText =
    trimRange(
      text,
      0,
      text.length
    );

  const selected =
    text
      .slice(
        normalized.start,
        normalized.end
      )
      .trim();

  if (
    fullSaveType &&
    sameRange(
      normalized,
      wholeText
    )
  ) {
    return fullSaveType;
  }

  if (
    selected &&
    WORD_PATTERN.test(
      selected
    )
  ) {
    return 'word';
  }

  const sentence =
    getSentenceRange(
      text,
      normalized.start
    );

  if (
    sameRange(
      normalized,
      sentence
    )
  ) {
    return 'sentence';
  }

  const paragraph =
    getParagraphRange(
      text,
      normalized.start
    );

  if (
    sameRange(
      normalized,
      paragraph
    )
  ) {
    return 'paragraph';
  }

  return 'fragment';
};


const renderStyledText = ({
  text,
  prefix,
  prefixStyle,
  textStyle,
  wordStyleResolver,
}) => {
  if (
    !wordStyleResolver
  ) {
    return (
      <Text
        style={
          textStyle
        }
      >
        {!!prefix && (
          <Text
            style={
              prefixStyle
            }
          >
            {prefix}
          </Text>
        )}

        {text}
      </Text>
    );
  }

  const parts =
    text.split(
      /(\s+)/
    );

  return (
    <Text
      style={
        textStyle
      }
    >
      {!!prefix && (
        <Text
          style={
            prefixStyle
          }
        >
          {prefix}
        </Text>
      )}

      {parts.map(
        (
          part,
          index
        ) => (
          <Text
            key={
              index
            }
            style={
              /^\s+$/.test(
                part
              )
                ? null
                : wordStyleResolver(
                    part
                  )
            }
          >
            {part}
          </Text>
        )
      )}
    </Text>
  );
};


export default function SelectableSaveText({
  text,
  textStyle,
  sourceType,
  sourceId,
  anchorType,
  anchorId,
  sourceTitle = '',
  itemTitle = '',
  metadata = {},
  fullSaveType = 'prayer',
  prefix = '',
  prefixStyle,
  wordStyleResolver,
  onSaved,
}) {
  const [
    selection,
    setSelection,
  ] = useState({
    start: 0,
    end: 0,
  });

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState('');


  const displayText =
    `${prefix || ''}${text || ''}`;

  const prefixLength =
    (prefix || '').length;


  const normalizedSelection =
    useMemo(
      () => {
        const start =
          clamp(
            selection.start -
              prefixLength,
            0,
            text.length
          );

        const end =
          clamp(
            selection.end -
              prefixLength,
            0,
            text.length
          );

        return trimRange(
          text,
          start,
          end
        );
      },
      [
        selection,
        prefixLength,
        text,
      ]
    );


  const selectedLength =
    Math.max(
      0,
      normalizedSelection.end -
        normalizedSelection.start
    );

  const hasSelection =
    selectedLength > 0;

  const selectionTooLong =
    selectedLength >
      MAX_SELECTION_LENGTH;

  const selectedText =
    text
      .slice(
        normalizedSelection.start,
        normalizedSelection.end
      )
      .trim();

  const hasWord =
    /[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ\u0400-\u052F]/.test(
      selectedText
    );

  const canSave =
    hasSelection &&
    hasWord &&
    !selectionTooLong &&
    !saving;


  const handleSave =
    async () => {
      if (!canSave) {
        return;
      }

      const saveType =
        classifySelection({
          text,
          range:
            normalizedSelection,
          fullSaveType,
        });

      try {
        setSaving(
          true
        );

        setMessage('');

        const saved =
          await saveItem({
            save_type:
              saveType,

            source_type:
              sourceType,

            source_id:
              sourceId,

            anchor_type:
              anchorType,

            anchor_id:
              anchorId,

            source_title:
              sourceTitle,

            item_title:
              itemTitle,

            text:
              selectedText,

            start_offset:
              normalizedSelection
                .start,

            end_offset:
              normalizedSelection
                .end,

            metadata,
          });

        onSaved?.(
          saved
        );

        setMessage(
          'Сохранено'
        );
      } catch (error) {
        console.log(
          'Ошибка сохранения:',
          error.response?.data ||
          error.message
        );

        setMessage(
          'Не удалось сохранить'
        );
      } finally {
        setSaving(
          false
        );
      }
    };


  return (
    <View>
      <View
        style={
          styles.textLayer
        }
      >
        {
          renderStyledText({
            text:
              text || '',
            prefix,
            prefixStyle,
            textStyle,
            wordStyleResolver,
          })
        }

        <TextInput
          value={
            displayText
          }
          multiline
          scrollEnabled={
            false
          }
          showSoftInputOnFocus={
            false
          }
          contextMenuHidden
          selectTextOnFocus={
            false
          }
          selectionColor={
            'rgba(206, 162, 72, 0.38)'
          }
          underlineColorAndroid="transparent"
          onChangeText={() => {}}
          onSelectionChange={
            event => {
              setSelection(
                event.nativeEvent
                  .selection
              );

              setMessage('');
            }
          }
          style={[
            StyleSheet
              .absoluteFillObject,

            textStyle,

            styles.inputOverlay,
          ]}
        />
      </View>


      {hasSelection && (
        <View
          style={
            styles.savePanel
          }
        >
          <View
            style={
              styles.saveInfo
            }
          >
            <Text
              style={[
                styles.counter,

                selectionTooLong &&
                  styles.counterError,
              ]}
            >
              {selectedLength}
              /
              {MAX_SELECTION_LENGTH}
            </Text>

            {selectionTooLong && (
              <Text
                style={
                  styles.limitText
                }
              >
                Уменьшите выделение
              </Text>
            )}

            {!!message && (
              <Text
                style={
                  styles.message
                }
              >
                {message}
              </Text>
            )}
          </View>

          <Pressable
            disabled={
              !canSave
            }
            onPress={
              handleSave
            }
            style={({pressed}) => [
              styles.saveButton,

              !canSave &&
                styles
                  .saveButtonDisabled,

              pressed &&
                canSave &&
                styles
                  .saveButtonPressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator
                size="small"
                color={
                  colors.white
                }
              />
            ) : (
              <Text
                style={
                  styles.saveButtonText
                }
              >
                Сохранить
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}


const styles =
  StyleSheet.create({
    textLayer: {
      position: 'relative',
    },

    inputOverlay: {
      padding: 0,
      margin: 0,
      borderWidth: 0,
      backgroundColor:
        'transparent',
      color:
        'transparent',
      textAlignVertical:
        'top',
    },

    savePanel: {
      marginTop:
        spacing.sm,
      padding:
        spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius:
        radius.md,
      borderWidth: 1,
      borderColor:
        colors.borderStrong,
      backgroundColor:
        colors.surfaceWarm,
    },

    saveInfo: {
      flex: 1,
      paddingRight:
        spacing.sm,
    },

    counter: {
      fontSize: 11,
      fontWeight: '700',
      color:
        colors.textSecondary,
    },

    counterError: {
      color:
        colors.liturgical,
    },

    limitText: {
      marginTop: 2,
      fontSize: 11,
      color:
        colors.liturgical,
    },

    message: {
      marginTop: 2,
      fontSize: 11,
      color:
        colors.accent,
    },

    saveButton: {
      minWidth: 96,
      minHeight: 36,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius:
        radius.sm,
      backgroundColor:
        colors.accent,
    },

    saveButtonDisabled: {
      opacity: 0.38,
    },

    saveButtonPressed: {
      opacity: 0.72,
    },

    saveButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color:
        colors.white,
    },
  });
