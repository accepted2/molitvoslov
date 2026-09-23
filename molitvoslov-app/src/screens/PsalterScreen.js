import React, {
  useCallback,
  useEffect,
  useState,
  useRef,
} from 'react';

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useFocusEffect
} from '@react-navigation/native';

import { api } from '../api';

import {
  useReadingProgress
} from '../hooks/useReadingProgress';

import ExpandablePrayerBlock
  from '../components/reader/ExpandablePrayerBlock';


export default function PsalterScreen({navigation}) {
  const [psalter, setPsalter] = useState(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const {
    savedProgress,
    reloadProgress,
  } = useReadingProgress({
    sourceType: 'psalter',
    sourceId: psalter?.id,
  });

  const listRef = useRef(null)

  useEffect(() => {
    loadPsalter();
  }, []);


  useFocusEffect(
    useCallback(() => {
      if (psalter?.id) {
        reloadProgress();
      }
    }, [
      psalter?.id,
      reloadProgress,
    ])
  );


  const loadPsalter = async () => {
    try {
      setLoading(true);
      setError(null);

      const response =
        await api.get(
          'psalters/psaltir/'
        );

      setPsalter(
        response.data
      );

    } catch (err) {
      console.log(
        'Ошибка загрузки Псалтири:',
        err
      );
      setError(
        'Не удалось загрузить Псалтирь'
      );
    } finally {
      setLoading(false);
    }
  };

  const openKathisma = kathisma => {
    navigation.navigate(
      'Kathisma',
      {
        kathismaNumber:
        kathisma.number,

        kathismaTitle:
          kathisma.title ||
          `Кафизма ${kathisma.number}`,
      }
    );
  };

  const progressInfo = savedProgress?.anchor_info;

  const currentKathismaNumber = progressInfo?.kathisma_number;

  const currentKathisma =
    psalter?.kathismas?.find(
      kathisma =>
        Number(kathisma.number) ===
        Number(
          currentKathismaNumber
        )
    );


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

  const handlePrayersCollapse = ()=>{
    requestAnimationFrame(()=>{
      listRef.current?.scrollToOffset({
        offset:0,
        animated:true,
      })
    })
  }

  return (
    <View style={styles.container}>

      <FlatList
        ref={listRef}
        data={psalter?.kathismas || [] }

        keyExtractor={item =>
          String(item.id)
        }

        contentContainerStyle={
          styles.listContent
        }

        ListHeaderComponent={
          <View style={styles.header}>

            <ExpandablePrayerBlock
              title="Молитвы перед чтением Псалтири"
              text={psalter?.prayers_before}
              onCollapse={handlePrayersCollapse}
            />


            {currentKathisma &&
              progressInfo && (

                <Pressable
                  style={({ pressed }) => [
                    styles.continueCard,

                    pressed &&
                    styles.continuePressed,
                  ]}

                  onPress={() =>
                    openKathisma(
                      currentKathisma
                    )
                  }
                >

                  <Text
                    style={
                      styles.continueLabel
                    }
                  >
                    Продолжить чтение
                  </Text>


                  <Text
                    style={
                      styles.continueTitle
                    }
                  >
                    Кафизма{' '}
                    {
                      progressInfo
                        .kathisma_number
                    }
                  </Text>


                  <View
                    style={
                      styles
                        .continueBottom
                    }
                  >
                    <Text
                      style={
                        styles
                          .continuePosition
                      }
                    >
                      Псалом{' '}
                      {
                        progressInfo
                          .psalm_number
                      }
                      {' · '}
                      стих{' '}
                      {
                        progressInfo
                          .verse_number
                      }
                    </Text>

                    <Text
                      style={styles.continueArrow}
                    >
                      ›
                    </Text>
                  </View>

                </Pressable>
              )}

          </View>
        }


        renderItem={({ item }) => {
          const isCurrent =
            Number(item.number) ===
            Number(
              currentKathismaNumber
            );


          return (
            <Pressable
              style={({ pressed }) => [
                styles.kathisma,
                isCurrent &&
                styles.kathismaCurrent,
                pressed &&
                styles.kathismaPressed,
              ]}

              onPress={() =>
                openKathisma(item)
              }
            >

              <View
                style={styles.kathismaRow}
              >

                <View
                  style={styles.kathismaInfo}
                >
                  <Text
                    style={styles.kathismaNumber}
                  >
                    Кафизма {item.number}
                  </Text>


                  <Text
                    style={
                      styles.psalmRange
                    }
                  >
                    {
                      item.first_psalm ===
                      item.last_psalm

                        ? `Псалом ${item.first_psalm}`

                        : `Псалмы ${item.first_psalm}–${item.last_psalm}`
                    }
                  </Text>

                  {isCurrent &&
                    progressInfo && (

                      <Text
                        style={
                          styles
                            .currentPosition
                        }
                      >
                        Здесь остановились ·
                        Псалом{' '}
                        {
                          progressInfo
                            .psalm_number
                        }
                        , стих{' '}
                        {
                          progressInfo
                            .verse_number
                        }
                      </Text>

                    )}

                </View>

                <Text
                  style={
                    styles.kathismaArrow
                  }
                >
                  ›
                </Text>

              </View>

              {!!item.title && (
                <Text
                  style={
                    styles.kathismaTitle
                  }
                >
                  {item.title}
                </Text>
              )}

            </Pressable>
          );
        }}
      />

    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: '#F7F4EE',
  },


  listContent: {
    padding: 16,
    paddingBottom: 40,

    gap: 12,
  },


  /*
   * Верхняя часть:
   * молитвы + продолжить чтение
   */
  header: {
    gap: 14,
    marginBottom: 4,
  },


  /*
   * Продолжить чтение
   */
  continueCard: {
    paddingVertical: 17,
    paddingHorizontal: 18,

    borderRadius: 14,

    backgroundColor: '#EEE6D7',

    borderWidth: 1,
    borderColor:
      'rgba(130, 95, 45, 0.20)',
  },


  continuePressed: {
    opacity: 0.72,
  },


  continueLabel: {
    marginBottom: 7,

    fontSize: 12,
    fontWeight: '700',

    textTransform: 'uppercase',

    letterSpacing: 0.8,

    color: '#806A4E',
  },


  continueTitle: {
    fontSize: 21,
    fontWeight: '700',

    color: '#322D27',
  },


  continueBottom: {
    flexDirection: 'row',
    alignItems: 'center',

    marginTop: 5,
  },


  continuePosition: {
    flex: 1,

    fontSize: 15,

    color: '#6F665C',
  },


  continueArrow: {
    fontSize: 28,

    color: '#806A4E',
  },


  /*
   * Кафизмы
   */
  kathisma: {
    paddingVertical: 16,
    paddingHorizontal: 17,

    backgroundColor: '#FFFFFF',

    borderRadius: 12,

    borderWidth: 1,
    borderColor: 'transparent',
  },


  kathismaCurrent: {
    backgroundColor: '#FAF4E8',

    borderColor:
      'rgba(130, 95, 45, 0.30)',
  },


  kathismaPressed: {
    opacity: 0.7,
  },


  kathismaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },


  kathismaInfo: {
    flex: 1,
  },


  kathismaNumber: {
    fontSize: 18,
    fontWeight: '600',

    color: '#302C27',
  },


  psalmRange: {
    marginTop: 4,

    fontSize: 14,

    color: '#777169',
  },


  kathismaArrow: {
    marginLeft: 12,

    fontSize: 28,

    color: '#9A8A77',
  },


  kathismaTitle: {
    marginTop: 6,

    fontSize: 14,

    color: '#777169',
  },


  currentPosition: {
    marginTop: 7,

    fontSize: 13,
    fontWeight: '600',

    color: '#8A6C45',
  },


  center: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',
  },


  error: {
    fontSize: 16,
  },
});