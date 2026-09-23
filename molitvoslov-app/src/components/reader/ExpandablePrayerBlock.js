import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getSavedItems,
} from '../../services/savedItems';

import SelectableDocumentReader
  from './SelectableDocumentReader';


export default function ExpandablePrayerBlock({
  title,
  text,
  onCollapse,
  saveProps = null,
}) {
  const [
    isOpen,
    setIsOpen,
  ] = useState(false);

  const [
    savedItems,
    setSavedItems,
  ] = useState([]);


  useEffect(() => {
    if (
      !isOpen ||
      !saveProps?.sourceType ||
      !saveProps?.sourceId
    ) {
      return;
    }

    loadSaved();
  }, [
    isOpen,
    saveProps?.sourceType,
    saveProps?.sourceId,
    saveProps?.anchorType,
    saveProps?.anchorId,
  ]);


  const loadSaved =
    async () => {
      try {
        const saved =
          await getSavedItems({
            source_type:
              saveProps.sourceType,

            source_id:
              saveProps.sourceId,

            anchor_type:
              saveProps.anchorType,

            anchor_id:
              saveProps.anchorId,
          });

        setSavedItems(
          saved
        );
      } catch (error) {
        console.log(
          'Ошибка загрузки сохранений молитвенного блока:',
          error.response?.data ||
          error.message
        );
      }
    };


  const documentData =
    useMemo(
      () => {
        if (
          !saveProps ||
          !text
        ) {
          return null;
        }

        const normalizedSaved =
          savedItems
            .filter(
              item =>
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
          title: '',

          description: '',

          progressAnchorType:
            saveProps.anchorType,

          savedItems:
            normalizedSaved,

          sections: [
            {
              progressAnchorId:
                Number(
                  saveProps.anchorId
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

                      text,

                      sourceType:
                        saveProps.sourceType,

                      sourceId:
                        saveProps.sourceId,

                      anchorType:
                        saveProps.anchorType,

                      anchorId:
                        saveProps.anchorId,

                      sourceTitle:
                        saveProps.sourceTitle ||
                        title,

                      itemTitle:
                        saveProps.itemTitle ||
                        title,

                      fullSaveType:
                        'prayer',

                      metadata:
                        saveProps.metadata ||
                        {},
                    },
                  ],
                },
              ],
            },
          ],
        };
      },
      [
        saveProps,
        savedItems,
        text,
        title,
      ]
    );


  if (!text) {
    return null;
  }


  const toggle =
    () => {
      if (isOpen) {
        setIsOpen(false);

        onCollapse?.();

        return;
      }

      setIsOpen(true);
    };


  const collapse =
    () => {
      setIsOpen(false);

      onCollapse?.();
    };


  return (
    <View
      style={styles.container}
    >
      <Pressable
        style={({pressed}) => [
          styles.header,

          pressed &&
            styles.pressed,
        ]}
        onPress={
          toggle
        }
      >
        <View
          style={
            styles
              .headerContent
          }
        >
          <Text
            style={styles.title}
          >
            ☦ {title}
          </Text>

          {!isOpen && (
            <Text
              style={
                styles.preview
              }
              numberOfLines={2}
            >
              {text}
            </Text>
          )}
        </View>

        <Text
          style={styles.arrow}
        >
          {
            isOpen
              ? '⌃'
              : '⌄'
          }
        </Text>
      </Pressable>


      {isOpen && (
        <View
          style={styles.content}
        >
          {documentData ? (
            <View
              style={
                styles.reader
              }
            >
              <SelectableDocumentReader
                documentData={
                  documentData
                }
                savedProgress={
                  null
                }
              />
            </View>
          ) : (
            <Text
              style={
                styles.prayerText
              }
            >
              {text}
            </Text>
          )}

          <Pressable
            style={({pressed}) => [
              styles.collapseButton,

              pressed &&
                styles
                  .collapsePressed,
            ]}
            onPress={
              collapse
            }
          >
            <Text
              style={
                styles
                  .collapseText
              }
            >
              Свернуть
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}


const styles =
  StyleSheet.create({
    container: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        'rgba(120, 90, 55, 0.16)',
      overflow: 'hidden',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 16,
    },

    pressed: {
      opacity: 0.7,
    },

    headerContent: {
      flex: 1,
      paddingRight: 12,
    },

    title: {
      fontSize: 17,
      fontWeight: '600',
      color: '#3A342D',
    },

    preview: {
      marginTop: 7,
      fontSize: 14,
      lineHeight: 20,
      color: '#777169',
      fontFamily: 'serif',
    },

    arrow: {
      fontSize: 22,
      color: '#8A7356',
    },

    content: {
      paddingHorizontal: 10,
      paddingBottom: 18,
      borderTopWidth:
        StyleSheet
          .hairlineWidth,
      borderTopColor:
        'rgba(120, 90, 55, 0.15)',
    },

    reader: {
      height: 440,
      marginTop: 10,
      borderRadius: 10,
      overflow: 'hidden',
    },

    prayerText: {
      paddingTop: 16,
      fontSize: 17,
      lineHeight: 28,
      color: '#332F2A',
      fontFamily: 'serif',
    },

    collapseButton: {
      alignSelf: 'center',
      marginTop: 16,
      paddingVertical: 10,
      paddingHorizontal: 22,
      borderRadius: 20,
      backgroundColor:
        '#EEE6D7',
    },

    collapsePressed: {
      opacity: 0.7,
    },

    collapseText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#68563F',
    },
  });
