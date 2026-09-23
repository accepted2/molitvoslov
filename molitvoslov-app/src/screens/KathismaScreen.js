import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  api,
} from '../api';

import {
  useReadingProgress,
} from '../hooks/useReadingProgress';


import {
  deleteSavedItem,
  getSavedItems,
  saveItem,
} from '../services/savedItems';

import PsalmBlock
  from '../components/reader/PsalmBlock';

import SelectableSaveText
  from '../components/reader/SelectableSaveText';

import {
  colors,
} from '../theme';


export default function KathismaScreen({
  route,
  navigation,
}) {
  const {
    kathismaNumber,
    kathismaTitle,
  } = route.params;


  const [
    kathisma,
    setKathisma,
  ] = useState(null);

  const [
    savedItems,
    setSavedItems,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState(null);

  const scrollRef =
    useRef(null);

  const versePositionsRef =
    useRef({});

  const savedAnchorIdRef =
    useRef(null);

  const restoredRef =
    useRef(false);

  const currentVerseRef =
    useRef(null);

  const restoringRef =
    useRef(false);

  const {
    savedProgress,
    scheduleSave,
  } = useReadingProgress({
    sourceType:
      'psalter',

    sourceId:
      kathisma?.psalter,
  });


  useLayoutEffect(() => {
    navigation.setOptions({
      title:
        kathismaTitle ||
        `Кафизма ${kathismaNumber}`,
    });
  }, [
    navigation,
    kathismaNumber,
    kathismaTitle,
  ]);


  useEffect(() => {
    loadScreen();
  }, [
    kathismaNumber,
  ]);


  useEffect(() => {
    if (
      savedProgress
        ?.anchor_type ===
      'psalm_verse'
    ) {
      savedAnchorIdRef.current =
        savedProgress
          .anchor_id;

      tryRestorePosition();
    }
  }, [
    savedProgress,
  ]);


  const loadScreen =
    async () => {
      try {
        setLoading(true);

        setError(null);

        versePositionsRef.current =
          {};

        savedAnchorIdRef.current =
          null;

        currentVerseRef.current =
          null;

        restoredRef.current =
          false;

        restoringRef.current =
          false;

        const kathismaResponse =
          await api.get(
            `kathismas/${kathismaNumber}/`
          );

        const kathismaData =
          kathismaResponse.data;

        setKathisma(
          kathismaData
        );

        try {
          const saved =
            await getSavedItems({
              source_type:
                'psalter',

              source_id:
                kathismaData
                  .psalter,
            });

          setSavedItems(
            saved
          );
        } catch (savedError) {
          console.log(
            'Ошибка загрузки сохранённых псалмов:',
            savedError
          );
        }
      } catch (err) {
        console.log(
          'Ошибка загрузки кафизмы:',
          err
        );

        setError(
          'Не удалось загрузить кафизму'
        );
      } finally {
        setLoading(
          false
        );
      }
    };


  const handleFragmentSaved =
    savedItem => {
      setSavedItems(
        current => {
          if (
            current.some(
              item =>
                item.id ===
                savedItem.id
            )
          ) {
            return current;
          }

          return [
            savedItem,
            ...current,
          ];
        }
      );
    };


  const getSavedPsalm =
    psalmId =>
      savedItems.find(
        item =>
          item.anchor_type ===
            'psalm' &&
          Number(
            item.anchor_id
          ) ===
            Number(
              psalmId
            )
      );


  const togglePsalmSaved =
    async psalm => {
      const existing =
        getSavedPsalm(
          psalm.id
        );

      try {
        if (existing) {
          await deleteSavedItem(
            existing.id
          );

          setSavedItems(
            current =>
              current.filter(
                item =>
                  item.id !==
                  existing.id
              )
          );

          return;
        }

        const saved =
          await saveItem({
            save_type:
              'psalm',

            source_type:
              'psalter',

            source_id:
              kathisma.psalter,

            anchor_type:
              'psalm',

            anchor_id:
              psalm.id,

            source_title:
              'Псалтирь',

            item_title:
              `Псалом ${psalm.number}`,

            text: '',

            metadata: {
              kathisma_number:
                kathisma.number,

              kathisma_title:
                kathisma.title ||
                '',

              psalm_number:
                psalm.number,
            },
          });

        setSavedItems(
          current => [
            saved,
            ...current,
          ]
        );
      } catch (err) {
        console.log(
          'Ошибка сохранения псалма:',
          err.response?.data ||
          err.message
        );
      }
    };


  const handleVerseLayout =
    position => {
      versePositionsRef.current[
        position.verseId
      ] =
        position;

      tryRestorePosition();
    };


  const tryRestorePosition =
    () => {
      if (
        restoredRef.current
      ) {
        return;
      }

      const anchorId =
        savedAnchorIdRef.current;

      if (!anchorId) {
        return;
      }

      const position =
        versePositionsRef.current[
          anchorId
        ];

      if (!position) {
        return;
      }

      if (
        !scrollRef.current
      ) {
        return;
      }

      restoredRef.current =
        true;

      restoringRef.current =
        true;

      requestAnimationFrame(
        () => {
          scrollRef.current
            ?.scrollTo({
              y:
                Math.max(
                  position.y - 30,
                  0
                ),

              animated:
                false,
            });

          setTimeout(() => {
            restoringRef.current =
              false;
          }, 300);
        }
      );
    };


  const getCurrentVerse =
    scrollY => {
      const positions =
        Object.values(
          versePositionsRef.current
        );

      if (
        positions.length ===
        0
      ) {
        return null;
      }

      positions.sort(
        (a, b) =>
          a.y - b.y
      );

      const readingLine =
        scrollY + 70;

      let current =
        positions[0];

      for (
        const position
        of positions
      ) {
        if (
          position.y <=
          readingLine
        ) {
          current =
            position;
        } else {
          break;
        }
      }

      return current;
    };


  const handleScroll =
    event => {
      if (
        restoringRef.current
      ) {
        return;
      }

      const scrollY =
        event.nativeEvent
          .contentOffset.y;

      const current =
        getCurrentVerse(
          scrollY
        );

      if (!current) {
        return;
      }

      if (
        currentVerseRef.current
          ?.verseId ===
        current.verseId
      ) {
        return;
      }

      currentVerseRef.current =
        current;

      scheduleSave({
        anchorType:
          'psalm_verse',

        anchorId:
          current.verseId,

        offset: 0,
      });
    };


  if (loading) {
    return (
      <View
        style={styles.center}
      >
        <ActivityIndicator
          size="large"
          color={
            colors.accent
          }
        />
      </View>
    );
  }


  if (error) {
    return (
      <View
        style={styles.center}
      >
        <Text
          style={styles.error}
        >
          {error}
        </Text>
      </View>
    );
  }


  return (
    <ScrollView
      ref={scrollRef}
      style={
        styles.container
      }
      contentContainerStyle={
        styles.content
      }
      onScroll={
        handleScroll
      }
      scrollEventThrottle={
        200
      }
    >
      <View
        style={
          styles
            .languageHeader
        }
      >
        <Text
          style={styles.language}
        >
          Церковнославянский
        </Text>

        <View
          style={
            styles
              .languageSeparator
          }
        />

        <Text
          style={styles.language}
        >
          Русский
        </Text>
      </View>


      {kathisma.psalms.map(
        psalm => {
          const saved =
            !!getSavedPsalm(
              psalm.id
            );

          return (
            <PsalmBlock
              key={
                psalm.id
              }
              psalm={
                psalm
              }
              glories={
                kathisma.glories ||
                []
              }
              onVerseLayout={
                handleVerseLayout
              }
              isSaved={
                saved
              }
              onToggleSaved={() =>
                togglePsalmSaved(
                  psalm
                )
              }
              psalterId={
                kathisma.psalter
              }
              kathismaNumber={
                kathisma.number
              }
              kathismaTitle={
                kathisma.title
              }
              savedItems={
                savedItems
              }
              onFragmentSaved={
                handleFragmentSaved
              }
            />
          );
        }
      )}


      {!!kathisma
        .prayers_after && (
        <View
          style={
            styles
              .prayersAfter
          }
        >
          <Text
            style={
              styles
                .prayersAfterTitle
            }
          >
            Молитвы после кафизмы
          </Text>

          <SelectableSaveText
            text={
              kathisma
                .prayers_after
            }
            textStyle={
              styles
                .prayersAfterText
            }
            sourceType="psalter"
            sourceId={
              kathisma.psalter
            }
            anchorType="kathisma_prayers_after"
            anchorId={
              kathisma.id
            }
            sourceTitle="Псалтирь"
            itemTitle={
              `Молитвы после кафизмы ${kathisma.number}`
            }
            metadata={{
              kathisma_number:
                kathisma.number,

              kathisma_title:
                kathisma.title ||
                '',

              section:
                'prayers_after',
            }}
            fullSaveType="prayer"
            fullSaveLabel="Молитва"
            onSaved={
              handleFragmentSaved
            }
          />
        </View>
      )}
    </ScrollView>
  );
}


const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        colors.background,
    },

    content: {
      paddingVertical: 16,
      paddingHorizontal: 6,
    },

    languageHeader: {
      flexDirection: 'row',
      marginBottom: 24,
      paddingBottom: 10,
      borderBottomWidth:
        StyleSheet
          .hairlineWidth,
      borderBottomColor:
        colors.borderStrong,
    },

    language: {
      flex: 1,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '600',
      color:
        colors.textSecondary,
    },

    languageSeparator: {
      width:
        StyleSheet
          .hairlineWidth,
      backgroundColor:
        colors.borderStrong,
    },

    center: {
      flex: 1,
      justifyContent:
        'center',
      alignItems:
        'center',
      backgroundColor:
        colors.background,
    },

    error: {
      fontSize: 16,
      color:
        colors.liturgical,
    },

    prayersAfter: {
      paddingHorizontal: 12,
      paddingBottom: 50,
    },

    prayersAfterTitle: {
      marginBottom: 14,
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '700',
      color:
        colors.text,
    },

    prayersAfterText: {
      fontSize: 17,
      lineHeight: 26,
      color:
        colors.text,
    },
  });
