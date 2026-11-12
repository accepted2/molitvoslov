import React, {useMemo} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {useFocusEffect} from '@react-navigation/native';

import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {BottomNav} from '../components/navigation/BottomNav';
import {bibleContent} from '../services/bibleContent';
import {useBibleContentGeneration} from '../hooks/useBibleContentGeneration';
import {colors, radius} from '../theme';
import {useLanguage} from '../context/LanguageContext';
import {bibleUiText, isTraditionalBible, traditionalBibleTextStyle} from '../services/bibleUi';
import {getPreferredBibleTranslation, savePreferredBibleTranslation} from '../services/bibleTranslationPreference';

export const BibleScreen = ({navigation}) => {
  const {t} = useLanguage();
  const bibleGeneration = useBibleContentGeneration();
  const [translationCode, setTranslationCode] = React.useState('rst');
  const isTraditional = isTraditionalBible(translationCode);
  const ui = (key, fallback, params) => bibleUiText(translationCode, key, fallback, params);

  useFocusEffect(React.useCallback(() => {
    let active = true;
    getPreferredBibleTranslation().then((code) => {if (active) setTranslationCode(code);});
    return () => {active = false;};
  }, []));
  const selectTranslation = (code) => {
    setTranslationCode(code);
    savePreferredBibleTranslation(code).catch(() => {});
  };
  const insets = useSafeAreaInsets();

  const [headerHeight, setHeaderHeight] = React.useState(insets.top + 56);
  React.useEffect(() => {setHeaderHeight(insets.top + 56);}, [insets.top]);

  const oldBooks = useMemo(
    () => bibleContent.getBooks('old', translationCode),
    [bibleGeneration, translationCode]
  );
  const newBooks = useMemo(
    () => bibleContent.getBooks('new', translationCode),
    [bibleGeneration, translationCode]
  );

  const openTestament = (testament) => {
    navigation.navigate('BibleBooks', {
      testament,
      translationCode,
    });
  };

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <View
        style={[
          styles.container,
          {
            paddingTop: headerHeight + 18,
            paddingBottom: 82 + insets.bottom,
          },
        ]}
      >
        <View style={styles.translationPicker}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Русская Синодальная Библия"
            onPress={() => selectTranslation('rst')}
            style={[styles.translationOption, translationCode === 'rst' && styles.translationSelected]}
          >
            <Text style={styles.translationOptionText}>РУ</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Церковнославянская Библия"
            onPress={() => selectTranslation('csl_traditional')}
            style={[
              styles.translationOption,
              translationCode === 'csl_traditional' && styles.translationSelected,
            ]}
          >
            <Text style={[styles.translationOptionText, isTraditional && traditionalBibleTextStyle]}>ЦС традиционный</Text>
          </Pressable>
        </View>
        {/*<Text style={[*/}
        {/*  styles.translation,*/}
        {/*  isTraditional && traditionalBibleTextStyle,*/}
        {/*  isTraditional && styles.translationCsl,*/}
        {/*]}>*/}
        {/*  {ui('translationName', bibleContent.getTranslation(translationCode)?.name || t('bible.synodalTranslation'))}*/}
        {/*</Text>*/}

        <Pressable
          onPress={() => openTestament('old')}
          style={({pressed}) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.cardText}>
            <Text style={[
              styles.cardTitle,
              isTraditional && traditionalBibleTextStyle,
              isTraditional && styles.cardTitleCsl,
            ]}>
              {ui('oldTestament', t('bible.oldTestament'))}
            </Text>
            <Text style={[
              styles.cardSubtitle,
              isTraditional && traditionalBibleTextStyle,
              isTraditional && styles.cardSubtitleCsl,
            ]}>
              {ui('booksAndSections', t('bible.booksAndSections', {count: oldBooks.length}), {count: oldBooks.length})}
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>

        <Pressable
          onPress={() => openTestament('new')}
          style={({pressed}) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.cardText}>
            <Text style={[
              styles.cardTitle,
              isTraditional && traditionalBibleTextStyle,
              isTraditional && styles.cardTitleCsl,
            ]}>{ui('newTestament', t('bible.newTestament'))}</Text>
            <Text style={[
              styles.cardSubtitle,
              isTraditional && traditionalBibleTextStyle,
              isTraditional && styles.cardSubtitleCsl,
            ]}>{ui('books', t('bible.books', {count: newBooks.length}), {count: newBooks.length})}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>

        {!oldBooks.length && !newBooks.length && (
          <Text style={styles.empty}>
            {translationCode === 'csl_traditional'
              ? 'Церковнославянский текст ещё не включён в эту сборку.'
              : t('bible.dataMissing')}
          </Text>
        )}
      </View>

      <FixedSectionHeader
        onHeaderHeightChange={setHeaderHeight}
        title="Библия"
        navigation={navigation}
        topInset={insets.top}
      />


      <BottomNav navigation={navigation} active={null} />
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 10,
    gap: 10,
  },

  translationPicker: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 8,
    marginHorizontal: 4,
    marginBottom: 3,
  },
  translationOption: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.22)',
    backgroundColor: 'rgba(248, 233, 207, 0.65)',
  },
  translationSelected: {
    borderColor: colors.accentDark,
    backgroundColor: 'rgba(223, 193, 147, 0.95)',
  },
  translationOptionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  translation: {
    marginHorizontal: 4,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  card: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(126, 82, 38, 0.20)',
    backgroundColor: 'rgba(248, 233, 207, 0.96)',
  },

  cardText: {
    flex: 1,
  },

  cardTitle: {
    fontFamily: 'serif',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '700',
    color: colors.text,
  },

  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
  },

  arrow: {
    marginLeft: 12,
    fontSize: 28,
    lineHeight: 30,
    color: '#9A714C',
  },

  empty: {
    padding: 20,
    textAlign: 'center',
    color: colors.textSecondary,
  },

  pressed: {
    opacity: 0.65,
  },

  // Дополнительные стили только для ЦС
  translationCsl: {
    fontSize: 17,
    lineHeight: 27,
    fontWeight: '500',
    color: '#341a09',
    alignSelf:'flex-end'
  },

  cardCsl: {
    minHeight: 98,
  },

  cardTitleCsl: {
    fontSize: 24,
    lineHeight: 37,
    fontWeight: '400',
    color: '#382516',
  },

  cardSubtitleCsl: {
    fontSize: 17,
    lineHeight: 27,
    fontWeight: '500',
    color: '#62462B',
  },
});
