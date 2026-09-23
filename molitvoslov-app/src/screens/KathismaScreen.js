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


const GLORY_TEXT = `Слава Отцу и Сыну и Святому Духу.
И ныне и присно и во веки веков. Аминь.

Аллилуиа, аллилуиа, аллилуиа, слава Тебе, Боже. ×3
Господи, помилуй. ×3

Слава Отцу и Сыну и Святому Духу.

[Здесь можно прочитать прошение о здравии / об упокоении и помянуть имена.]

И ныне и присно и во веки веков. Аминь.`;


export default function KathismaScreen({
  route,
  navigation,
}) {
  const {
    kathismaNumber,
    kathismaTitle,
  } = route.params;

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
            item.anchor_type ===
              'psalm' &&
            Number(
              item.anchor_id
            ) ===
              Number(
                psalmId
              )
        );


  const togglePsalmSaved =
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
        !actionKey
          ?.startsWith(
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
      };
    };


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
              'psalm_verse',

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


        const attachSaved = ({
          syntheticId,
          anchorType,
          anchorId,
          language,
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


        const makeBlock = ({
          text,
          anchorType,
          anchorId,
          language,
          itemTitle,
          fullSaveType,
          metadata,
          className,
          sectionName,
          label,
        }) => {
          const syntheticId =
            nextBlockId++;

          attachSaved({
            syntheticId,
            anchorType,
            anchorId,
            language,
            sectionName,
          });

          return {
            id:
              syntheticId,

            text:
              text || '',

            label:
              label || '',

            className:
              className ||
              'psalter',

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
          psalm => {
            const psalmSaved =
              savedItems.some(
                item =>
                  item.anchor_type ===
                    'psalm' &&
                  Number(
                    item.anchor_id
                  ) ===
                    Number(
                      psalm.id
                    )
              );

            (
              psalm.verses ||
              []
            ).forEach(
              (
                verse,
                verseIndex
              ) => {
                const commonMetadata = {
                  kathisma_number:
                    kathisma.number,

                  kathisma_title:
                    kathisma.title ||
                    '',

                  psalm_id:
                    psalm.id,

                  psalm_number:
                    psalm.number,

                  verse_number:
                    verse.number,
                };

                const blocks =
                  [];

                if (
                  verse.church_slavonic
                ) {
                  blocks.push(
                    makeBlock({
                      text:
                        verse
                          .church_slavonic,

                      anchorType:
                        'psalm_verse',

                      anchorId:
                        verse.id,

                      language:
                        'church',

                      itemTitle:
                        `Псалом ${psalm.number}, стих ${verse.number}`,

                      fullSaveType:
                        'verse',

                      metadata: {
                        ...commonMetadata,

                        language:
                          'church',
                      },

                      className:
                        'psalter',

                      label:
                        verseIndex ===
                          0
                          ? 'Церковнославянский'
                          : '',
                    })
                  );
                }

                if (
                  verse.russian
                ) {
                  blocks.push(
                    makeBlock({
                      text:
                        verse.russian,

                      anchorType:
                        'psalm_verse',

                      anchorId:
                        verse.id,

                      language:
                        'russian',

                      itemTitle:
                        `Псалом ${psalm.number}, стих ${verse.number}`,

                      fullSaveType:
                        'verse',

                      metadata: {
                        ...commonMetadata,

                        language:
                          'russian',
                      },

                      className:
                        'psalter secondary',

                      label:
                        verseIndex ===
                          0
                          ? 'Русский'
                          : '',
                    })
                  );
                }

                sections.push({
                  progressAnchorId:
                    Number(
                      verse.id
                    ),

                  trackProgress:
                    true,

                  title:
                    verseIndex ===
                      0
                      ? `Псалом ${psalm.number}`
                      : '',

                  action:
                    verseIndex ===
                      0
                      ? {
                          key:
                            `psalm:${psalm.id}`,

                          label:
                            psalmSaved
                              ? 'В избранном'
                              : 'В избранное',

                          active:
                            psalmSaved,
                        }
                      : null,

                  rows: [
                    {
                      layout:
                        blocks.length >
                          1
                          ? 'parallel'
                          : 'stack',

                      blocks,
                    },
                  ],
                });


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
                  const gloryBlock =
                    makeBlock({
                      text:
                        GLORY_TEXT,

                      anchorType:
                        'kathisma_glory',

                      anchorId:
                        glory.id,

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
                          glory.number,
                      },

                      className:
                        '',
                    });

                  sections.push({
                    progressAnchorId:
                      Number(
                        verse.id
                      ),

                    trackProgress:
                      false,

                    title:
                      'Слава',

                    rows: [
                      {
                        layout:
                          'stack',

                        blocks: [
                          gloryBlock,
                        ],
                      },
                    ],
                  });
                }
              }
            );


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
              const block =
                makeBlock({
                  text:
                    GLORY_TEXT,

                  anchorType:
                    'kathisma_glory',

                  anchorId:
                    psalmGlory.id,

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
                      psalmGlory.number,
                  },

                  className:
                    '',
                });

              const lastVerse =
                psalm.verses?.[
                  psalm.verses.length -
                    1
                ];

              sections.push({
                progressAnchorId:
                  Number(
                    lastVerse?.id ||
                    0
                  ),

                trackProgress:
                  false,

                title:
                  'Слава',

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
          }
        );


        if (
          kathisma.prayers_after
        ) {
          const block =
            makeBlock({
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

              className:
                '',

              sectionName:
                'prayers_after',
            });

          const lastPsalm =
            kathisma.psalms?.[
              kathisma.psalms.length -
                1
            ];

          const lastVerse =
            lastPsalm?.verses?.[
              lastPsalm.verses.length -
                1
            ];

          sections.push({
            progressAnchorId:
              Number(
                lastVerse?.id ||
                0
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
            'psalm_verse',

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
      onAction={
        togglePsalmSaved
      }
    />
  );
}


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

    error: {
      paddingHorizontal: 24,
      textAlign: 'center',
      fontSize: 16,
      lineHeight: 23,
      color:
        colors.liturgical,
    },
  });
