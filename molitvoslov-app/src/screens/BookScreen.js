import React, {
  useEffect,
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
  getSavedItems,
} from '../services/savedItems';

import SelectableSaveText
  from '../components/reader/SelectableSaveText';

import {
  colors,
  radius,
} from '../theme';


export const BookScreen = ({
  route,
}) => {
  const {
    categoryId,
    categorySlug,
    categoryName,
  } = route.params;

  const [
    texts,
    setTexts,
  ] = useState([]);

  const [
    savedItems,
    setSavedItems,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const scrollRef =
    useRef(null);

  const itemPositionsRef =
    useRef({});

  const savedAnchorIdRef =
    useRef(null);

  const restoredRef =
    useRef(false);

  const currentItemRef =
    useRef(null);

  const restoringRef =
    useRef(false);

  const {
    savedProgress,
    scheduleSave,
  } = useReadingProgress({
    sourceType:
      'category',

    sourceId:
      categoryId,
  });


  useEffect(() => {
    if (
      savedProgress
        ?.anchor_type ===
      'category_text'
    ) {
      savedAnchorIdRef.current =
        savedProgress
          .anchor_id;

      tryRestorePosition();
    }
  }, [
    savedProgress,
  ]);


  useEffect(() => {
    itemPositionsRef.current =
      {};

    savedAnchorIdRef.current =
      null;

    restoredRef.current =
      false;

    currentItemRef.current =
      null;

    restoringRef.current =
      false;

    setSavedItems([]);

    loadScreen();
  }, [
    categorySlug,
  ]);


  const loadScreen =
    async () => {
      try {
        setLoading(true);

        const [
          textsResponse,
          saved,
        ] = await Promise.all([
          api.get(
            `categories/${categorySlug}/texts/`
          ),

          getSavedItems({
            source_type:
              'category',

            source_id:
              categoryId,
          }),
        ]);

        const sorted =
          [...textsResponse.data]
            .sort(
              (a, b) =>
                Number(
                  a.order || 0
                ) -
                Number(
                  b.order || 0
                )
            );

        setTexts(
          sorted
        );

        setSavedItems(
          saved
        );
      } catch (error) {
        console.error(
          'Ошибка загрузки текстов:',
          error
        );
      } finally {
        setLoading(
          false
        );
      }
    };


  const handleSavedItem =
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


  const isTextSaved =
    itemId =>
      savedItems.some(
        item =>
          item.anchor_type ===
            'category_text' &&
          Number(
            item.anchor_id
          ) ===
            Number(
              itemId
            )
      );


  const handleItemLayout = (
    itemId,
    event
  ) => {
    itemPositionsRef.current[
      itemId
    ] =
      event.nativeEvent
        .layout.y;

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

      const y =
        itemPositionsRef.current[
          anchorId
        ];

      if (
        y === undefined ||
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
                  y - 30,
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


  const getCurrentItem =
    scrollY => {
      const positions =
        Object.entries(
          itemPositionsRef
            .current
        )
          .map(
            ([id, y]) => ({
              id:
                Number(id),

              y,
            })
          )
          .sort(
            (a, b) =>
              a.y - b.y
          );

      if (
        !positions.length
      ) {
        return null;
      }

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
        getCurrentItem(
          scrollY
        );

      if (!current) {
        return;
      }

      if (
        currentItemRef.current ===
        current.id
      ) {
        return;
      }

      currentItemRef.current =
        current.id;

      scheduleSave({
        anchorType:
          'category_text',

        anchorId:
          current.id,

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

        <Text
          style={
            styles.loadingText
          }
        >
          Загрузка...
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
        styles.contentContainer
      }
      onScroll={
        handleScroll
      }
      scrollEventThrottle={
        200
      }
    >
      <Text
        style={
          styles.headerTitle
        }
      >
        {categoryName}
      </Text>

      {texts.map(
        (
          item,
          index
        ) => {
          const text =
            item.text;

          const saved =
            isTextSaved(
              item.id
            );

          return (
            <View
              key={item.id}
              onLayout={
                event =>
                  handleItemLayout(
                    item.id,
                    event
                  )
              }
              style={[
                styles.block,

                saved &&
                  styles.blockSaved,
              ]}
            >
              <Text
                style={styles.title}
              >
                {
                  text.title ||
                  'Молитва'
                }
              </Text>

              {text
                .description_position ===
                  'before' &&
                !!text.description && (
                  <Text
                    style={
                      styles.description
                    }
                  >
                    {
                      text.description
                    }
                  </Text>
                )}

              <SelectableSaveText
                text={
                  text.content
                }
                textStyle={
                  styles.content
                }
                sourceType="category"
                sourceId={
                  categoryId
                }
                anchorType="category_text"
                anchorId={
                  item.id
                }
                sourceTitle={
                  categoryName
                }
                itemTitle={
                  text.title ||
                  text.description ||
                  'Молитва'
                }
                metadata={{
                  category_slug:
                    categorySlug,

                  category_name:
                    categoryName,
                }}
                onSaved={
                  handleSavedItem
                }
              />

              {text
                .description_position ===
                  'after' &&
                !!text.description && (
                  <Text
                    style={
                      styles.description
                    }
                  >
                    {
                      text.description
                    }
                  </Text>
                )}

              {index <
                texts.length -
                  1 && (
                <View
                  style={
                    styles.divider
                  }
                />
              )}
            </View>
          );
        }
      )}
    </ScrollView>
  );
};


const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        colors.background,
    },

    contentContainer: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 60,
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

    loadingText: {
      marginTop: 10,
      color:
        colors.textSecondary,
    },

    headerTitle: {
      fontSize: 24,
      fontWeight: '700',
      color:
        colors.text,
      textAlign: 'center',
      marginBottom: 20,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor:
        colors.border,
      fontFamily: 'serif',
    },

    block: {
      marginBottom: 20,
      paddingHorizontal: 6,
      borderRadius:
        radius.md,
      borderLeftWidth: 3,
      borderLeftColor:
        'transparent',
    },

    blockSaved: {
      backgroundColor:
        'rgba(138, 90, 56, 0.055)',
      borderLeftColor:
        'rgba(138, 90, 56, 0.28)',
    },

    title: {
      fontSize: 18,
      fontWeight: '700',
      color:
        colors.textSecondary,
      marginBottom: 8,
      textAlign: 'center',
      fontFamily: 'serif',
    },

    content: {
      fontSize: 16,
      lineHeight: 28,
      color:
        colors.text,
      fontFamily: 'serif',
    },

    divider: {
      height: 1,
      backgroundColor:
        colors.border,
      marginVertical: 20,
    },

    description: {
      fontSize: 13,
      color:
        colors.liturgical,
      fontStyle: 'italic',
      fontWeight: '400',
      marginBottom: 8,
      marginTop: 0,
      textAlign: 'left',
      fontFamily: 'serif',
      letterSpacing: 0.2,
      lineHeight: 20,
      paddingHorizontal: 4,
    },
  });
