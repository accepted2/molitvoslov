import React, {
  useEffect,
  useMemo,
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
  getSavedItems,
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
                            'text',

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
      onProgress={
        scheduleSave
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
