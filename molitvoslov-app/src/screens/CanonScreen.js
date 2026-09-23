import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
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


const SECTION_LABELS = {
  irmos:
    'Ирмос',

  refrain:
    'Припев',

  troparion:
    'Тропарь',

  theotokion:
    'Богородичен',

  glory:
    'Слава',

  now:
    'И ныне',

  sedalen:
    'Седален',

  kontakion:
    'Кондак',

  ikos:
    'Икос',

  svetilen:
    'Светилен',

  prayer:
    'Молитва',

  other:
    'Текст',
};


const SwitchButton = ({
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
      styles.switchButton,

      active &&
        styles
          .switchButtonActive,

      disabled &&
        styles
          .switchButtonDisabled,

      pressed &&
        !disabled &&
        styles.pressed,
    ]}
  >
    <Text
      style={[
        styles.switchButtonText,

        active &&
          styles
            .switchButtonTextActive,
      ]}
      numberOfLines={1}
    >
      {title}
    </Text>
  </Pressable>
);


export const CanonScreen = ({
  route,
}) => {
  const {
    canonId,
    slug,
    title,
  } = route.params;

  const [
    canon,
    setCanon,
  ] = useState(null);

  const [
    savedItems,
    setSavedItems,
  ] = useState([]);

  const savedItemsRef =
    useRef([]);

  const [
    activeVariant,
    setActiveVariant,
  ] = useState(1);

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
      'canon',

    sourceId:
      canonId,
  });


  useEffect(() => {
    loadCanon();
  }, [
    slug,
    canonId,
  ]);


  const loadCanon =
    async () => {
      try {
        setLoading(
          true
        );

        setError(
          null
        );

        setCanon(
          null
        );

        setSavedItems(
          []
        );

        savedItemsRef.current =
          [];

        const [
          response,
          saved,
        ] = await Promise.all([
          api.get(
            `canons/${slug}/`
          ),

          getSavedItems({
            source_type:
              'canon',

            source_id:
              canonId,
          }),
        ]);

        setCanon(
          response.data
        );

        savedItemsRef.current =
          saved;

        setSavedItems(
          saved
        );
      } catch (loadError) {
        console.log(
          'Ошибка загрузки канона:',
          loadError.response?.data ||
          loadError.message
        );

        setError(
          'Не удалось загрузить канон'
        );
      } finally {
        setLoading(
          false
        );
      }
    };


  const variants =
    useMemo(
      () => {
        const values =
          new Set(
            (
              canon?.sections ||
              []
            ).map(
              section =>
                Number(
                  section.variant ||
                  1
                )
            )
          );

        return [
          ...values,
        ].sort(
          (
            left,
            right
          ) =>
            left - right
        );
      },
      [
        canon,
      ]
    );


  useEffect(() => {
    if (
      !canon ||
      !variants.length
    ) {
      return;
    }

    const progressSection =
      (
        canon.sections ||
        []
      ).find(
        section =>
          Number(
            section.id
          ) ===
            Number(
              savedProgress
                ?.anchor_id
            )
      );

    if (
      progressSection
    ) {
      setActiveVariant(
        Number(
          progressSection.variant ||
          1
        )
      );

      return;
    }

    if (
      !variants.includes(
        activeVariant
      )
    ) {
      setActiveVariant(
        variants[0]
      );
    }
  }, [
    canon,
    savedProgress,
    variants,
  ]);


  const activeSections =
    useMemo(
      () =>
        (
          canon?.sections ||
          []
        )
          .filter(
            section =>
              Number(
                section.variant ||
                1
              ) ===
                Number(
                  activeVariant
                )
          )
          .sort(
            (
              left,
              right
            ) =>
              Number(
                left.order ||
                0
              ) -
              Number(
                right.order ||
                0
              )
          ),
      [
        canon,
        activeVariant,
      ]
    );


  const hasRussianTranslation =
    useMemo(
      () =>
        activeSections.some(
          section =>
            !!section.text
              ?.translation
              ?.trim()
        ),
      [
        activeSections,
      ]
    );


  useEffect(() => {
    if (
      canon &&
      !hasRussianTranslation &&
      viewMode !==
        MODE_CHURCH
    ) {
      setViewMode(
        MODE_CHURCH
      );
    }
  }, [
    canon,
    hasRussianTranslation,
    viewMode,
  ]);


  const handleAction =
    async actionKey => {
      if (
        !canon ||
        actionKey !==
          `canon:${canon.id}`
      ) {
        return null;
      }

      const existing =
        savedItemsRef.current
          .find(
            item =>
              item.anchor_type ===
                'canon' &&
              Number(
                item.anchor_id
              ) ===
                Number(
                  canon.id
                ) &&
              item.save_type ===
                'canon'
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
            'canon',

          source_type:
            'canon',

          source_id:
            canon.id,

          anchor_type:
            'canon',

          anchor_id:
            canon.id,

          source_title:
            canon.title ||
            title ||
            'Канон',

          item_title:
            canon.title ||
            title ||
            'Канон',

          text:
            '',

          metadata: {
            slug:
              canon.slug ||
              slug,

            variant:
              activeVariant,
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


  const documentData =
    useMemo(
      () => {
        if (!canon) {
          return {
            title:
              title ||
              'Канон',

            description:
              '',

            progressAnchorType:
              'canon_section',

            savedItems: [],

            sections: [],
          };
        }

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

        let nextBlockId =
          1;

        let previousOde =
          null;

        const normalizedSaved =
          [];

        const sections =
          [];


        const makeBlock = ({
          section,
          text,
          language,
          className,
          label,
        }) => {
          const syntheticId =
            nextBlockId++;

          savedItems
            .filter(
              item => {
                if (
                  item.anchor_type !==
                    'canon_section' ||
                  Number(
                    item.anchor_id
                  ) !==
                    Number(
                      section.id
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
                  metadata.language &&
                  metadata.language !==
                    language
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

          return {
            id:
              syntheticId,

            text:
              text ||
              '',

            label:
              label ||
              '',

            className,

            sourceType:
              'canon',

            sourceId:
              canon.id,

            anchorType:
              'canon_section',

            anchorId:
              section.id,

            sourceTitle:
              canon.title ||
              'Канон',

            itemTitle:
              section.heading ||
              SECTION_LABELS[
                section.section_type
              ] ||
              'Раздел канона',

            fullSaveType:
              section.section_type ===
                'prayer'
                ? 'prayer'
                : 'section',

            metadata: {
              slug:
                canon.slug ||
                slug,

              variant:
                activeVariant,

              ode_number:
                section.ode_number,

              section_type:
                section.section_type,

              heading:
                section.heading ||
                '',

              language,
            },
          };
        };


        activeSections.forEach(
          section => {
            const church =
              section.text
                ?.content
                ?.trim() ||
              '';

            const russian =
              section.text
                ?.translation
                ?.trim() ||
              '';

            const label =
              section.heading ||
              SECTION_LABELS[
                section.section_type
              ] ||
              '';

            const blocks =
              [];

            if (
              showChurch &&
              church
            ) {
              blocks.push(
                makeBlock({
                  section,

                  text:
                    church,

                  language:
                    'church',

                  className:
                    'canon-church',

                  label:
                    label,
                })
              );
            }

            if (
              showRussian &&
              russian
            ) {
              blocks.push(
                makeBlock({
                  section,

                  text:
                    russian,

                  language:
                    'russian',

                  className:
                    'canon-russian',

                  label:
                    showChurch
                      ? 'Русский'
                      : label,
                })
              );
            }

            if (!blocks.length) {
              return;
            }

            const odeNumber =
              section.ode_number
                ? Number(
                    section.ode_number
                  )
                : null;

            let sectionTitle =
              '';

            if (
              odeNumber &&
              odeNumber !==
                previousOde
            ) {
              sectionTitle =
                `Песнь ${odeNumber}`;

              previousOde =
                odeNumber;
            } else if (
              !odeNumber
            ) {
              sectionTitle =
                label;

              previousOde =
                null;
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


        const wholeSaved =
          savedItems.find(
            item =>
              item.anchor_type ===
                'canon' &&
              Number(
                item.anchor_id
              ) ===
                Number(
                  canon.id
                ) &&
              item.save_type ===
                'canon'
          );


        return {
          title:
            canon.title ||
            title ||
            'Канон',

          description:
            [
              canon.tone,
              variants.length > 1
                ? `Вариант ${activeVariant}`
                : '',
            ]
              .filter(
                Boolean
              )
              .join(
                ' · '
              ),

          action: {
            key:
              `canon:${canon.id}`,

            label:
              wholeSaved
                ? 'В избранном'
                : 'В избранное',

            active:
              !!wholeSaved,

            savedItemId:
              wholeSaved
                ?.id ||
              null,

            highlightContent:
              true,
          },

          progressAnchorType:
            'canon_section',

          savedItems:
            normalizedSaved,

          sections,
        };
      },
      [
        canon,
        title,
        slug,
        activeSections,
        activeVariant,
        variants,
        savedItems,
        viewMode,
      ]
    );


  const readerProgress =
    useMemo(
      () => {
        if (
          !savedProgress
        ) {
          return null;
        }

        const belongsToVariant =
          activeSections.some(
            section =>
              Number(
                section.id
              ) ===
                Number(
                  savedProgress
                    .anchor_id
                )
          );

        return belongsToVariant
          ? savedProgress
          : null;
      },
      [
        activeSections,
        savedProgress,
      ]
    );


  if (
    loading ||
    (
      canon &&
      !progressReady
    )
  ) {
    return (
      <View
        style={
          styles.center
        }
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
    !canon
  ) {
    return (
      <View
        style={
          styles.center
        }
      >
        <Text
          style={
            styles.error
          }
        >
          {
            error ||
            'Канон не найден'
          }
        </Text>
      </View>
    );
  }


  return (
    <View
      style={
        styles.container
      }
    >
      {variants.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.variantSwitcher
          }
        >
          {variants.map(
            variant => (
              <Pressable
                key={
                  variant
                }
                onPress={() =>
                  setActiveVariant(
                    variant
                  )
                }
                style={({pressed}) => [
                  styles.variantButton,

                  Number(
                    activeVariant
                  ) ===
                    Number(
                      variant
                    ) &&
                    styles
                      .variantButtonActive,

                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.variantButtonText,

                    Number(
                      activeVariant
                    ) ===
                      Number(
                        variant
                      ) &&
                      styles
                        .variantButtonTextActive,
                  ]}
                >
                  Вариант{' '}
                  {variant}
                </Text>
              </Pressable>
            )
          )}
        </ScrollView>
      )}

      <View
        style={
          styles.languageSwitcher
        }
      >
        <SwitchButton
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

        <SwitchButton
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

        <SwitchButton
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
          readerProgress
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

    variantSwitcher: {
      paddingHorizontal:
        spacing.md,
      paddingTop:
        spacing.sm,
      paddingBottom: 2,
      gap: 6,
    },

    variantButton: {
      minHeight: 34,
      justifyContent:
        'center',
      paddingHorizontal: 12,
      borderRadius:
        radius.sm,
      borderWidth: 1,
      borderColor:
        colors.border,
      backgroundColor:
        colors.surface,
    },

    variantButtonActive: {
      borderColor:
        colors.text,
      backgroundColor:
        colors.text,
    },

    variantButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color:
        colors.textSecondary,
    },

    variantButtonTextActive: {
      color:
        colors.white,
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

    switchButton: {
      flex: 1,
      minHeight: 36,
      alignItems:
        'center',
      justifyContent:
        'center',
      borderRadius:
        radius.sm,
    },

    switchButtonActive: {
      backgroundColor:
        colors.text,
    },

    switchButtonDisabled: {
      opacity: 0.35,
    },

    switchButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color:
        colors.textSecondary,
    },

    switchButtonTextActive: {
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
