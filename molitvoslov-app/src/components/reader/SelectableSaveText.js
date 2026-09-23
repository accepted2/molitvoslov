import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  StyleSheet,
  TextInput,
} from 'react-native';

import {
  saveItem,
} from '../../services/savedItems';

import {
  useTextSelection,
} from '../../context/TextSelectionContext';


const MAX_SELECTION_LENGTH =
  500;

const WORD_PATTERN =
  /^[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ\u0400-\u052F\u0300-\u036F\u0483-\u0489'’\-]+$/;

let instanceCounter = 0;


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
  onSaved,
}) {
  const inputRef =
    useRef(null);

  const instanceIdRef =
    useRef(null);

  if (
    instanceIdRef.current ===
    null
  ) {
    instanceCounter += 1;

    instanceIdRef.current =
      `selectable-${instanceCounter}`;
  }

  const {
    activateSelection,
    clearSelection,
  } = useTextSelection();

  const [
    selection,
    setSelection,
  ] = useState({
    start: 0,
    end: 0,
  });

  const flattenedStyle =
    StyleSheet.flatten(
      textStyle
    ) || {};

  const initialHeight =
    Number(
      flattenedStyle.lineHeight ||
      26
    );

  const [
    contentHeight,
    setContentHeight,
  ] = useState(
    initialHeight
  );


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


  const clearLocalSelection =
    () => {
      setSelection({
        start: 0,
        end: 0,
      });

      inputRef.current
        ?.blur();
    };


  useEffect(() => {
    return () => {
      clearSelection(
        instanceIdRef.current
      );
    };
  }, [
    clearSelection,
  ]);


  const saveRange =
    async range => {
      const selectedText =
        text
          .slice(
            range.start,
            range.end
          )
          .trim();

      if (
        !selectedText ||
        selectedText.length >
          MAX_SELECTION_LENGTH
      ) {
        return {
          ok: false,
          message:
            'Слишком большой фрагмент',
        };
      }

      const saveType =
        classifySelection({
          text,
          range,
          fullSaveType,
        });

      try {
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
              range.start,

            end_offset:
              range.end,

            metadata,
          });

        onSaved?.(
          saved
        );

        clearLocalSelection();

        clearSelection(
          instanceIdRef.current
        );

        return {
          ok: true,
        };
      } catch (error) {
        console.log(
          'Ошибка сохранения:',
          error.response?.data ||
          error.message
        );

        return {
          ok: false,
          message:
            'Не удалось сохранить',
        };
      }
    };


  const handleSelectionChange =
    event => {
      const next =
        event.nativeEvent
          .selection;

      setSelection(
        next
      );

      const start =
        clamp(
          next.start -
            prefixLength,
          0,
          text.length
        );

      const end =
        clamp(
          next.end -
            prefixLength,
          0,
          text.length
        );

      const range =
        trimRange(
          text,
          start,
          end
        );

      const selectedText =
        text
          .slice(
            range.start,
            range.end
          )
          .trim();

      const count =
        selectedText.length;

      const hasText =
        /[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ\u0400-\u052F]/.test(
          selectedText
        );

      if (
        count <= 0 ||
        !hasText
      ) {
        clearSelection(
          instanceIdRef.current
        );

        return;
      }

      const tooLong =
        count >
          MAX_SELECTION_LENGTH;

      activateSelection({
        id:
          instanceIdRef.current,

        count,

        max:
          MAX_SELECTION_LENGTH,

        tooLong,

        canSave:
          !tooLong,

        onSave:
          () =>
            saveRange(
              range
            ),

        onClear:
          clearLocalSelection,
      });
    };


  return (
    <TextInput
      ref={
        inputRef
      }
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
        'rgba(206, 162, 72, 0.48)'
      }
      underlineColorAndroid="transparent"
      onChangeText={() => {}}
      onSelectionChange={
        handleSelectionChange
      }
      onContentSizeChange={
        event => {
          setContentHeight(
            Math.max(
              initialHeight,
              Math.ceil(
                event
                  .nativeEvent
                  .contentSize
                  .height
              ) + 2
            )
          );
        }
      }
      style={[
        textStyle,
        styles.input,
        {
          height:
            contentHeight,
        },
      ]}
    />
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
  });
