import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
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
  radius,
  spacing,
} from '../theme';


const MODE_CHURCH =
  'church';

const MODE_BOTH =
  'both';

const MODE_RUSSIAN =
  'russian';


const getSectionTitle =
  section => {
    if (
      section.section_type ===
      'kontakion'
    ) {
      return `Кондак ${section.number}`;
    }

    if (
      section.section_type ===
      'ikos'
    ) {
      return `Икос ${section.number}`;
    }

    if (
      section.section_type ===
      'prayer'
    ) {
      return section.number
        ? `Молитва ${section.number}`
        : 'Молитва';
    }

    return (
      section.text?.title ||
      ''
    );
  };


const LanguageButton = ({
  title,
  active,
  disabled,
  onPress,
}) => (
  <Pressable
    disabled={
      disabled
    }
    onPress={
      onPress
    }
    style={({pressed}) => [
      styles.languageButton,

      active &&
        styles
          .languageButtonActive,

      disabled &&
        styles
          .languageButtonDisabled,

      pressed &&
        !disabled &&
        styles.pressed,
    ]}
  >
    <Text
      style={[
        styles.languageButtonText,

        active &&
          styles
            .languageButtonTextActive,
      ]}
    >
      {title}
    </Text>
  </Pressable>
);


export const AkathistScreen = ({
  route,
}) => {
  const {
    akathistId,
    slug,
    title,
  } = route.params;

  const [
    akathist,
    setAkathist,
  ] = useState(null);

  const [
    savedItems,
    setSavedItems,
  ] = useState([]);

  const savedItemsRef =
    useRef([]);

  const [
    viewMode,
    setViewMode,
  ] = useState(
    MODE_BOTH
  );

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
      'akathist',

    sourceId:
      akathistId,
  });


  useEffect(() => {
    loadAkathist();
  }, [
    slug,
    akathistId,
  ]);


  const loadAkathist =
    async () => {
      try {
        setLoading(true);
        setError(null);
        setAkathist(null);
        setSavedItems([]);
        savedItemsRef.current =
          [];

        const [
          response,
          saved,
        ] = await Promise.all([
          api.get(
            `akathists/${slug}/`
          ),

          getSavedItems({
            source_type:
              'akathist',

            source_id:
              akathistId,
          }),
        ]);

        setAkathist(
          response.data
        );

        savedItemsRef.current =
          saved;

        setSavedItems(
          saved
        );
      } catch (loadError) {
        console.log(
          'Ошибка загрузки акафиста:',
          loadError.response?.data ||
          loadError.message
        );

        setError(
          'Не удалось загрузить акафист'
        );
      } finally {
        setLoading(
          false
        );
      }
    };


  const hasRussianTranslation =
    useMemo(
      () => {
        if (!akathist) {
          return false;
        }

        const specialTexts = [
          akathist.troparion,
          akathist.kontakion_before,
          akathist.common_rule
            ?.opening,
          akathist.common_rule
            ?.ending,
        ];

        return (
          specialTexts.some(
            item =>
              !!item
                ?.translation
                ?.trim()
          ) ||
          (
            akathist.sections ||
            []
          ).some(
            section =>
              !!section.text
                ?.translation
                ?.trim()
          )
        );
      },
      [
        akathist,
      ]
    );


  useEffect(() => {
    if (
      akathist &&
      !hasRussianTranslation &&
      viewMode !==
        MODE_CHURCH
    ) {
      setViewMode(
        MODE_CHURCH
      );
    }
  }, [
    akathist,
    hasRussianTranslation,
    viewMode,
  ]);


  const handleAction =
    async actionKey => {
      if (
        !actionKey?.startsWith(
          'akathist:'
        ) ||
        !akathist
      ) {
        return null;
      }

      const existing =
        savedItemsRef.current
          .find(
            item =>
              item.anchor_type ===
                'akathist' &&
              Number(
                item.anchor_id
              ) ===
                Number(
                  akathist.id
                ) &&
              item.save_type ===
                'akathist'
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
            'akathist',

          source_type:
            'akathist',

          source_id:
            akathist.id,

          anchor_type:
            'akathist',

          anchor_id:
            akathist.id,

          source_title:
            akathist.title ||
            title ||
            'Акафист',

          item_title:
            akathist.title ||
            title ||
            'Акафист',

          text:
            '',

          metadata: {
            slug:
              akathist.slug ||
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
      };
    };


  const documentData =
    useMemo(
      () => {
        if (!akathist) {
          return {
            title:
              title ||
              'Акафист',

            description:
              '',

            progressAnchorType:
              'akathist_section',

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

        const showChurch =
          viewMode ===
            MODE_CHURCH ||
          viewMode ===
            MODE_BOTH;

        const showRussian =
          viewMode ===
            MODE_RUSSIAN ||
          viewMode ===
            MODE_BOTH;

        const attachSaved = ({
          syntheticId,
          anchorType,
          anchorId,
          language,
          segment,
          special,
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
                  special &&
                  metadata.special &&
                  metadata.special !==
                    special
                ) {
                  return false;
                }

                if (
                  segment &&
                  metadata.segment &&
                  ![
                    segment,
                    'whole',
                    'prayer',
                  ].includes(
                    metadata.segment
                  )
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
          language,
          anchorType,
          anchorId,
          itemTitle,
          fullSaveType,
          metadata,
          className,
          special,
        }) => {
          const syntheticId =
            nextBlockId++;

          attachSaved({
            syntheticId,
            anchorType,
            anchorId,
            language,
            segment:
              metadata.segment,
            special,
          });

          return {
            id:
              syntheticId,

            text,

            className,

            sourceType:
              'akathist',

            sourceId:
              akathistId,

            anchorType,

            anchorId,

            sourceTitle:
              akathist.title ||
              title ||
              'Акафист',

            itemTitle,

            fullSaveType,

            metadata,

            accentWords: [
              'Радуйся',
              'Иисусе',
              'Аллилуиа',
            ],
          };
        };


        const addSpecial = (
          textObject,
          heading,
          specialKey
        ) => {
          if (!textObject) {
            return;
          }

          const blocks =
            [];

          const church =
            textObject.content
              ?.trim() ||
            '';

          const russian =
            textObject.translation
              ?.trim() ||
            '';

          if (
            showChurch &&
            church
          ) {
            blocks.push(
              makeBlock({
                text:
                  church,

                language:
                  'church',

                anchorType:
                  'akathist_special',

                anchorId:
                  textObject.id,

                itemTitle:
                  heading,

                fullSaveType:
                  'text',

                metadata: {
                  slug,
                  special:
                    specialKey,
                  segment:
                    'whole',
                  language:
                    'church',
                },

                className:
                  'akathist-church',

                special:
                  specialKey,
              })
            );
          }

          if (
            showRussian &&
            russian
          ) {
            blocks.push(
              makeBlock({
                text:
                  russian,

                language:
                  'russian',

                anchorType:
                  'akathist_special',

                anchorId:
                  textObject.id,

                itemTitle:
                  heading,

                fullSaveType:
                  'text',

                metadata: {
                  slug,
                  special:
                    specialKey,
                  segment:
                    'whole',
                  language:
                    'russian',
                },

                className:
                  'akathist-russian',

                special:
                  specialKey,
              })
            );
          }

          if (!blocks.length) {
            return;
          }

          sections.push({
            progressAnchorId:
              0,

            trackProgress:
              false,

            title:
              heading,

            rows:
              blocks.map(
                block => ({
                  layout:
                    'stack',

                  blocks: [
                    block,
                  ],
                })
              ),
          });
        };


        addSpecial(
          akathist.common_rule
            ?.opening,
          'Молитвы перед чтением акафиста',
          'opening'
        );

        addSpecial(
          akathist.troparion,
          'Тропарь',
          'troparion'
        );

        addSpecial(
          akathist.kontakion_before,
          'Кондак',
          'kontakion_before'
        );


        (
          akathist.sections ||
          []
        ).forEach(
          section => {
            const church =
              section.text?.content
                ?.trim() ||
              '';

            const russian =
              section.text
                ?.translation
                ?.trim() ||
              '';

            const blocks =
              [];

            const sectionTitle =
              getSectionTitle(
                section
              );

            const fullSaveType =
              section.section_type ===
                'prayer'
                ? 'prayer'
                : 'section';

            if (
              showChurch &&
              church
            ) {
              blocks.push(
                makeBlock({
                  text:
                    church,

                  language:
                    'church',

                  anchorType:
                    'akathist_section',

                  anchorId:
                    section.id,

                  itemTitle:
                    sectionTitle,

                  fullSaveType,

                  metadata: {
                    slug,
                    section_id:
                      section.id,
                    segment:
                      'whole',
                    language:
                      'church',
                  },

                  className:
                    'akathist-church',
                })
              );
            }

            if (
              showRussian &&
              russian
            ) {
              blocks.push(
                makeBlock({
                  text:
                    russian,

                  language:
                    'russian',

                  anchorType:
                    'akathist_section',

                  anchorId:
                    section.id,

                  itemTitle:
                    sectionTitle,

                  fullSaveType,

                  metadata: {
                    slug,
                    section_id:
                      section.id,
                    segment:
                      'whole',
                    language:
                      'russian',
                  },

                  className:
                    'akathist-russian',
                })
              );
            }

            if (!blocks.length) {
              return;
            }

            sections.push({
              progressAnchorId:
                Number(
                  section.id
                ),

              trackProgress:
                true,

              title:
                sectionTitle,

              note:
                section.note ||
                '',

              rows:
                blocks.map(
                  block => ({
                    layout:
                      'stack',

                    blocks: [
                      block,
                    ],
                  })
                ),
            });
          }
        );


        addSpecial(
          akathist.common_rule
            ?.ending,
          'Окончание чтения акафиста',
          'ending'
        );


        const wholeAkathistSaved =
          savedItems.some(
            item =>
              item.anchor_type ===
                'akathist' &&
              Number(
                item.anchor_id
              ) ===
                Number(
                  akathist.id
                ) &&
              item.save_type ===
                'akathist'
          );

        return {
          title:
            akathist.title ||
            title ||
            'Акафист',

          description:
            akathist.description ||
            '',

          action: {
            key:
              `akathist:${akathist.id}`,

            label:
              wholeAkathistSaved
                ? 'В избранном'
                : 'В избранное',

            active:
              wholeAkathistSaved,
          },

          progressAnchorType:
            'akathist_section',

          savedItems:
            normalizedSaved,

          sections,
        };
      },
      [
        akathist,
        akathistId,
        hasRussianTranslation,
        savedItems,
        slug,
        title,
        viewMode,
      ]
    );


  if (
    loading ||
    (
      akathist &&
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


  if (
    error ||
    !akathist
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
            'Акафист не найден'
          }
        </Text>
      </View>
    );
  }


  return (
    <View
      style={styles.container}
    >
      <View
        style={
          styles.languageSwitcher
        }
      >
        <LanguageButton
          title="ЦС"
          active={
            viewMode ===
            MODE_CHURCH
          }
          onPress={() =>
            setViewMode(
              MODE_CHURCH
            )
          }
        />

        <LanguageButton
          title="ЦС + Рус."
          active={
            viewMode ===
            MODE_BOTH
          }
          disabled={
            !hasRussianTranslation
          }
          onPress={() =>
            setViewMode(
              MODE_BOTH
            )
          }
        />

        <LanguageButton
          title="Рус."
          active={
            viewMode ===
            MODE_RUSSIAN
          }
          disabled={
            !hasRussianTranslation
          }
          onPress={() =>
            setViewMode(
              MODE_RUSSIAN
            )
          }
        />
      </View>

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
          handleAction
        }
      />
    </View>
  );
};


const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        colors.background,
    },

    languageSwitcher: {
      flexDirection:
        'row',
      marginHorizontal:
        spacing.md,
      marginTop:
        spacing.sm,
      marginBottom: 4,
      padding: 4,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surfaceMuted,
    },

    languageButton: {
      flex: 1,
      minHeight: 36,
      alignItems:
        'center',
      justifyContent:
        'center',
      borderRadius:
        radius.sm,
    },

    languageButtonActive: {
      backgroundColor:
        colors.text,
    },

    languageButtonDisabled: {
      opacity: 0.35,
    },

    languageButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color:
        colors.textSecondary,
    },

    languageButtonTextActive: {
      color:
        colors.white,
    },

    pressed: {
      opacity: 0.65,
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
      fontSize: 15,
      lineHeight: 22,
    },
  });
