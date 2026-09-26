import React, {
  useMemo,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  StatusBar,
} from 'expo-status-bar';

import {
  AppBackground,
} from '../components/layout/AppBackground';
import {
  FixedSectionHeader,
} from '../components/navigation/FixedSectionHeader';
import {
  BottomNav,
} from '../components/navigation/BottomNav';
import {
  bibleContent,
} from '../services/bibleContent';
import {
  colors,
  radius,
} from '../theme';


export const BibleScreen = ({
  navigation,
}) => {
  const insets =
    useSafeAreaInsets();

  const headerHeight =
    insets.top + 56;

  const oldBooks =
    useMemo(
      () =>
        bibleContent.getBooks(
          'old'
        ),
      []
    );

  const newBooks =
    useMemo(
      () =>
        bibleContent.getBooks(
          'new'
        ),
      []
    );

  const openTestament =
    testament => {
      navigation.navigate(
        'BibleBooks',
        {
          testament,
        }
      );
    };

  return (
    <AppBackground
      imageOpacity={0.72}
    >
      <StatusBar
        style="light"
        translucent
        backgroundColor="transparent"
      />

      <View
        style={[
          styles.container,
          {
            paddingTop:
              headerHeight + 18,
            paddingBottom:
              82 + insets.bottom,
          },
        ]}
      >
        <Text
          style={styles.translation}
        >
          {
            bibleContent
              .translation
              ?.name ||
            'Синодальный перевод'
          }
        </Text>

        <Pressable
          onPress={() =>
            openTestament(
              'old'
            )
          }
          style={({pressed}) => [
            styles.card,
            pressed &&
              styles.pressed,
          ]}
        >
          <View style={styles.cardText}>
            <Text
              style={styles.cardTitle}
            >
              Ветхий Завет
            </Text>
            <Text
              style={
                styles.cardSubtitle
              }
            >
              {oldBooks.length}{' '}
              книг и разделов
            </Text>
          </View>
          <Text style={styles.arrow}>
            ›
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            openTestament(
              'new'
            )
          }
          style={({pressed}) => [
            styles.card,
            pressed &&
              styles.pressed,
          ]}
        >
          <View style={styles.cardText}>
            <Text
              style={styles.cardTitle}
            >
              Новый Завет
            </Text>
            <Text
              style={
                styles.cardSubtitle
              }
            >
              {newBooks.length}{' '}
              книг
            </Text>
          </View>
          <Text style={styles.arrow}>
            ›
          </Text>
        </Pressable>

        {!oldBooks.length &&
          !newBooks.length && (
            <Text
              style={
                styles.empty
              }
            >
              Данные Библии ещё не
              экспортированы.
            </Text>
          )}
      </View>

      <FixedSectionHeader
        title="Библия"
        navigation={navigation}
        topInset={insets.top}
      />

      <BottomNav
        navigation={navigation}
        active={null}
      />
    </AppBackground>
  );
};


const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 10,
      gap: 10,
    },

    translation: {
      marginHorizontal: 4,
      marginBottom: 4,
      fontSize: 13,
      fontWeight: '600',
      color:
        colors.textSecondary,
    },

    card: {
      minHeight: 82,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 16,
      paddingRight: 14,
      borderRadius:
        radius.md,
      borderWidth: 1,
      borderColor:
        'rgba(126, 82, 38, 0.20)',
      backgroundColor:
        'rgba(248, 233, 207, 0.96)',
    },

    cardText: {
      flex: 1,
    },

    cardTitle: {
      fontFamily: 'serif',
      fontSize: 21,
      lineHeight: 26,
      fontWeight: '700',
      color:
        colors.text,
    },

    cardSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color:
        colors.textSecondary,
    },

    arrow: {
      marginLeft: 12,
      fontSize: 28,
      lineHeight: 30,
      color:
        '#9A714C',
    },

    empty: {
      padding: 20,
      textAlign: 'center',
      color:
        colors.textSecondary,
    },

    pressed: {
      opacity: 0.65,
    },
  });
