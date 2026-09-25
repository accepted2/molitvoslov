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
  contentApi as api,
} from '../services/contentApi';

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

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader}
  from '../components/navigation/FixedSectionHeader';


export const ReaderScreen = ({
  route,
  navigation,
}) => {
  const {
    slug,
    focusTarget = null,
  } = route.params;

  const insets =
    useSafeAreaInsets();

  const headerHeight =
    insets.top + 56;

  const [
    text,
    setText,
  ] = useState(null);

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
        savedItemsRef.current =
          [];

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

          savedItemsRef.current =
            saved;

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


  const handleAction =
    async actionKey => {
      if (
        !text ||
        actionKey !==
          `text:${text.id}`
      ) {
        return null;
      }

      const existing =
        savedItemsRef.current
          .find(
            item =>
              item.anchor_type ===
                'text' &&
              Number(
                item.anchor_id
              ) ===
                Number(
                  text.id
                ) &&
              item.save_type ===
                'text'
          );

      if (existing) {
        await deleteSavedItem(
          existing.id
        );

        savedItemsRef.current =
          savedItemsRef.current
            .filter(
              item =>
                item.id !==
                existing.id
            );

        return {
          label:
            'В избранное',

          active:
            false,

          itemId:
            1,

          removedSavedItemId:
            existing.id,
        };
      }

      const content =
        text.content ||
        '';

      const saved =
        await saveItem({
          save_type:
            'text',

          source_type:
            'text',

          source_id:
            text.id,

          anchor_type:
            'text',

          anchor_id:
            text.id,

          source_title:
            text.title ||
            'Чтение',

          item_title:
            text.title ||
            'Текст',

          text:
            content,

          start_offset:
            0,

          end_offset:
            content.length,

          metadata: {
            slug:
              text.slug ||
              slug,
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

        itemId:
          1,

        savedItem:
          saved,
      };
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

        const wholeTextSaved =
          savedItems.some(
            item =>
              item.anchor_type ===
                'text' &&
              Number(
                item.anchor_id
              ) ===
                Number(
                  text.id
                ) &&
              item.save_type ===
                'text'
          );

        return {
          title:
            text.title ||
            'Чтение',

          description:
            text.description ||
            '',

          action: {
            key:
              `text:${text.id}`,

            label:
              wholeTextSaved
                ? 'В избранном'
                : 'В избранное',

            active:
              wholeTextSaved,
          },

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
    <View
      style={styles.screen}
    >
      <StatusBar
        style="light"
        translucent
        backgroundColor="transparent"
      />

      <SelectableDocumentReader
        documentData={
          documentData
        }
        savedProgress={
          null
        }
        focusTarget={
          focusTarget
        }
        topContentInset={
          headerHeight
        }
        onAction={
          handleAction
        }
      />

      <FixedSectionHeader
        title={
          text.title ||
          'Чтение'
        }
        navigation={
          navigation
        }
        topInset={
          insets.top
        }
      />
    </View>
  );
};

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        '#FFF4DE',
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

    error: {
      paddingHorizontal: 24,
      textAlign: 'center',
      color:
        colors.liturgical,
    },
  });
