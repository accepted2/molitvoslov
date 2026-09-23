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
  useTextSelection,
} from '../context/TextSelectionContext';

import {
  getSavedItems,
} from '../services/savedItems';

import SelectableSaveText
  from '../components/reader/SelectableSaveText';

import {
  colors,
  radius,
} from '../theme';


export const PrayerRuleScreen = ({
  route,
}) => {
  const {
    slug,
  } = route.params;

  const {
    activeSelection,
  } = useTextSelection();

  const [
    rule,
    setRule,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savedItems,
    setSavedItems,
  ] = useState([]);

  const [
    highlightedItemId,
    setHighlightedItemId,
  ] = useState(null);

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

  const viewportHeightRef =
    useRef(0);

  const currentOffsetRef =
    useRef(0);

  const savedOffsetRef =
    useRef(0);

  const initialRestoreHandledRef =
    useRef(false);

  const restoringRef =
    useRef(false);

  const {
    savedProgress,
    progressReady,
    scheduleSave,
  } = useReadingProgress({
    sourceType:
      'prayer_rule',

    sourceId:
      rule?.id,
  });


  useEffect(() => {
    restoredRef.current =
      false;

    savedAnchorIdRef.current =
      null;

    currentItemRef.current =
      null;

    currentOffsetRef.current =
      0;

    savedOffsetRef.current =
      0;

    initialRestoreHandledRef.current =
      false;

    restoringRef.current =
      false;

    itemPositionsRef.current =
      {};

    setSavedItems([]);

    loadRule();
  }, [
    slug,
  ]);


  useEffect(() => {
    if (
      !rule?.id ||
      !progressReady ||
      initialRestoreHandledRef
        .current
    ) {
      return;
    }

    initialRestoreHandledRef.current =
      true;

    if (
      savedProgress
        ?.anchor_type ===
      'prayer_rule_item'
    ) {
      savedAnchorIdRef.current =
        savedProgress
          .anchor_id;

      savedOffsetRef.current =
        Number(
          savedProgress
            .offset || 0
        );

      tryRestorePosition();
    }
  }, [
    rule?.id,
    progressReady,
    savedProgress,
  ]);


  const loadRule =
    async () => {
      try {
        setLoading(true);

        const response =
          await api.get(
            `prayer-rules/${slug}/`
          );

        const ruleData =
          response.data;

        setRule(
          ruleData
        );

        try {
          const saved =
            await getSavedItems({
              source_type:
                'prayer_rule',

              source_id:
                ruleData.id,
            });

          setSavedItems(
            saved
          );
        } catch (error) {
          console.log(
            'Ошибка загрузки сохранённых фрагментов:',
            error.response?.data ||
            error.message
          );
        }
      } catch (error) {
        console.error(
          'Ошибка загрузки молитвенного правила:',
          error
        );

        setRule(
          null
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
          const exists =
            current.some(
              item =>
                item.id ===
                savedItem.id
            );

          if (exists) {
            return current;
          }

          return [
            savedItem,
            ...current,
          ];
        }
      );
    };


  const isItemSaved =
    itemId =>
      savedItems.some(
        item =>
          item.anchor_type ===
            'prayer_rule_item' &&
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
    const y =
      event.nativeEvent
        .layout.y;

    itemPositionsRef.current[
      itemId
    ] = {
      y,
      height:
        event.nativeEvent
          .layout.height,
    };

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
        savedAnchorIdRef
          .current;

      if (!anchorId) {
        return;
      }

      const layout =
        itemPositionsRef
          .current[
          anchorId
        ];

      const viewportHeight =
        viewportHeightRef
          .current;

      if (
        !layout ||
        !viewportHeight ||
        !scrollRef.current
      ) {
        return;
      }

      restoredRef.current =
        true;

      setTimeout(() => {
        restoringRef.current =
          true;

        scrollRef.current
          ?.scrollTo({
            y:
              Math.max(
                layout.y +
                savedOffsetRef
                  .current -
                (
                  viewportHeight /
                  2
                ),
                0
              ),

            animated:
              false,
          });

        setHighlightedItemId(
          anchorId
        );

        setTimeout(() => {
          restoringRef.current =
            false;
        }, 350);

        setTimeout(() => {
          setHighlightedItemId(
            null
          );
        }, 1800);
      }, 200);
    };


  const getCurrentItem =
    (
      scrollY,
      viewportHeight
    ) => {
      const positions =
        Object.entries(
          itemPositionsRef
            .current
        )
          .map(
            ([id, layout]) => ({
              id:
                Number(id),

              y:
                layout.y,

              height:
                layout.height,
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
        scrollY +
        (
          viewportHeight /
          2
        );

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
        !rule ||
        restoringRef.current
      ) {
        return;
      }

      const scrollY =
        event.nativeEvent
          .contentOffset.y;

      const viewportHeight =
        event.nativeEvent
          .layoutMeasurement
          ?.height ||
        viewportHeightRef.current;

      if (
        viewportHeight
      ) {
        viewportHeightRef.current =
          viewportHeight;
      }

      const current =
        getCurrentItem(
          scrollY,
          viewportHeight
        );

      if (!current) {
        return;
      }

      const readingLine =
        scrollY +
        (
          viewportHeight /
          2
        );

      const offset =
        Math.max(
          0,
          Math.min(
            current.height ||
              0,
            readingLine -
              current.y
          )
        );

      const sameItem =
        currentItemRef
          .current ===
        current.id;

      const offsetChanged =
        Math.abs(
          currentOffsetRef
            .current -
          offset
        ) >= 18;

      if (
        sameItem &&
        !offsetChanged
      ) {
        return;
      }

      currentItemRef.current =
        current.id;

      currentOffsetRef.current =
        offset;

      scheduleSave({
        anchorType:
          'prayer_rule_item',

        anchorId:
          current.id,

        offset,
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


  if (!rule) {
    return (
      <View
        style={styles.center}
      >
        <Text>
          Молитвенное правило
          не найдено
        </Text>
      </View>
    );
  }


  const renderFootnotes =
    item => {
      if (
        !item.footnotes
          ?.length
      ) {
        return null;
      }

      return (
        <View
          style={
            styles
              .footnotesContainer
          }
        >
          {item.footnotes.map(
            footnote => (
              <Text
                key={
                  footnote.id
                }
                style={
                  styles.footnote
                }
              >
                [{footnote.number}]
                {' '}
                {footnote.content}
              </Text>
            )
          )}
        </View>
      );
    };


  const renderTextItem =
    item => {
      const text =
        item.text;

      if (!text) {
        return null;
      }

      return (
        <View
          style={
            styles.prayerBlock
          }
        >
          {!!text.title && (
            <Text
              style={
                styles.title
              }
            >
              {text.title}
            </Text>
          )}

          {text
            .description_position ===
              'before' &&
            !!text.description && (
              <Text
                style={
                  styles
                    .description
                }
              >
                {text.description}
              </Text>
            )}

          <SelectableSaveText
            text={
              text.content
            }
            textStyle={
              styles.content
            }
            sourceType="prayer_rule"
            sourceId={
              rule.id
            }
            anchorType="prayer_rule_item"
            anchorId={
              item.id
            }
            sourceTitle={
              rule.name
            }
            itemTitle={
              text.title ||
              text.description ||
              'Молитва'
            }
            metadata={{
              slug:
                rule.slug,
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
                  styles
                    .descriptionAfter
                }
              >
                {text.description}
              </Text>
            )}

          {!!item.note && (
            <Text
              style={
                styles.note
              }
            >
              {item.note}
            </Text>
          )}

          {
            renderFootnotes(
              item
            )
          }
        </View>
      );
    };


  const renderInstruction =
    item => (
      <View
        style={
          styles
            .instructionBlock
        }
      >
        <Text
          style={
            styles.instruction
          }
        >
          {item.content}
        </Text>

        {
          renderFootnotes(
            item
          )
        }
      </View>
    );


  const renderSection =
    item => (
      <View
        style={
          styles.sectionBlock
        }
      >
        {!!item.title && (
          <Text
            style={
              styles.sectionTitle
            }
          >
            {item.title}
          </Text>
        )}

        {!!item.content && (
          <Text
            style={
              styles
                .sectionContent
            }
          >
            {item.content}
          </Text>
        )}

        {
          renderFootnotes(
            item
          )
        }
      </View>
    );


  const renderItem =
    item => {
      switch (
        item.item_type
      ) {
        case 'text':
          return renderTextItem(
            item
          );

        case 'instruction':
          return renderInstruction(
            item
          );

        case 'section':
          return renderSection(
            item
          );

        default:
          return null;
      }
    };


  return (
    <ScrollView
      scrollEnabled={
        !activeSelection
      }
      ref={scrollRef}
      style={
        styles.container
      }
      contentContainerStyle={
        styles
          .contentContainer
      }
      onScroll={
        handleScroll
      }
      onLayout={
        event => {
          viewportHeightRef.current =
            event.nativeEvent
              .layout.height;

          tryRestorePosition();
        }
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
        {rule.name}
      </Text>

      {!!rule.description && (
        <Text
          style={
            styles
              .ruleDescription
          }
        >
          {rule.description}
        </Text>
      )}

      {rule.items.map(
        (
          item,
          index
        ) => {
          const saved =
            isItemSaved(
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
                styles.itemWrapper,

                saved &&
                  styles
                    .itemSaved,

                highlightedItemId ===
                  item.id &&
                  styles
                    .itemHighlighted,
              ]}
            >
              {
                renderItem(
                  item
                )
              }

              {index <
                rule.items
                  .length -
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
      fontSize: 26,
      fontWeight: '700',
      color:
        colors.text,
      textAlign: 'center',
      fontFamily: 'serif',
      marginBottom: 24,
    },

    ruleDescription: {
      fontSize: 14,
      lineHeight: 21,
      color:
        colors.textSecondary,
      fontStyle: 'italic',
      fontFamily: 'serif',
      marginBottom: 24,
    },

    prayerBlock: {
      marginVertical: 8,
    },

    title: {
      fontSize: 19,
      fontWeight: '700',
      color:
        colors.textSecondary,
      textAlign: 'center',
      fontFamily: 'serif',
      marginBottom: 10,
    },

    content: {
      fontSize: 17,
      lineHeight: 29,
      color:
        colors.text,
      fontFamily: 'serif',
    },

    description: {
      fontSize: 13,
      lineHeight: 20,
      color:
        colors.liturgical,
      fontStyle: 'italic',
      fontFamily: 'serif',
      marginBottom: 8,
      paddingHorizontal: 4,
    },

    descriptionAfter: {
      fontSize: 13,
      lineHeight: 20,
      color:
        colors.liturgical,
      fontStyle: 'italic',
      fontFamily: 'serif',
      marginTop: 8,
      paddingHorizontal: 4,
    },

    note: {
      fontSize: 13,
      lineHeight: 20,
      color:
        colors.accent,
      fontStyle: 'italic',
      fontFamily: 'serif',
      marginTop: 8,
    },

    instructionBlock: {
      marginVertical: 8,
    },

    instruction: {
      fontSize: 14,
      lineHeight: 22,
      color:
        colors.accentDark,
      fontStyle: 'italic',
      fontFamily: 'serif',
    },

    sectionBlock: {
      marginVertical: 10,
    },

    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color:
        colors.text,
      textAlign: 'center',
      fontFamily: 'serif',
      marginBottom: 8,
    },

    sectionContent: {
      fontSize: 16,
      lineHeight: 26,
      color:
        colors.text,
      fontFamily: 'serif',
    },

    footnotesContainer: {
      marginTop: 12,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor:
        colors.border,
    },

    footnote: {
      fontSize: 12,
      lineHeight: 18,
      color:
        colors.textSecondary,
      fontFamily: 'serif',
      marginBottom: 4,
    },

    divider: {
      height: 1,
      backgroundColor:
        colors.border,
      marginVertical: 18,
    },

    itemWrapper: {
      borderRadius:
        radius.md,
      paddingHorizontal: 6,
      borderLeftWidth: 3,
      borderLeftColor:
        'transparent',
    },

    itemSaved: {
      backgroundColor:
        'rgba(138, 90, 56, 0.055)',
      borderLeftColor:
        'rgba(138, 90, 56, 0.28)',
    },

    itemHighlighted: {
      backgroundColor:
        'rgba(206, 162, 72, 0.18)',
    },
  });
