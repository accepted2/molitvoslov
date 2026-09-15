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

import { api } from '../api';

import {
  getReadingProgress,
  saveReadingProgress,
} from '../services/readingProgress';

import PsalmBlock
  from '../components/reader/PsalmBlock';


export default function KathismaScreen({
                                         route,
                                         navigation,
                                       }) {
  const {
    kathismaNumber,
    kathismaTitle,
  } = route.params;


  const [kathisma, setKathisma] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);


  const scrollRef = useRef(null);


  /*
   * Здесь будут храниться координаты
   * всех стихов текущей кафизмы.
   *
   * Например:
   *
   * {
   *   1532: {
   *       verseId: 1532,
   *       psalmNumber: 118,
   *       verseNumber: 73,
   *       y: 4850
   *   }
   * }
   */
  const versePositionsRef =
    useRef({});


  /*
   * ID стиха, сохранённого в БД.
   */
  const savedAnchorIdRef =
    useRef(null);


  /*
   * Чтобы восстановление позиции
   * произошло только один раз.
   */
  const restoredRef =
    useRef(false);


  /*
   * Текущий стих во время прокрутки.
   */
  const currentVerseRef =
    useRef(null);


  /*
   * Таймер для отложенного сохранения.
   */
  const saveTimerRef =
    useRef(null);


  /*
   * Последняя позиция, которую
   * необходимо записать.
   */
  const pendingProgressRef =
    useRef(null);


  /*
   * Не сохраняем позицию обратно
   * в момент автоматической прокрутки.
   */
  const restoringRef =
    useRef(false);


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

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(
          saveTimerRef.current
        );
      }

      /*
       * Если пользователь вышел
       * до срабатывания debounce,
       * всё равно сохраняем последнее
       * место.
       */
      if (
        pendingProgressRef.current
      ) {
        persistProgress(
          pendingProgressRef.current
        );
      }
    };
  }, [kathismaNumber]);


  const loadScreen = async () => {
    try {
      setLoading(true);
      setError(null);

      versePositionsRef.current = {};
      savedAnchorIdRef.current = null;
      currentVerseRef.current = null;
      restoredRef.current = false;


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
        const progressList =
          await getReadingProgress();


        const progress =
          progressList.find(
            item =>
              item.source_type ===
              'psalter' &&
              Number(
                item.source_id
              ) ===
              Number(
                kathismaData
                  .psalter
              )
          );


        if (
          progress &&
          progress.anchor_type ===
          'psalm_verse'
        ) {
          savedAnchorIdRef.current =
            progress.anchor_id;

          tryRestorePosition();
        }

      } catch (progressError) {
        /*
         * Ошибка прогресса не должна
         * мешать чтению Псалтири.
         */
        console.log(
          'Ошибка загрузки позиции чтения:',
          progressError.response
            ?.status,
          progressError.response
            ?.data,
          progressError.message
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
      setLoading(false);
    }
  };


  const handleVerseLayout = (
    position
  ) => {
    versePositionsRef.current[
      position.verseId
      ] = position;

    /*
     * Возможно именно этот стих
     * является сохранённым.
     *
     * Поэтому после каждого layout
     * проверяем, можем ли восстановить
     * позицию.
     */
    tryRestorePosition();
  };


  const tryRestorePosition = () => {
    if (restoredRef.current) {
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

    /*
     * Если сохранённый стих находится
     * в другой кафизме, здесь position
     * просто не будет.
     */
    if (!position) {
      return;
    }


    if (!scrollRef.current) {
      return;
    }


    restoredRef.current = true;
    restoringRef.current = true;


    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(
          position.y - 30,
          0
        ),
        animated: false,
      });


      setTimeout(() => {
        restoringRef.current =
          false;
      }, 300);
    });
  };


  const getCurrentVerse = (
    scrollY
  ) => {
    const positions =
      Object.values(
        versePositionsRef.current
      );


    if (positions.length === 0) {
      return null;
    }


    positions.sort(
      (a, b) => a.y - b.y
    );


    /*
     * Смотрим не прямо на верхнюю
     * границу экрана, а немного ниже.
     */
    const readingLine =
      scrollY + 70;


    let current =
      positions[0];


    for (const position of positions) {
      if (
        position.y <=
        readingLine
      ) {
        current = position;
      } else {
        break;
      }
    }


    return current;
  };


  const handleScroll = event => {
    if (restoringRef.current) {
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


    /*
     * Если пользователь всё ещё
     * находится на том же стихе,
     * новый запрос не нужен.
     */
    if (
      currentVerseRef.current
        ?.verseId ===
      current.verseId
    ) {
      return;
    }


    currentVerseRef.current =
      current;


    scheduleProgressSave(
      current
    );
  };


  const scheduleProgressSave = (
    position
  ) => {
    if (!kathisma) {
      return;
    }


    const progress = {
      sourceType: 'psalter',
      sourceId: kathisma.psalter,

      anchorType:
        'psalm_verse',

      anchorId:
      position.verseId,

      offset: 0,
    };


    pendingProgressRef.current =
      progress;


    if (saveTimerRef.current) {
      clearTimeout(
        saveTimerRef.current
      );
    }


    /*
     * Не отправляем запрос после
     * каждого движения пальцем.
     *
     * Сохраняем через 800 мс после
     * изменения текущего стиха.
     */
    saveTimerRef.current =
      setTimeout(() => {
        persistProgress(
          progress
        );
      }, 800);
  };


  const persistProgress = async (
    progress
  ) => {
    if (!progress) {
      return;
    }


    try {
      await saveReadingProgress(
        progress
      );


      /*
       * Если сохранена именно
       * последняя ожидающая позиция,
       * очищаем её.
       */
      if (
        pendingProgressRef.current
          ?.anchorId ===
        progress.anchorId
      ) {
        pendingProgressRef.current =
          null;
      }

    } catch (err) {
      console.log(
        'Ошибка сохранения позиции чтения:',
        err.response?.status,
        err.response?.data,
        err.message
      );
    }
  };


  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
        />
      </View>
    );
  }


  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>
          {error}
        </Text>
      </View>
    );
  }


  return (
    <ScrollView
      ref={scrollRef}

      style={styles.container}

      contentContainerStyle={
        styles.content
      }

      onScroll={handleScroll}

      scrollEventThrottle={200}
    >

      <View
        style={
          styles.languageHeader
        }
      >

        <Text
          style={styles.language}
        >
          Церковнославянский
        </Text>


        <View
          style={
            styles.languageSeparator
          }
        />


        <Text
          style={styles.language}
        >
          Русский
        </Text>

      </View>


      {kathisma.psalms.map(
        psalm => (
          <PsalmBlock
            key={psalm.id}

            psalm={psalm}

            glories={
              kathisma.glories ||
              []
            }

            onVerseLayout={
              handleVerseLayout
            }
          />
        )
      )}


      {!!kathisma.prayers_after && (
        <View
          style={
            styles.prayersAfter
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


          <Text
            selectable

            style={
              styles
                .prayersAfterText
            }
          >
            {
              kathisma
                .prayers_after
            }
          </Text>

        </View>
      )}

    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F4EE',
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
    StyleSheet.hairlineWidth,

    borderBottomColor:
      'rgba(0, 0, 0, 0.15)',
  },

  language: {
    flex: 1,

    textAlign: 'center',

    fontSize: 13,
    fontWeight: '600',

    opacity: 0.55,
  },

  languageSeparator: {
    width:
    StyleSheet.hairlineWidth,

    backgroundColor:
      'rgba(0, 0, 0, 0.15)',
  },

  center: {
    flex: 1,

    justifyContent: 'center',
    alignItems: 'center',
  },

  error: {
    fontSize: 16,
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
  },

  prayersAfterText: {
    fontSize: 17,
    lineHeight: 26,
  },
});