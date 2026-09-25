import React, {
  useEffect,
  useLayoutEffect,
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

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';

import {FixedSectionHeader}
  from '../components/navigation/FixedSectionHeader';


const GLORY_TEXT = `Слава Отцу и Сыну и Святому Духу.
И ныне и присно и во веки веков. Аминь.

Аллилуиа, аллилуиа, аллилуиа, слава Тебе, Боже. ×3
Господи, помилуй. ×3

Слава Отцу и Сыну и Святому Духу.

[Здесь можно прочитать прошение о здравии / об упокоении и помянуть имена.]

И ныне и присно и во веки веков. Аминь.`;


const buildLanguageChunk = (
  verses,
  field
) => {
  let text = '';

  const verseRanges =
    [];

  verses.forEach(
    verse => {
      const value =
        verse[field] ||
        '';

      if (!value) {
        return;
      }

      if (text) {
        text += '\n';
      }

      const numberPrefix =
        `${verse.number} `;

      text +=
        numberPrefix;

      const contentStart =
        text.length;

      text +=
        value;

      verseRanges.push({
        verseId:
          Number(
            verse.id
          ),

        contentStart,

        contentEnd:
          text.length,
      });
    }
  );

  return {
    text,
    verseRanges,
  };
};


export default function KathismaScreen({
  route,
  navigation,
}) {
  const {
    kathismaNumber,
    kathismaTitle,
    focusTarget = null,
  } = route.params;

  const insets =
    useSafeAreaInsets();

  const headerHeight =
    insets.top + 56;

  const [
    kathisma,
    setKathisma,
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


  const {
    savedProgress,
    progressReady,
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


  const loadScreen =
    async () => {
      try {
        setLoading(true);
        setError(null);
        setKathisma(null);
        setSavedItems([]);
        savedItemsRef.current =
          [];

        const response =
          await api.get(
            `kathismas/${kathismaNumber}/`
          );

        const data =
          response.data;

        setKathisma(
          data
        );

        try {
          const saved =
            await getSavedItems({
              source_type:
                'psalter',

              source_id:
                data.psalter,
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
            'Ошибка загрузки сохранений Псалтири:',
            savedError.response?.data ||
            savedError.message
          );
        }
      } catch (loadError) {
        console.log(
          'Ошибка загрузки кафизмы:',
          loadError.response?.data ||
          loadError.message
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


  const getSavedKathisma =
    () =>
      savedItemsRef.current
        .find(
          item =>
            item.anchor_type ===
              'kathisma' &&
            Number(
              item.anchor_id
            ) ===
              Number(
                kathisma?.id
              )
        );


  const getSavedPsalm =
    psalmId =>
      savedItemsRef.current
        .find(
          item =>
            (
              item.anchor_type ===
                'psalm' ||
              (
                item.anchor_type ===
                  'psalm_text' &&
                item.save_type ===
                  'psalm'
              )
            ) &&
            Number(
              item.anchor_id
            ) ===
              Number(
                psalmId
              )
        );


  const handleAction =
    async actionKey => {
      if (!kathisma) {
        return null;
      }

      if (
        actionKey ===
        `kathisma:${kathisma.id}`
      ) {
        const existing =
          getSavedKathisma();

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
          };
        }

        const saved =
          await saveItem({
            save_type:
              'kathisma',

            source_type:
              'psalter',

            source_id:
              kathisma.psalter,

            anchor_type:
              'kathisma',

            anchor_id:
              kathisma.id,

            source_title:
              'Псалтирь',

            item_title:
              `Кафизма ${kathisma.number}`,

            text:
              '',

            metadata: {
              kathisma_number:
                kathisma.number,

              kathisma_title:
                kathisma.title ||
                '',
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
        };
      }

      if (
        !actionKey?.startsWith(
          'psalm:'
        )
      ) {
        return null;
      }

      const psalmId =
        Number(
          actionKey.split(
            ':'
          )[1]
        );

      const psalm =
        (
          kathisma.psalms ||
          []
        ).find(
          item =>
            Number(
              item.id
            ) ===
              psalmId
        );

      if (!psalm) {
        return null;
      }

      const existing =
        getSavedPsalm(
          psalmId
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
        };
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

          text:
            '',

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

      savedItemsRef.current = [
        saved,
        ...savedItemsRef.current,
      ];

      return {
        label:
          'В избранном',

        active:
          true,

        savedItem:
          saved,
      };
    };


  const readerProgress =
    useMemo(
      () => {
        if (
          !savedProgress ||
          !kathisma
        ) {
          return savedProgress;
        }

        if (
          savedProgress.anchor_type ===
          'psalm'
        ) {
          return savedProgress;
        }

        if (
          savedProgress.anchor_type !==
          'psalm_verse'
        ) {
          return null;
        }

        const psalm =
          (
            kathisma.psalms ||
            []
          ).find(
            item =>
              (
                item.verses ||
                []
              ).some(
                verse =>
                  Number(
                    verse.id
                  ) ===
                    Number(
                      savedProgress
                        .anchor_id
                    )
              )
          );

        if (!psalm) {
          return null;
        }

        return {
          ...savedProgress,

          anchor_type:
            'psalm',

          anchor_id:
            psalm.id,

          offset:
            0,
        };
      },
      [
        kathisma,
        savedProgress,
      ]
    );


  const documentData =
    useMemo(
      () => {
        if (!kathisma) {
          return {
            title:
              `Кафизма ${kathismaNumber}`,

            description:
              '',

            progressAnchorType:
              'psalm',

            savedItems: [],

            sections: [],
          };
        }

        let nextBlockId =
          1;

        const normalizedSaved =
          [];

        const sections =
          [];


        const attachDirectSaved = ({
          syntheticId,
          anchorType,
          anchorId,
          language,
          chunkIndex,
          sectionName,
        }) => {
          savedItems
            .filter(
              item => {
                if (
                  item.anchor_type !==
                    anchorType ||
                  Number(
                    item.anchor_id
                  ) !==
                    Number(
                      anchorId
                    ) ||
                  item.start_offset ===
                    null ||
                  item.end_offset ===
                    null
                ) {
                  return false;
                }

                const metadata =
                  item.metadata ||
                  {};

                if (
                  language &&
                  metadata.language &&
                  metadata.language !==
                    language
                ) {
                  return false;
                }

                if (
                  Number.isFinite(
                    chunkIndex
                  ) &&
                  metadata.chunk_index !==
                    undefined &&
                  Number(
                    metadata.chunk_index
                  ) !==
                    Number(
                      chunkIndex
                    )
                ) {
                  return false;
                }

                if (
                  sectionName &&
                  metadata.section &&
                  metadata.section !==
                    sectionName
                ) {
                  return false;
                }

                return true;
              }
            )
            .forEach(
              item => {
                normalizedSaved.push({
                  ...item,

                  anchor_id:
                    syntheticId,
                });
              }
            );
        };


        const attachLegacyVerseSaved = ({
          syntheticId,
          verseRanges,
          language,
        }) => {
          verseRanges.forEach(
            range => {
              savedItems
                .filter(
                  item => {
                    if (
                      item.anchor_type !==
                        'psalm_verse' ||
                      Number(
                        item.anchor_id
                      ) !==
                        Number(
                          range.verseId
                        ) ||
                      item.start_offset ===
                        null ||
                      item.end_offset ===
                        null
                    ) {
                      return false;
                    }

                    const metadata =
                      item.metadata ||
                      {};

                    return (
                      !metadata.language ||
                      metadata.language ===
                        language
                    );
                  }
                )
                .forEach(
                  item => {
                    normalizedSaved.push({
                      ...item,

                      anchor_id:
                        syntheticId,

                      start_offset:
                        range.contentStart +
                        Number(
                          item.start_offset
                        ),

                      end_offset:
                        range.contentStart +
                        Number(
                          item.end_offset
                        ),
                    });
                  }
                );
            }
          );
        };


        const makePsalmBlock = ({
          psalm,
          text,
          verseRanges,
          language,
          chunkIndex,
          chunkCount,
          className,
          label,
        }) => {
          const syntheticId =
            nextBlockId++;

          attachDirectSaved({
            syntheticId,
            anchorType:
              'psalm_text',
            anchorId:
              psalm.id,
            language,
            chunkIndex,
          });

          attachLegacyVerseSaved({
            syntheticId,
            verseRanges,
            language,
          });

          return {
            id:
              syntheticId,

            text,

            label:
              label ||
              '',

            className,

            sourceType:
              'psalter',

            sourceId:
              kathisma.psalter,

            anchorType:
              'psalm_text',

            anchorId:
              psalm.id,

            sourceTitle:
              'Псалтирь',

            itemTitle:
              `Псалом ${psalm.number}`,

            fullSaveType:
              chunkCount === 1
                ? 'psalm'
                : 'fragment',

            metadata: {
              kathisma_number:
                kathisma.number,

              kathisma_title:
                kathisma.title ||
                '',

              psalm_id:
                psalm.id,

              psalm_number:
                psalm.number,

              chunk_index:
                chunkIndex,

              language,
            },
          };
        };


        const makeOtherBlock = ({
          text,
          anchorType,
          anchorId,
          itemTitle,
          fullSaveType,
          metadata,
          sectionName,
        }) => {
          const syntheticId =
            nextBlockId++;

          attachDirectSaved({
            syntheticId,
            anchorType,
            anchorId,
            sectionName,
          });

          return {
            id:
              syntheticId,

            text:
              text || '',

            sourceType:
              'psalter',

            sourceId:
              kathisma.psalter,

            anchorType,

            anchorId,

            sourceTitle:
              'Псалтирь',

            itemTitle,

            fullSaveType,

            metadata,
          };
        };


        (
          kathisma.psalms ||
          []
        ).forEach(
          (
            psalm,
            psalmIndex
          ) => {
            const verses =
              psalm.verses ||
              [];

            const chunks =
              [];

            let currentChunk =
              [];

            const flushChunk =
              () => {
                if (
                  currentChunk.length
                ) {
                  chunks.push({
                    type:
                      'verses',

                    verses:
                      currentChunk,
                  });

                  currentChunk =
                    [];
                }
              };


            verses.forEach(
              verse => {
                currentChunk.push(
                  verse
                );

                const glory =
                  (
                    kathisma.glories ||
                    []
                  ).find(
                    item =>
                      Number(
                        item.after_verse
                      ) ===
                        Number(
                          verse.id
                        )
                  );

                if (glory) {
                  flushChunk();

                  chunks.push({
                    type:
                      'glory',

                    glory,
                  });
                }
              }
            );

            flushChunk();


            const psalmGlory =
              (
                kathisma.glories ||
                []
              ).find(
                item =>
                  Number(
                    item.after_psalm
                  ) ===
                    Number(
                      psalm.id
                    )
              );

            if (psalmGlory) {
              chunks.push({
                type:
                  'glory',

                glory:
                  psalmGlory,
              });
            }


            const verseChunkCount =
              chunks.filter(
                chunk =>
                  chunk.type ===
                  'verses'
              ).length;

            let verseChunkIndex =
              0;

            const rows =
              [];


            chunks.forEach(
              chunk => {
                if (
                  chunk.type ===
                  'glory'
                ) {
                  const gloryBlock =
                    makeOtherBlock({
                      text:
                        GLORY_TEXT,

                      anchorType:
                        'kathisma_glory',

                      anchorId:
                        chunk.glory.id,

                      itemTitle:
                        `Слава после Псалма ${psalm.number}`,

                      fullSaveType:
                        'prayer',

                      metadata: {
                        kathisma_number:
                          kathisma.number,

                        psalm_number:
                          psalm.number,

                        glory_number:
                          chunk.glory.number,
                      },
                    });

                  rows.push({
                    layout:
                      'stack',

                    blocks: [
                      gloryBlock,
                    ],
                  });

                  return;
                }


                const church =
                  buildLanguageChunk(
                    chunk.verses,
                    'church_slavonic'
                  );

                const russian =
                  buildLanguageChunk(
                    chunk.verses,
                    'russian'
                  );

                const blocks =
                  [];

                if (
                  church.text
                ) {
                  blocks.push(
                    makePsalmBlock({
                      psalm,
                      text:
                        church.text,
                      verseRanges:
                        church.verseRanges,
                      language:
                        'church',
                      chunkIndex:
                        verseChunkIndex,
                      chunkCount:
                        verseChunkCount,
                      className:
                        'psalter',
                      label:
                        psalmIndex ===
                          0 &&
                        verseChunkIndex ===
                          0
                          ? 'Церковнославянский'
                          : '',
                    })
                  );
                }

                if (
                  russian.text
                ) {
                  blocks.push(
                    makePsalmBlock({
                      psalm,
                      text:
                        russian.text,
                      verseRanges:
                        russian.verseRanges,
                      language:
                        'russian',
                      chunkIndex:
                        verseChunkIndex,
                      chunkCount:
                        verseChunkCount,
                      className:
                        'psalter secondary',
                      label:
                        psalmIndex ===
                          0 &&
                        verseChunkIndex ===
                          0
                          ? 'Русский'
                          : '',
                    })
                  );
                }

                if (
                  blocks.length
                ) {
                  rows.push({
                    layout:
                      blocks.length >
                        1
                        ? 'parallel'
                        : 'stack',

                    blocks,
                  });
                }

                verseChunkIndex +=
                  1;
              }
            );


            const psalmSavedItem =
              savedItems.find(
                item =>
                  (
                    item.anchor_type ===
                      'psalm' ||
                    (
                      item.anchor_type ===
                        'psalm_text' &&
                      item.save_type ===
                        'psalm'
                    )
                  ) &&
                  Number(
                    item.anchor_id
                  ) ===
                    Number(
                      psalm.id
                    )
              );

            const psalmSaved =
              !!psalmSavedItem;


            sections.push({
              progressAnchorId:
                Number(
                  psalm.id
                ),

              trackProgress:
                true,

              title:
                `Псалом ${psalm.number}`,

              action: {
                key:
                  `psalm:${psalm.id}`,

                label:
                  psalmSaved
                    ? 'В избранном'
                    : 'В избранное',

                active:
                  psalmSaved,

                savedItemId:
                  psalmSavedItem
                    ?.id ||
                  null,

                highlightContent:
                  true,

                highlightAnchorType:
                  'psalm_text',
              },

              rows,
            });
          }
        );


        if (
          kathisma.prayers_after
        ) {
          const block =
            makeOtherBlock({
              text:
                kathisma
                  .prayers_after,

              anchorType:
                'kathisma_prayers_after',

              anchorId:
                kathisma.id,

              itemTitle:
                `Молитвы после кафизмы ${kathisma.number}`,

              fullSaveType:
                'prayer',

              metadata: {
                kathisma_number:
                  kathisma.number,

                kathisma_title:
                  kathisma.title ||
                  '',

                section:
                  'prayers_after',
              },

              sectionName:
                'prayers_after',
            });

          sections.push({
            progressAnchorId:
              Number(
                kathisma.id
              ),

            trackProgress:
              false,

            title:
              'Молитвы после кафизмы',

            rows: [
              {
                layout:
                  'stack',

                blocks: [
                  block,
                ],
              },
            ],
          });
        }


        const wholeKathismaSaved =
          savedItems.some(
            item =>
              item.anchor_type ===
                'kathisma' &&
              Number(
                item.anchor_id
              ) ===
                Number(
                  kathisma.id
                )
          );


        return {
          title:
            `Кафизма ${kathisma.number}`,

          description:
            kathisma.title ||
            '',

          action: {
            key:
              `kathisma:${kathisma.id}`,

            label:
              wholeKathismaSaved
                ? 'В избранном'
                : 'В избранное',

            active:
              wholeKathismaSaved,
          },

          progressAnchorType:
            'psalm',

          savedItems:
            normalizedSaved,

          sections,
        };
      },
      [
        kathisma,
        kathismaNumber,
        savedItems,
      ]
    );


  const handleProgress =
    progress => {
      if (!kathisma) {
        return;
      }

      const psalm =
        (
          kathisma.psalms ||
          []
        ).find(
          item =>
            Number(item.id) ===
            Number(progress.anchorId)
        );

      scheduleSave({
        ...progress,
        metadata: {
          kathisma_number:
            Number(kathisma.number),
          psalm_number:
            psalm
              ? Number(psalm.number)
              : null,
        },
      });
    };


  if (
    loading ||
    (
      kathisma &&
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
      </View>
    );
  }


  if (
    error ||
    !kathisma
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
            'Кафизма не найдена'
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
          readerProgress
        }
        focusTarget={
          focusTarget
        }
        topContentInset={
          headerHeight
        }
        onProgress={
          handleProgress
        }
        onAction={
          handleAction
        }
      />

      <FixedSectionHeader
        title={
          `Кафизма ${kathisma.number}`
        }
        navigation={
          navigation
        }
        topInset={
          insets.top
        }
        showTitle={false}
      />
    </View>
  );
}

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

    error: {
      paddingHorizontal: 18,
      textAlign: 'center',
      fontSize: 16,
      lineHeight: 23,
      color:
        colors.liturgical,
    },
  });
