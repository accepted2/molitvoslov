import React from 'react';
import {
  FlatList,
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
} from '../theme';


export const BibleBookScreen = ({
  route,
  navigation,
}) => {
  const book =
    bibleContent.getBook(
      route.params?.bookId
    );

  const insets =
    useSafeAreaInsets();

  const headerHeight =
    insets.top + 56;

  if (!book) {
    return (
      <View
        style={styles.center}
      >
        <Text
          style={styles.error}
        >
          Книга не найдена
        </Text>
      </View>
    );
  }

  return (
    <AppBackground
      imageOpacity={0.72}
    >
      <StatusBar
        style="light"
        translucent
        backgroundColor="transparent"
      />

      <FlatList
        data={
          book.chapters ||
          []
        }
        numColumns={4}
        keyExtractor={
          item =>
            String(
              item.id
            )
        }
        columnWrapperStyle={
          styles.row
        }
        contentContainerStyle={{
          paddingTop:
            headerHeight + 16,
          paddingHorizontal: 10,
          paddingBottom:
            92 + insets.bottom,
        }}
        ListHeaderComponent={
          <Text
            style={styles.fullName}
          >
            {book.name}
          </Text>
        }
        renderItem={({item}) => (
          <Pressable
            onPress={() =>
              navigation.navigate(
                'BibleChapter',
                {
                  bookId:
                    book.id,
                  chapterNumber:
                    item.number,
                }
              )
            }
            style={({pressed}) => [
              styles.chapter,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.chapterNumber
              }
            >
              {item.number}
            </Text>
          </Pressable>
        )}
      />

      <FixedSectionHeader
        title={
          book.short_name ||
          book.name
        }
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
    row: {
      gap: 8,
    },

    fullName: {
      marginHorizontal: 4,
      marginBottom: 13,
      fontFamily: 'serif',
      fontSize: 15,
      lineHeight: 21,
      color:
        colors.textSecondary,
    },

    chapter: {
      flex: 1,
      minHeight: 52,
      marginBottom: 8,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        'rgba(126, 82, 38, 0.18)',
      backgroundColor:
        'rgba(248, 233, 207, 0.96)',
    },

    chapterNumber: {
      fontFamily: 'serif',
      fontSize: 18,
      fontWeight: '700',
      color:
        colors.text,
    },

    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.background,
    },

    error: {
      fontSize: 16,
      color:
        colors.liturgical,
    },

    pressed: {
      opacity: 0.62,
    },
  });
