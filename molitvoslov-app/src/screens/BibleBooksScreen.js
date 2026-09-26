import React, {
  useMemo,
} from 'react';
import {
  Pressable,
  SectionList,
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
  BIBLE_SECTION_TITLES,
  bibleContent,
} from '../services/bibleContent';
import {
  colors,
} from '../theme';


const NEW_SECTION_ORDER = [
  'gospels',
  'acts',
  'epistles',
  'revelation',
];


export const BibleBooksScreen = ({
  route,
  navigation,
}) => {
  const testament =
    route.params?.testament ===
      'new'
      ? 'new'
      : 'old';

  const insets =
    useSafeAreaInsets();

  const headerHeight =
    insets.top + 56;

  const books =
    useMemo(
      () =>
        bibleContent.getBooks(
          testament
        ),
      [
        testament,
      ]
    );

  const sections =
    useMemo(
      () => {
        if (
          testament ===
          'old'
        ) {
          return [
            {
              key: 'old',
              title:
                BIBLE_SECTION_TITLES
                  .old,
              data: books,
            },
          ];
        }

        return NEW_SECTION_ORDER
          .map(
            key => ({
              key,
              title:
                BIBLE_SECTION_TITLES[
                  key
                ],
              data:
                books.filter(
                  book =>
                    book.section ===
                    key
                ),
            })
          )
          .filter(
            section =>
              section.data.length
          );
      },
      [
        books,
        testament,
      ]
    );

  const title =
    testament ===
      'new'
      ? 'Новый Завет'
      : 'Ветхий Завет';

  return (
    <AppBackground
      imageOpacity={0.72}
    >
      <StatusBar
        style="light"
        translucent
        backgroundColor="transparent"
      />

      <SectionList
        sections={sections}
        keyExtractor={
          item =>
            String(
              item.id
            )
        }
        stickySectionHeadersEnabled={
          false
        }
        contentContainerStyle={{
          paddingTop:
            headerHeight + 14,
          paddingBottom:
            92 + insets.bottom,
        }}
        renderSectionHeader={({
          section,
        }) => (
          <View
            style={
              styles.sectionHeader
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({item}) => (
          <Pressable
            onPress={() =>
              navigation.navigate(
                'BibleBook',
                {
                  bookId:
                    item.id,
                }
              )
            }
            style={({pressed}) => [
              styles.item,
              pressed &&
                styles.pressed,
            ]}
          >
            <View
              style={
                styles.itemText
              }
            >
              <Text
                style={
                  styles.bookName
                }
              >
                {
                  item.short_name ||
                  item.name
                }
              </Text>

              <Text
                style={
                  styles.chapterCount
                }
              >
                {
                  item.chapters
                    ?.length ||
                  0
                }{' '}
                глав
              </Text>
            </View>

            <Text
              style={styles.arrow}
            >
              ›
            </Text>
          </Pressable>
        )}
      />

      <FixedSectionHeader
        title={title}
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
    sectionHeader: {
      paddingTop: 8,
      paddingBottom: 5,
      paddingHorizontal: 14,
    },

    sectionTitle: {
      fontFamily: 'serif',
      fontSize: 18,
      fontWeight: '700',
      color:
        colors.accentDark,
    },

    item: {
      minHeight: 58,
      marginHorizontal: 10,
      marginVertical: 2,
      paddingLeft: 14,
      paddingRight: 10,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 13,
      borderWidth: 1,
      borderColor:
        'rgba(126, 82, 38, 0.18)',
      backgroundColor:
        'rgba(248, 233, 207, 0.96)',
    },

    itemText: {
      flex: 1,
    },

    bookName: {
      fontFamily: 'serif',
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '700',
      color:
        colors.text,
    },

    chapterCount: {
      marginTop: 2,
      fontSize: 12,
      color:
        colors.textSecondary,
    },

    arrow: {
      marginLeft: 10,
      fontSize: 24,
      color:
        '#9A714C',
    },

    pressed: {
      opacity: 0.62,
    },
  });
