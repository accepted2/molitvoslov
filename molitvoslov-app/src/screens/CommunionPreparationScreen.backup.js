import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  api,
} from '../api';

import {
  colors,
  radius,
  spacing,
} from '../theme';


const CANON_ORDER = [
  'kanon-pokayannyy-ko-gospodu-iisusu-khristu',
  'kanon-molebnyy-ko-presvyatoy-bogoroditse',
  'kanon-angelu-hranitelu',
];


const PendingItem = ({
  title,
  subtitle,
}) => (
  <View
    style={[
      styles.item,
      styles.itemPending,
    ]}
  >
    <View
      style={styles.iconContainer}
    >
      <Text
        style={[
          styles.icon,
          styles.iconPending,
        ]}
      >
        ☦
      </Text>
    </View>

    <View
      style={styles.textContainer}
    >
      <Text
        style={[
          styles.title,
          styles.titlePending,
        ]}
      >
        {title}
      </Text>

      {!!subtitle && (
        <Text
          style={styles.description}
        >
          {subtitle}
        </Text>
      )}
    </View>

    <View
      style={styles.soonBadge}
    >
      <Text
        style={styles.soonText}
      >
        Скоро
      </Text>
    </View>
  </View>
);


export const CommunionPreparationScreen = ({
  navigation,
}) => {
  const [
    canons,
    setCanons,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState(null);


  const loadCanons =
    useCallback(async () => {
      try {
        setLoading(true);
        setError(null);

        const response =
          await api.get(
            'canons/'
          );

        setCanons(
          response.data || []
        );
      } catch (loadError) {
        console.log(
          'Ошибка загрузки канонов для подготовки ко Причастию:',
          loadError.response?.data ||
          loadError.message
        );

        setError(
          'Не удалось загрузить каноны'
        );
      } finally {
        setLoading(false);
      }
    }, []);


  useEffect(() => {
    loadCanons();
  }, [
    loadCanons,
  ]);


  const communionCanons =
    useMemo(
      () =>
        CANON_ORDER
          .map(
            slug =>
              canons.find(
                canon =>
                  canon.slug ===
                  slug
              )
          )
          .filter(Boolean),
      [
        canons,
      ]
    );


  const openCanon =
    canon => {
      navigation.navigate(
        'Canon',
        {
          canonId:
            canon.id,

          slug:
            canon.slug,

          title:
            canon.title,
        }
      );
    };

  const openPrayerRule =
    slug => {
      navigation.navigate(
        'PrayerRule',
        {
          slug,
        }
      );
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


  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={
        styles.content
      }
      showsVerticalScrollIndicator={
        false
      }
    >
      <View
        style={styles.intro}
      >
        <Text
          style={styles.introTitle}
        >
          Ко Святому Причащению
        </Text>

        <Text
          style={styles.introText}
        >
          Каноны, последование и благодарственные молитвы собраны в одном месте.
        </Text>
      </View>


      <Text
        style={styles.sectionTitle}
      >
        Каноны
      </Text>

      {communionCanons.map(
        canon => (
          <TouchableOpacity
            key={canon.slug}
            style={styles.item}
            activeOpacity={0.7}
            onPress={() =>
              openCanon(
                canon
              )
            }
          >
            <View
              style={
                styles.iconContainer
              }
            >
              <Text
                style={styles.icon}
              >
                ☦
              </Text>
            </View>

            <View
              style={
                styles.textContainer
              }
            >
              <Text
                style={styles.title}
                numberOfLines={2}
              >
                {canon.title}
              </Text>

              {!!canon.tone && (
                <Text
                  style={
                    styles.description
                  }
                >
                  {canon.tone}
                </Text>
              )}
            </View>

            <Text
              style={styles.arrow}
            >
              ›
            </Text>
          </TouchableOpacity>
        )
      )}

      {communionCanons.length !==
        CANON_ORDER.length && (
        <View
          style={styles.warning}
        >
          <Text
            style={styles.warningText}
          >
            Не все три канона найдены в базе. Проверьте импорт канонов.
          </Text>
        </View>
      )}


      <Text
        style={[
          styles.sectionTitle,
          styles.afterSectionTitle,
        ]}
      >
        Последование и молитвы
      </Text>

      <TouchableOpacity
        style={styles.item}
        activeOpacity={0.7}
        onPress={() =>
          openPrayerRule(
            'posledovanie-ko-svyatomu-prichashcheniyu'
          )
        }
      >
        <View
          style={styles.iconContainer}
        >
          <Text
            style={styles.icon}
          >
            ☦
          </Text>
        </View>

        <View
          style={styles.textContainer}
        >
          <Text
            style={styles.title}
            numberOfLines={2}
          >
            Последование ко Святому Причащению
          </Text>
        </View>

        <Text
          style={styles.arrow}
        >
          ›
        </Text>
      </TouchableOpacity>

      <PendingItem
        title="Благодарственные молитвы по Святом Причащении"
        subtitle="Добавим после подготовки парсера"
      />


      {!!error && (
        <View
          style={styles.warning}
        >
          <Text
            style={styles.warningText}
          >
            {error}
          </Text>
        </View>
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

    content: {
      paddingHorizontal:
        spacing.sm,
      paddingTop:
        spacing.sm,
      paddingBottom:
        spacing.xl,
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.background,
    },

    loadingText: {
      marginTop:
        spacing.sm,
      color:
        colors.textSecondary,
    },

    intro: {
      marginHorizontal: 2,
      marginBottom:
        spacing.lg,
      padding:
        spacing.md,
      borderRadius:
        radius.lg,
      borderWidth: 1,
      borderColor:
        colors.borderStrong,
      backgroundColor:
        colors.surfaceWarm,
    },

    introTitle: {
      fontSize: 20,
      lineHeight: 25,
      fontWeight: '700',
      color:
        colors.text,
      fontFamily: 'serif',
    },

    introText: {
      marginTop: 5,
      fontSize: 13,
      lineHeight: 19,
      color:
        colors.textSecondary,
    },

    sectionTitle: {
      marginHorizontal:
        spacing.xs,
      marginBottom:
        spacing.xs,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '700',
      color:
        colors.text,
      fontFamily: 'serif',
    },

    afterSectionTitle: {
      marginTop:
        spacing.lg,
    },

    item: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 3,
      borderRadius:
        radius.md,
      borderWidth: 1,
      borderColor:
        colors.border,
      backgroundColor:
        colors.surface,
      paddingVertical: 10,
      paddingHorizontal: 10,
    },

    itemPending: {
      backgroundColor:
        colors.surfaceMuted,
      opacity: 0.78,
    },

    iconContainer: {
      width: 30,
      alignItems: 'center',
      marginRight: 8,
    },

    icon: {
      fontSize: 22,
      color:
        colors.accent,
    },

    iconPending: {
      color:
        colors.textMuted,
    },

    textContainer: {
      flex: 1,
    },

    title: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '700',
      color:
        colors.text,
      fontFamily: 'serif',
    },

    titlePending: {
      color:
        colors.textSecondary,
    },

    description: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 17,
      color:
        colors.textSecondary,
    },

    arrow: {
      marginLeft: 6,
      fontSize: 23,
      color:
        colors.textMuted,
    },

    soonBadge: {
      marginLeft: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    soonText: {
      fontSize: 10,
      fontWeight: '800',
      color:
        colors.textMuted,
      textTransform:
        'uppercase',
    },

    warning: {
      marginTop:
        spacing.sm,
      padding:
        spacing.sm,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surfaceMuted,
    },

    warningText: {
      fontSize: 12,
      lineHeight: 17,
      color:
        colors.textSecondary,
    },
  });
