import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import VerseRow
  from './VerseRow';

import GloryDivider
  from './GloryDivider';

import {
  colors,
  radius,
} from '../../theme';


export default function PsalmBlock({
  psalm,
  glories = [],
  onVerseLayout,
  isSaved = false,
  onToggleSaved,
}) {
  const [
    blockY,
    setBlockY,
  ] = useState(null);

  const [
    versesY,
    setVersesY,
  ] = useState(null);

  const verseLocalPositions =
    useRef({});


  if (!psalm) {
    return null;
  }


  const verses =
    (
      psalm.verses ||
      []
    ).filter(
      Boolean
    );


  const verseGlories =
    glories.filter(
      glory =>
        glory.after_verse &&
        verses.some(
          verse =>
            verse.id ===
            glory.after_verse
        )
    );


  const psalmGlory =
    glories.find(
      glory =>
        glory.after_psalm ===
        psalm.id
    );


  const reportVersePosition =
    (
      verse,
      localY
    ) => {
      if (
        blockY === null ||
        versesY === null
      ) {
        return;
      }

      onVerseLayout?.({
        verseId:
          verse.id,

        verseNumber:
          verse.number,

        psalmId:
          psalm.id,

        psalmNumber:
          psalm.number,

        y:
          blockY +
          versesY +
          localY,
      });
    };


  useEffect(() => {
    if (
      blockY === null ||
      versesY === null
    ) {
      return;
    }

    verses.forEach(
      verse => {
        const localY =
          verseLocalPositions
            .current[
            verse.id
          ];

        if (
          localY !==
          undefined
        ) {
          reportVersePosition(
            verse,
            localY
          );
        }
      }
    );
  }, [
    blockY,
    versesY,
  ]);


  return (
    <View
      style={[
        styles.container,

        isSaved &&
          styles.containerSaved,
      ]}
      onLayout={
        event => {
          setBlockY(
            event.nativeEvent
              .layout.y
          );
        }
      }
    >
      <View
        style={
          styles.header
        }
      >
        <Text
          style={
            styles.psalmNumber
          }
        >
          Псалом{' '}
          {psalm.number}
        </Text>

        <Pressable
          onPress={
            onToggleSaved
          }
          style={({pressed}) => [
            styles.saveButton,

            isSaved &&
              styles
                .saveButtonActive,

            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={[
              styles
                .saveButtonText,

              isSaved &&
                styles
                  .saveButtonTextActive,
            ]}
          >
            {
              isSaved
                ? 'Сохранено'
                : 'Сохранить'
            }
          </Text>
        </Pressable>
      </View>


      {(
        psalm
          .title_church_slavonic ||
        psalm
          .title_russian
      ) && (
        <View
          style={styles.titles}
        >
          <View
            style={
              styles.titleColumn
            }
          >
            {!!psalm
              .title_church_slavonic && (
              <Text
                style={
                  styles.title
                }
              >
                {
                  psalm
                    .title_church_slavonic
                }
              </Text>
            )}
          </View>

          <View
            style={
              styles
                .titleSeparator
            }
          />

          <View
            style={
              styles.titleColumn
            }
          >
            {!!psalm
              .title_russian && (
              <Text
                style={
                  styles.title
                }
              >
                {
                  psalm
                    .title_russian
                }
              </Text>
            )}
          </View>
        </View>
      )}


      <View
        style={styles.verses}
        onLayout={
          event => {
            setVersesY(
              event.nativeEvent
                .layout.y
            );
          }
        }
      >
        {verses.map(
          verse => {
            const gloryAfterVerse =
              verseGlories.find(
                glory =>
                  glory
                    .after_verse ===
                  verse.id
              );

            return (
              <React.Fragment
                key={verse.id}
              >
                <VerseRow
                  verse={verse}
                  psalmId={
                    psalm.id
                  }
                  onLayout={
                    event => {
                      const localY =
                        event
                          .nativeEvent
                          .layout
                          .y;

                      verseLocalPositions
                        .current[
                        verse.id
                      ] =
                        localY;

                      reportVersePosition(
                        verse,
                        localY
                      );
                    }
                  }
                />

                {
                  gloryAfterVerse &&
                  (
                    <GloryDivider
                      number={
                        gloryAfterVerse
                          .number
                      }
                    />
                  )
                }
              </React.Fragment>
            );
          }
        )}
      </View>


      {psalmGlory && (
        <GloryDivider
          number={
            psalmGlory.number
          }
        />
      )}
    </View>
  );
}


const styles =
  StyleSheet.create({
    container: {
      marginBottom: 36,
      paddingTop: 8,
      borderRadius:
        radius.md,
      borderWidth: 1,
      borderColor:
        'transparent',
    },

    containerSaved: {
      backgroundColor:
        'rgba(138, 90, 56, 0.045)',
      borderColor:
        'rgba(138, 90, 56, 0.20)',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'center',
      minHeight: 36,
      marginBottom: 12,
      paddingHorizontal: 10,
    },

    psalmNumber: {
      flex: 1,
      paddingLeft: 72,
      textAlign: 'center',
      fontSize: 21,
      fontWeight: '700',
      color:
        colors.text,
    },

    saveButton: {
      minWidth: 72,
      minHeight: 30,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius:
        radius.sm,
      borderWidth: 1,
      borderColor:
        colors.border,
      backgroundColor:
        colors.surface,
    },

    saveButtonActive: {
      backgroundColor:
        colors.surfaceWarm,
      borderColor:
        colors.borderStrong,
    },

    saveButtonText: {
      fontSize: 10,
      fontWeight: '700',
      color:
        colors.textMuted,
    },

    saveButtonTextActive: {
      color:
        colors.accentDark,
    },

    pressed: {
      opacity: 0.6,
    },

    titles: {
      flexDirection: 'row',
      marginBottom: 12,
    },

    titleColumn: {
      flex: 1,
      paddingHorizontal: 10,
    },

    titleSeparator: {
      width:
        StyleSheet
          .hairlineWidth,

      backgroundColor:
        'rgba(0, 0, 0, 0.15)',
    },

    title: {
      fontSize: 15,
      lineHeight: 21,
      fontStyle: 'italic',
      opacity: 0.7,
    },

    verses: {
      gap: 2,
    },
  });
