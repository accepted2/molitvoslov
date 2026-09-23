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
  getSavedItems,
} from '../services/savedItems';

import SelectableDocumentReader
  from '../components/reader/SelectableDocumentReader';

import {
  colors,
} from '../theme';


export const ReaderScreen = ({
  route,
}) => {
  const {
    slug,
  } = route.params;

  const [
    text,
    setText,
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


  useEffect(() => {
    loadText();
  }, [
    slug,
  ]);


  const loadText =
    async () => {
      try {
        setLoading(true);
        setError(null);
        setText(null);
        setSavedItems([]);

        const response =
          await api.get(
            `texts/${slug}/`
          );

        const data =
          response.data;

        setText(
          data
        );

        try {
          const saved =
            await getSavedItems({
              source_type:
                'text',

              source_id:
                data.id,
            });

          setSavedItems(
            saved
          );
        } catch (
          savedError
        ) {
          console.log(
            'Ошибка загрузки сохранений текста:',
            savedError.response?.data ||
            savedError.message
          );
        }
      } catch (loadError) {
        console.log(
          'Ошибка загрузки текста:',
          loadError.response?.data ||
          loadError.message
        );

        setError(
          'Текст не найден'
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
        if (!text) {
          return {
            title: '',
            description: '',
            progressAnchorType:
              'text',
            savedItems: [],
            sections: [],
          };
        }

        const normalizedSaved =
          savedItems
            .filter(
              item =>
                item.anchor_type ===
                  'text' &&
                Number(
                  item.anchor_id
                ) ===
                  Number(
                    text.id
                  ) &&
                item.start_offset !==
                  null &&
                item.end_offset !==
                  null
            )
            .map(
              item => ({
                ...item,

                anchor_id:
                  1,
              })
            );

        return {
          title:
            text.title ||
            'Чтение',

          description:
            text.description ||
            '',

          progressAnchorType:
            'text',

          savedItems:
            normalizedSaved,

          sections: [
            {
              progressAnchorId:
                Number(
                  text.id
                ),

              trackProgress:
                false,

              title:
                '',

              rows: [
                {
                  layout:
                    'stack',

                  blocks: [
                    {
                      id:
                        1,

                      text:
                        text.content ||
                        '',

                      sourceType:
                        'text',

                      sourceId:
                        text.id,

                      anchorType:
                        'text',

                      anchorId:
                        text.id,

                      sourceTitle:
                        text.title ||
                        'Чтение',

                      itemTitle:
                        text.title ||
                        'Текст',

                      fullSaveType:
                        'text',

                      metadata: {
                        slug:
                          text.slug ||
                          slug,
                      },
                    },
                  ],
                },
              ],
            },
          ],
        };
      },
      [
        savedItems,
        slug,
        text,
      ]
    );


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


  if (
    error ||
    !text
  ) {
    return (
      <View
        style={styles.center}
      >
        <Text
          style={styles.error}
        >
          {
            error ||
            'Текст не найден'
          }
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
        null
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
    },
  });
