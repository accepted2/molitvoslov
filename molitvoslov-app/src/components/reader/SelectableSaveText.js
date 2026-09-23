import React, {
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
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
  /[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ\u0400-\u052F\u0300-\u036F\u0483-\u0489'’\-]/;


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
  anchor
) => {
  let position =
    clamp(
      anchor,
      0,
      Math.max(
        text.length - 1,
        0
      )
    );

  while (
    position > 0 &&
    !WORD_CHAR.test(
      text[position] || ''
    )
  ) {
    position -= 1;
  }

  let start =
    position;

  let end =
    position;

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

  const beforeDouble =
    before.lastIndexOf(
      '\n\n'
    );

  const beforeWindows =
    before.lastIndexOf(
      '\r\n\r\n'
    );

  const leftBreak =
    Math.max(
      beforeDouble,
      beforeWindows
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


const getRange = (
  text,
  anchor,
  saveType
) => {
  if (
    saveType === 'word'
  ) {
    return getWordRange(
      text,
      anchor
    );
  }

  if (
    saveType === 'sentence'
  ) {
    return getSentenceRange(
      text,
      anchor
    );
  }

  if (
    saveType === 'paragraph'
  ) {
    return getParagraphRange(
      text,
      anchor
    );
  }

  return {
    start: 0,
    end: text.length,
  };
};


const tokenize =
  text => {
    const tokens = [];

    const matcher =
      /\s+|\S+/g;

    let match;

    while (
      (
        match =
          matcher.exec(
            text
          )
      )
    ) {
      tokens.push({
        text:
          match[0],

        start:
          match.index,

        end:
          match.index +
          match[0].length,

        whitespace:
          /^\s+$/.test(
            match[0]
          ),
      });
    }

    return tokens;
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
  fullSaveLabel = 'Молитва',
  prefix = '',
  prefixStyle,
  wordStyleResolver,
  onSaved,
}) {
  const [
    anchor,
    setAnchor,
  ] = useState(null);

  const [
    selectedRange,
    setSelectedRange,
  ] = useState(null);

  const [
    savingType,
    setSavingType,
  ] = useState(null);

  const [
    message,
    setMessage,
  ] = useState('');


  const tokens =
    useMemo(
      () =>
        tokenize(
          text || ''
        ),
      [
        text,
      ]
    );


  const actions =
    useMemo(
      () => {
        const base = [
          {
            type:
              'word',

            label:
              'Слово',
          },

          {
            type:
              'sentence',

            label:
              'Предложение',
          },

          {
            type:
              'paragraph',

            label:
              'Абзац',
          },
        ];

        if (
          fullSaveType &&
          fullSaveLabel
        ) {
          base.push({
            type:
              fullSaveType,

            label:
              fullSaveLabel,
          });
        }

        return base;
      },
      [
        fullSaveType,
        fullSaveLabel,
      ]
    );


  const activateWord =
    token => {
      if (
        token.whitespace
      ) {
        return;
      }

      const range =
        getWordRange(
          text,
          token.start
        );

      setAnchor(
        token.start
      );

      setSelectedRange(
        range
      );

      setMessage('');
    };


  const handleSave =
    async saveType => {
      if (
        anchor === null ||
        !text
      ) {
        return;
      }

      const range =
        getRange(
          text,
          anchor,
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

      setSelectedRange(
        range
      );

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
          'Ошибка сохранения:',
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


  const overlapsSelection =
    token =>
      !!selectedRange &&
      token.end >
        selectedRange.start &&
      token.start <
        selectedRange.end;


  return (
    <View>
      <Text
        style={
          textStyle
        }
        suppressHighlighting
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

        {tokens.map(
          (
            token,
            index
          ) => {
            if (
              token.whitespace
            ) {
              return (
                <React.Fragment
                  key={index}
                >
                  {token.text}
                </React.Fragment>
              );
            }

            const extraStyle =
              wordStyleResolver
                ? wordStyleResolver(
                    token.text
                  )
                : null;

            return (
              <Text
                key={index}
                onLongPress={() =>
                  activateWord(
                    token
                  )
                }
                suppressHighlighting
                style={[
                  extraStyle,

                  overlapsSelection(
                    token
                  ) &&
                    styles.selectedText,
                ]}
              >
                {token.text}
              </Text>
            );
          }
        )}
      </Text>


      {anchor !== null && (
        <View
          style={styles.actions}
        >
          <Text
            style={
              styles.actionsLabel
            }
          >
            Сохранить:
          </Text>

          <View
            style={
              styles.actionsRow
            }
          >
            {actions.map(
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
                      styles
                        .actionPressed,
                  ]}
                >
                  {
                    savingType ===
                    action.type
                      ? (
                        <ActivityIndicator
                          size="small"
                          color={
                            colors.accent
                          }
                        />
                      )
                      : (
                        <Text
                          style={
                            styles.actionText
                          }
                        >
                          {
                            action.label
                          }
                        </Text>
                      )
                  }
                </Pressable>
              )
            )}
          </View>

          <View
            style={
              styles.actionFooter
            }
          >
            {!!message && (
              <Text
                style={
                  styles.message
                }
              >
                {message}
              </Text>
            )}

            <Pressable
              onPress={() => {
                setAnchor(
                  null
                );

                setSelectedRange(
                  null
                );

                setMessage('');
              }}
              style={({pressed}) => [
                styles.closeButton,

                pressed &&
                  styles
                    .actionPressed,
              ]}
            >
              <Text
                style={
                  styles.closeText
                }
              >
                Закрыть
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}


const styles =
  StyleSheet.create({
    selectedText: {
      backgroundColor:
        'rgba(206, 162, 72, 0.28)',
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
        colors.borderStrong,
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

    actionFooter: {
      minHeight: 24,
      marginTop: 7,
      flexDirection: 'row',
      alignItems: 'center',
    },

    message: {
      flex: 1,
      fontSize: 11,
      color:
        colors.accent,
    },

    closeButton: {
      marginLeft: 'auto',
      paddingVertical: 3,
      paddingHorizontal: 5,
    },

    closeText: {
      fontSize: 11,
      color:
        colors.textMuted,
    },
  });
