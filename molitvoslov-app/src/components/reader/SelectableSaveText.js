import React, {
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


const WORD_CHAR =
  /[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ'’\-]/;


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


const getWordRange = (
  text,
  selection
) => {
  let anchor =
    selection.start;

  if (
    !WORD_CHAR.test(
      text[anchor] || ''
    ) &&
    anchor > 0
  ) {
    anchor -= 1;
  }

  let start = anchor;
  let end = anchor;

  while (
    start > 0 &&
    WORD_CHAR.test(
      text[start - 1]
    )
  ) {
    start -= 1;
  }

  while (
    end < text.length &&
    WORD_CHAR.test(
      text[end]
    )
  ) {
    end += 1;
  }

  return trimRange(
    text,
    start,
    end
  );
};


const getSentenceRange = (
  text,
  selection
) => {
  const anchor =
    selection.start;

  let start = anchor;
  let end = Math.max(
    selection.end,
    anchor
  );

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
  selection
) => {
  const anchor =
    selection.start;

  const before =
    text.slice(
      0,
      anchor
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

  const after =
    text.slice(
      Math.max(
        selection.end,
        anchor
      )
    );

  const rightDouble =
    after.indexOf(
      '\n\n'
    );

  const rightWindows =
    after.indexOf(
      '\r\n\r\n'
    );

  const candidates =
    [
      rightDouble,
      rightWindows,
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
      : Math.max(
          selection.end,
          anchor
        ) +
        rightBreak;

  return trimRange(
    text,
    start,
    end
  );
};


const getRange = (
  text,
  selection,
  saveType
) => {
  if (
    saveType === 'word'
  ) {
    return getWordRange(
      text,
      selection
    );
  }

  if (
    saveType === 'sentence'
  ) {
    return getSentenceRange(
      text,
      selection
    );
  }

  if (
    saveType === 'paragraph'
  ) {
    return getParagraphRange(
      text,
      selection
    );
  }

  return {
    start: 0,
    end: text.length,
  };
};


const ACTIONS = [
  {
    type: 'word',
    label: 'Слово',
  },
  {
    type: 'sentence',
    label: 'Предложение',
  },
  {
    type: 'paragraph',
    label: 'Абзац',
  },
  {
    type: 'prayer',
    label: 'Молитва',
  },
];


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
    contentHeight,
    setContentHeight,
  ] = useState(40);

  const [
    savingType,
    setSavingType,
  ] = useState(null);

  const [
    message,
    setMessage,
  ] = useState('');


  const hasSelection =
    selection.end >
    selection.start;


  const handleSave =
    async saveType => {
      if (
        !text ||
        !hasSelection
      ) {
        return;
      }

      const range =
        getRange(
          text,
          selection,
          saveType
        );

      const excerpt =
        text
          .slice(
            range.start,
            range.end
          )
          .trim();

      if (!excerpt) {
        return;
      }

      try {
        setSavingType(
          saveType
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
              excerpt,

            start_offset:
              range.start,

            end_offset:
              range.end,

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
          'Ошибка сохранения фрагмента:',
          error.response?.data ||
          error.message
        );

        setMessage(
          'Не удалось сохранить'
        );
      } finally {
        setSavingType(
          null
        );
      }
    };


  return (
    <View>
      <TextInput
        value={text}
        multiline
        readOnly
        scrollEnabled={false}
        showSoftInputOnFocus={false}
        contextMenuHidden={false}
        selectionColor={
          'rgba(138, 90, 56, 0.28)'
        }
        underlineColorAndroid="transparent"
        onSelectionChange={
          event => {
            setSelection(
              event.nativeEvent
                .selection
            );

            setMessage('');
          }
        }
        onContentSizeChange={
          event => {
            setContentHeight(
              Math.max(
                40,
                event.nativeEvent
                  .contentSize
                  .height
              )
            );
          }
        }
        style={[
          styles.input,
          textStyle,
          {
            height:
              contentHeight,
          },
        ]}
      />

      {hasSelection && (
        <View
          style={styles.actions}
        >
          <Text
            style={
              styles.actionsLabel
            }
          >
            Сохранить как:
          </Text>

          <View
            style={
              styles.actionsRow
            }
          >
            {ACTIONS.map(
              action => (
                <Pressable
                  key={
                    action.type
                  }
                  disabled={
                    !!savingType
                  }
                  onPress={() =>
                    handleSave(
                      action.type
                    )
                  }
                  style={({pressed}) => [
                    styles.actionButton,
                    pressed &&
                    styles.actionPressed,
                  ]}
                >
                  {savingType ===
                  action.type ? (
                    <ActivityIndicator
                      size="small"
                      color={
                        colors.accent
                      }
                    />
                  ) : (
                    <Text
                      style={
                        styles.actionText
                      }
                    >
                      {action.label}
                    </Text>
                  )}
                </Pressable>
              )
            )}
          </View>

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
      )}
    </View>
  );
}


const styles =
  StyleSheet.create({
    input: {
      padding: 0,
      margin: 0,
      borderWidth: 0,
      backgroundColor:
        'transparent',
      textAlignVertical:
        'top',
    },

    actions: {
      marginTop:
        spacing.sm,
      padding:
        spacing.sm,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surfaceWarm,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    actionsLabel: {
      marginBottom: 7,
      fontSize: 11,
      fontWeight: '700',
      color:
        colors.textSecondary,
    },

    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },

    actionButton: {
      minHeight: 32,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius:
        radius.sm,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.borderStrong,
    },

    actionPressed: {
      opacity: 0.6,
    },

    actionText: {
      fontSize: 12,
      fontWeight: '700',
      color:
        colors.accentDark,
    },

    message: {
      marginTop: 7,
      fontSize: 11,
      color:
        colors.accent,
    },
  });
