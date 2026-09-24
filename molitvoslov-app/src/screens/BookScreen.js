import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
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

import SelectableDocumentReader
  from '../components/reader/SelectableDocumentReader';

import {
  colors,
} from '../theme';


export const BookScreen = ({
  route,
}) => {
  const {
    categoryId,
    categorySlug,
    categoryName,
    focusTarget = null,
  } = route.params;

  const [
    texts,
    setTexts,
  ] = useState([]);

  const [
    savedItems,
    setSavedItems,
  ] = useState([]);

  const savedItemsRef =
    useRef([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState(null);


  const {
    savedProgress,
    progressReady,
    scheduleSave,
  } = useReadingProgress({
    sourceType:
      'category',

    sourceId:
      categoryId,
  });


  useEffect(() => {
    loadScreen();
  }, [
    categoryId,
    categorySlug,
  ]);


  const loadScreen =
    async () => {
      try {
        setLoading(true);
        setError(null);
        setTexts([]);
        setSavedItems([]);
        savedItemsRef.current =
          [];

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
          [
            ...textsResponse.data,
          ]
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

        savedItemsRef.current =
          saved;

        setSavedItems(
          saved
        );
      } catch (loadError) {
        console.log(
          'Ошибка загрузки категории:',
          loadError.response?.data ||
          loadError.message
        );

        setError(
          'Не удалось загрузить тексты'
        );
      } finally {
        setLoading(
          false
        );
      }
    };


  const handleAction =
    async actionKey => {
      if (
        !actionKey?.startsWith(
          'category-text:'
        )
      ) {
        return null;
      }

      const itemId =
        Number(
          actionKey.split(
            ':'
          )[1]
        );

      const item =
        texts.find(
          entry =>
            Number(
              entry.id
            ) ===
              itemId
        );

      if (
        !item?.text
      ) {
        return null;
      }

      const existing =
        savedItemsRef.current
          .find(
            saved =>
              saved.anchor_type ===
                'category_text' &&
              Number(
                saved.anchor_id
              ) ===
                itemId &&
              saved.save_type ===
                'prayer'
          );

      if (existing) {
        await deleteSavedItem(
          existing.id
        );

        savedItemsRef.current =
          savedItemsRef.current
            .filter(
              saved =>
                saved.id !==
                existing.id
            );

        return {
          label:
            'В избранное',

          active:
            false,

          itemId,

          removedSavedItemId:
            existing.id,
        };
      }

      const content =
        item.text.content ||
        '';

      const saved =
        await saveItem({
          save_type:
            'prayer',

          source_type:
            'category',

          source_id:
            categoryId,

          anchor_type:
            'category_text',

          anchor_id:
            itemId,

          source_title:
            categoryName,

          item_title:
            item.text.title ||
            item.text.description ||
            'Молитва',

          text:
            content,

          start_offset:
            0,

          end_offset:
            content.length,

          metadata: {
            category_slug:
              categorySlug,

            category_name:
              categoryName,
          },
        });

      savedItemsRef.current = [
        saved,
        ...savedItemsRef.current,
      ];

      return {
        label:
          'В избранном',

        active:
          true,

        itemId,

        savedItem:
          saved,
      };
    };


  const documentData =
    useMemo(
      () => {
        const savedForReader =
          savedItems
            .filter(
              item =>
                item.anchor_type ===
                  'category_text' &&
                item.start_offset !==
                  null &&
                item.end_offset !==
                  null
            )
            .map(
              item => ({
                ...item,
                anchor_id:
                  Number(
                    item.anchor_id
                  ),
              })
            );

        const sections =
          texts
            .filter(
              item =>
                !!item.text
            )
            .map(
              item => {
                const text =
                  item.text;

                const wholeSaved =
                  savedItems.some(
                    saved =>
                      saved.anchor_type ===
                        'category_text' &&
                      Number(
                        saved.anchor_id
                      ) ===
                        Number(
                          item.id
                        ) &&
                      saved.save_type ===
                        'prayer'
                  );

                return {
                  progressAnchorId:
                    Number(
                      item.id
                    ),

                  trackProgress:
                    true,

                  title:
                    text.title ||
                    'Молитва',

                  action: {
                    key:
                      `category-text:${item.id}`,

                    label:
                      wholeSaved
                        ? 'В избранном'
                        : 'В избранное',

                    active:
                      wholeSaved,
                  },

                  rows: [
                    {
                      layout:
                        'stack',

                      blocks: [
                        {
                          id:
                            Number(
                              item.id
                            ),

                          text:
                            text.content ||
                            '',

                          className:
                            '',

                          sourceType:
                            'category',

                          sourceId:
                            categoryId,

                          anchorType:
                            'category_text',

                          anchorId:
                            Number(
                              item.id
                            ),

                          sourceTitle:
                            categoryName,

                          itemTitle:
                            text.title ||
                            text.description ||
                            'Текст',

                          fullSaveType:
                            'prayer',

                          metadata: {
                            category_slug:
                              categorySlug,

                            category_name:
                              categoryName,
                          },
                        },
                      ],
                    },
                  ],
                };
              }
            );

        return {
          title:
            categoryName,

          description:
            '',

          progressAnchorType:
            'category_text',

          savedItems:
            savedForReader,

          sections,
        };
      },
      [
        categoryId,
        categorySlug,
        categoryName,
        texts,
        savedItems,
      ]
    );


  if (
    loading ||
    (
      categoryId &&
      !progressReady
    )
  ) {
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
    <SelectableDocumentReader
      documentData={
        documentData
      }
      savedProgress={
        savedProgress
      }
      focusTarget={
        focusTarget
      }
      onProgress={
        scheduleSave
      }
      onAction={
        handleAction
      }
    />
  );
};


const styles =
  StyleSheet.create({
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

    error: {
      paddingHorizontal: 24,
      textAlign: 'center',
      color:
        colors.liturgical,
      fontSize: 15,
      lineHeight: 22,
    },
  });
