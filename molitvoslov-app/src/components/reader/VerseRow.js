import React from 'react';

import {
  StyleSheet,
  View,
} from 'react-native';

import SelectableSaveText
  from './SelectableSaveText';

import {
  colors,
  radius,
} from '../../theme';


export default function VerseRow({
  verse,
  psalmId,
  psalmNumber,
  psalterId,
  kathismaNumber,
  kathismaTitle,
  hasSavedFragment = false,
  onFragmentSaved,
  onLayout,
}) {
  if (!verse) {
    return null;
  }


  const commonMetadata = {
    kathisma_number:
      kathismaNumber,

    kathisma_title:
      kathismaTitle ||
      '',

    psalm_id:
      psalmId,

    psalm_number:
      psalmNumber,

    verse_number:
      verse.number,
  };


  return (
    <View
      style={[
        styles.row,

        hasSavedFragment &&
          styles.rowSaved,
      ]}
      nativeID={
        `verse-${verse.id}`
      }
      onLayout={
        onLayout
      }
    >
      <View
        style={
          styles.column
        }
      >
        <SelectableSaveText
          text={
            verse
              .church_slavonic ||
            ''
          }
          textStyle={
            styles.text
          }
          prefix={
            `${verse.number} `
          }
          prefixStyle={
            styles.number
          }
          sourceType="psalter"
          sourceId={
            psalterId
          }
          anchorType="psalm_verse"
          anchorId={
            verse.id
          }
          sourceTitle="Псалтирь"
          itemTitle={
            `Псалом ${psalmNumber}, стих ${verse.number}`
          }
          metadata={{
            ...commonMetadata,
            language:
              'church',
          }}
          fullSaveType="verse"
          fullSaveLabel="Стих"
          onSaved={
            onFragmentSaved
          }
        />
      </View>

      <View
        style={
          styles.separator
        }
      />

      <View
        style={
          styles.column
        }
      >
        <SelectableSaveText
          text={
            verse.russian ||
            ''
          }
          textStyle={
            styles.text
          }
          prefix={
            `${verse.number} `
          }
          prefixStyle={
            styles.number
          }
          sourceType="psalter"
          sourceId={
            psalterId
          }
          anchorType="psalm_verse"
          anchorId={
            verse.id
          }
          sourceTitle="Псалтирь"
          itemTitle={
            `Псалом ${psalmNumber}, стих ${verse.number}`
          }
          metadata={{
            ...commonMetadata,
            language:
              'russian',
          }}
          fullSaveType="verse"
          fullSaveLabel="Стих"
          onSaved={
            onFragmentSaved
          }
        />
      </View>
    </View>
  );
}


const styles =
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      paddingVertical: 8,
      borderRadius:
        radius.sm,
      borderLeftWidth: 3,
      borderLeftColor:
        'transparent',
    },

    rowSaved: {
      backgroundColor:
        'rgba(138, 90, 56, 0.045)',
      borderLeftColor:
        'rgba(138, 90, 56, 0.24)',
    },

    column: {
      flex: 1,
      paddingHorizontal: 10,
    },

    separator: {
      width:
        StyleSheet
          .hairlineWidth,

      backgroundColor:
        colors.borderStrong,
    },

    text: {
      fontSize: 17,
      lineHeight: 26,
      color:
        colors.text,
    },

    number: {
      fontSize: 12,
      fontWeight: '700',
      color:
        colors.textMuted,
    },
  });
