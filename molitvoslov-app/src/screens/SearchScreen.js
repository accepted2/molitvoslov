import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {AppBackground} from '../components/layout/AppBackground';
import {useLanguage} from '../context/LanguageContext';
import {useBibleContentGeneration} from '../hooks/useBibleContentGeneration';
import {subscribeToContentUpdates} from '../services/contentStore';
import {
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
} from '../services/searchHistory';
import {
  SEARCH_GROUPS,
  SEARCH_GROUP_OPTIONS,
  buildSearchIndex,
  getHighlightSegments,
  getSearchSuggestions,
  searchIndexAsync,
} from '../services/searchIndex';

const copyForLanguage = (language) =>
  language === 'uk'
    ? {
        title: 'Пошук',
        placeholder: 'Назва або слова з тексту…',
        hint: 'Пошук не враховує наголоси та надрядкові знаки.',
        start: 'Почніть вводити назву молитви, акафіста, псалма або слова з тексту.',
        short: 'Введіть щонайменше 2 символи.',
        empty: 'Нічого не знайдено.',
        found: (count) => `Знайдено: ${count}`,
        more: 'Показано перші результати. Уточніть запит, щоб звузити пошук.',
        recent: 'Недавні пошуки',
        clearRecent: 'Очистити',
        preparing: 'Пошук стане доступним за мить…',
        tabs: {
          all: 'Усе',
          prayers: 'Молитви',
          akathists: 'Акафісти',
          psalter: 'Псалтир',
          canons: 'Канони',
          scripture: 'Писання',
        },
      }
    : {
        title: 'Поиск',
        placeholder: 'Название или слова из текста…',
        hint: 'Поиск не учитывает ударения и надстрочные знаки.',
        start: 'Начните вводить название молитвы, акафиста, псалма или слова из текста.',
        short: 'Введите хотя бы 2 символа.',
        empty: 'Ничего не найдено.',
        found: (count) => `Найдено: ${count}`,
        more: 'Показаны первые результаты. Уточните запрос, чтобы сузить поиск.',
        recent: 'Недавние запросы',
        clearRecent: 'Очистить',
        preparing: 'Поиск станет доступен через мгновение…',
        tabs: {
          all: 'Все',
          prayers: 'Молитвы',
          akathists: 'Акафисты',
          psalter: 'Псалтирь',
          canons: 'Каноны',
          scripture: 'Писание',
        },
      };

const HighlightedText = ({text, query, style, highlightStyle, numberOfLines}) => {
  const segments = useMemo(() => getHighlightSegments(text, query), [text, query]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((segment, index) => (
        <Text key={`${index}:${segment.text}`} style={segment.highlighted ? highlightStyle : null}>
          {segment.text}
        </Text>
      ))}
    </Text>
  );
};

const SearchIcon = () => (
  <View style={styles.searchIcon}>
    <View style={styles.searchIconHandle} />
  </View>
);

const scheduleIdleTask = (callback) => {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const taskId = globalThis.requestIdleCallback(callback, {timeout: 500});

    return () => {
      if (typeof globalThis.cancelIdleCallback === 'function') {
        globalThis.cancelIdleCallback(taskId);
      }
    };
  }

  const timeoutId = setTimeout(callback, 0);

  return () => clearTimeout(timeoutId);
};

export const SearchScreen = ({navigation}) => {
  const {language} = useLanguage();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;
  const bibleGeneration = useBibleContentGeneration();

  const [publicGeneration, setPublicGeneration] = useState(0);
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState(SEARCH_GROUPS.ALL);
  const [index, setIndex] = useState(null);
  const [indexLoading, setIndexLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [result, setResult] = useState({
    items: [],
    total: 0,
  });
  const [history, setHistory] = useState([]);

  const copy = useMemo(() => copyForLanguage(language), [language]);

  useEffect(
    () =>
      subscribeToContentUpdates(() => {
        setPublicGeneration((current) => current + 1);
      }),
    []
  );

  useEffect(() => {
    getSearchHistory().then(setHistory);
  }, []);

  useEffect(() => {
    let active = true;
    setIndexLoading(true);

    const cancelTask = scheduleIdleTask(() => {
      if (!active) {
        return;
      }

      try {
        setIndex(buildSearchIndex(language));
      } finally {
        if (active) {
          setIndexLoading(false);
        }
      }
    });

    return () => {
      active = false;
      cancelTask();
    };
  }, [language, publicGeneration, bibleGeneration]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(query);
    }, 110);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = searchQuery.trim();

    if (indexLoading || !index || trimmed.length < 2) {
      setSearchLoading(false);
      setResult({
        items: [],
        total: 0,
      });
      return () => {
        cancelled = true;
      };
    }

    setSearchLoading(true);
    setResult({
      items: [],
      total: 0,
    });

    searchIndexAsync(index, searchQuery, {
      group: activeGroup,
      limit: 120,
      isCancelled: () => cancelled,
    })
      .then((nextResult) => {
        if (!cancelled && nextResult) {
          setResult(nextResult);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearchLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [index, indexLoading, searchQuery, activeGroup]);

  const suggestionIndex = useMemo(
    () => (index || []).filter((entry) => !!entry.titleNormalized),
    [index]
  );

  const suggestions = useMemo(
    () =>
      getSearchSuggestions(suggestionIndex, query, {
        group: activeGroup,
        limit: 6,
      }),
    [suggestionIndex, query, activeGroup]
  );

  const tabs = useMemo(
    () =>
      SEARCH_GROUP_OPTIONS.map((item) => ({
        ...item,
        label: copy.tabs[item.key] || item.label,
      })),
    [copy]
  );

  const rememberQuery = async (value = query) => {
    const clean = String(value || '').trim();

    if (clean.length < 2) {
      return;
    }

    setHistory(await addSearchHistory(clean));
  };

  const openResult = (item) => {
    Keyboard.dismiss();

    if (!item?.route?.name) {
      return;
    }

    rememberQuery();
    navigation.navigate(item.route.name, item.route.params || {});
  };

  const submitSearch = () => {
    rememberQuery();
    Keyboard.dismiss();
  };

  const clearHistory = async () => {
    await clearSearchHistory();
    setHistory([]);
  };

  const renderResult = ({item}) => (
    <Pressable
      onPress={() => openResult(item)}
      style={({pressed}) => [styles.resultCard, pressed && styles.pressed]}
    >
      <View style={styles.resultTopLine}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{copy.tabs[item.group] || item.groupLabel}</Text>
        </View>

        {!!item.matchedLanguageLabel && (
          <Text style={styles.languageLabel}>{item.matchedLanguageLabel}</Text>
        )}
      </View>

      <HighlightedText
        text={item.title}
        query={searchQuery}
        style={styles.resultTitle}
        highlightStyle={styles.highlightTitle}
        numberOfLines={2}
      />

      {!!item.source && (
        <HighlightedText
          text={item.source}
          query={searchQuery}
          style={styles.resultSource}
          highlightStyle={styles.highlightSource}
          numberOfLines={2}
        />
      )}

      {!!item.snippet && (
        <HighlightedText
          text={item.snippet}
          query={searchQuery}
          style={styles.resultSnippet}
          highlightStyle={styles.highlightSnippet}
          numberOfLines={3}
        />
      )}

      <Text style={styles.resultArrow}>›</Text>
    </Pressable>
  );

  const trimmedQuery = query.trim();
  const waitingForQuery = !trimmedQuery;
  const queryTooShort = !!trimmedQuery && trimmedQuery.length < 2;
  const showEmpty =
    !indexLoading && !searchLoading && !waitingForQuery && !queryTooShort && result.total === 0;

  return (
    <AppBackground imageOpacity={0.42}>
      <View style={styles.screen}>
        <StatusBar style="dark" translucent backgroundColor="transparent" />

      <View
        style={[
          styles.searchPanel,
          {
            paddingTop: headerHeight + 8,
          },
        ]}
      >
        <View style={styles.inputWrap}>
          <SearchIcon />

          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={copy.placeholder}
            placeholderTextColor="#9B806A"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={submitSearch}
            selectionColor="#A16E35"
            style={styles.input}
          />

          {!!query && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Очистить поиск"
              onPress={() => setQuery('')}
              hitSlop={8}
              style={({pressed}) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.searchHint}>{copy.hint}</Text>

        <View style={styles.tabsContent}>
          {tabs.map((tab) => {
            const active = tab.key === activeGroup;

            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveGroup(tab.key)}
                style={({pressed}) => [
                  styles.tab,
                  active && styles.tabActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {!!suggestions.length && trimmedQuery.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.suggestionsContent}
          >
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion}
                onPress={() => setQuery(suggestion)}
                style={({pressed}) => [styles.suggestion, pressed && styles.pressed]}
              >
                <HighlightedText
                  text={suggestion}
                  query={query}
                  style={styles.suggestionText}
                  highlightStyle={styles.suggestionHighlight}
                  numberOfLines={1}
                />
              </Pressable>
            ))}
          </ScrollView>
        )}

        {!waitingForQuery && !queryTooShort && !indexLoading && (
          <View style={styles.countRow}>
            {searchLoading ? (
              <>
                <ActivityIndicator size="small" color="#A16E35" />
                <Text style={styles.countText}>Ищем…</Text>
              </>
            ) : result.total > 0 ? (
              <Text style={styles.countText}>{copy.found(result.total)}</Text>
            ) : null}
          </View>
        )}
      </View>

      {waitingForQuery ? (
        <View style={styles.emptyState}>
          {!!history.length ? (
            <View style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>{copy.recent}</Text>

                <Pressable
                  onPress={clearHistory}
                  hitSlop={8}
                  style={({pressed}) => [styles.historyClear, pressed && styles.pressed]}
                >
                  <Text style={styles.historyClearText}>{copy.clearRecent}</Text>
                </Pressable>
              </View>

              <View style={styles.historyChips}>
                {history.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setQuery(item)}
                    style={({pressed}) => [styles.historyChip, pressed && styles.pressed]}
                  >
                    <Text style={styles.historyChipText}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.emptyGlyph}>⌕</Text>
              <Text style={styles.centerText}>{copy.start}</Text>
            </>
          )}

          {indexLoading && <Text style={styles.indexHint}>{copy.preparing}</Text>}
        </View>
      ) : queryTooShort ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>{copy.short}</Text>
        </View>
      ) : indexLoading || searchLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#A16E35" />
          <Text style={styles.centerText}>Ищем по библиотеке…</Text>
        </View>
      ) : showEmpty ? (
        <View style={styles.center}>
          <Text style={styles.emptyGlyph}>⌕</Text>
          <Text style={styles.centerText}>{copy.empty}</Text>
        </View>
      ) : (
        <FlatList
          data={result.items}
          keyExtractor={(item) => item.id}
          renderItem={renderResult}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            styles.results,
            {
              paddingBottom: 28 + insets.bottom,
            },
          ]}
          ListFooterComponent={
            result.total > result.items.length ? (
              <Text style={styles.moreText}>{copy.more}</Text>
            ) : null
          }
        />
      )}

        <FixedSectionHeader title={copy.title} navigation={navigation} topInset={insets.top} />
      </View>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'rgba(255, 244, 222, 0.64)',
  },

  searchPanel: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(123, 79, 36, 0.16)',
    backgroundColor: 'rgba(255, 244, 222, 0.88)',
  },

  inputWrap: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(123, 79, 36, 0.24)',
    borderRadius: 16,
    backgroundColor: '#F8E9CF',
  },

  input: {
    flex: 1,
    minWidth: 0,
    height: 46,
    marginLeft: 11,
    paddingVertical: 0,
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 16,
  },

  searchIcon: {
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: '#7A4F2D',
    borderRadius: 9,
  },

  searchIconHandle: {
    position: 'absolute',
    right: -5,
    bottom: -3,
    width: 7,
    height: 2,
    borderRadius: 2,
    backgroundColor: '#7A4F2D',
    transform: [{rotate: '45deg'}],
  },

  clearButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  clearText: {
    marginTop: -2,
    color: '#765238',
    fontSize: 26,
    lineHeight: 30,
  },

  searchHint: {
    marginTop: 6,
    marginHorizontal: 3,
    color: '#8A6B53',
    fontSize: 11,
    lineHeight: 15,
  },

  tabsContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingTop: 9,
  },

  tab: {
    minHeight: 34,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(123, 79, 36, 0.20)',
    borderRadius: 17,
    backgroundColor: 'rgba(248, 233, 207, 0.72)',
  },

  tabActive: {
    borderColor: '#7A4F2D',
    backgroundColor: '#7A4F2D',
  },

  tabText: {
    color: '#765238',
    fontSize: 12,
    fontWeight: '700',
  },

  tabTextActive: {
    color: '#FFF8EA',
  },

  suggestionsContent: {
    gap: 7,
    paddingTop: 8,
    paddingRight: 12,
  },

  suggestion: {
    maxWidth: 260,
    minHeight: 30,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(161, 110, 53, 0.10)',
  },

  suggestionText: {
    color: '#68452F',
    fontSize: 12,
  },

  suggestionHighlight: {
    color: '#8E342D',
    fontWeight: '800',
  },

  countRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 7,
    marginHorizontal: 3,
  },

  countText: {
    color: '#8A6B53',
    fontSize: 11,
    fontWeight: '600',
  },

  results: {
    paddingHorizontal: 10,
    paddingTop: 8,
  },

  resultCard: {
    position: 'relative',
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 13,
    paddingRight: 34,
    borderWidth: 1,
    borderColor: 'rgba(123, 79, 36, 0.16)',
    borderRadius: 15,
    backgroundColor: '#F8E9CF',
  },

  resultTopLine: {
    minHeight: 23,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(155, 59, 50, 0.10)',
  },

  badgeText: {
    color: '#8F4539',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },

  languageLabel: {
    marginLeft: 7,
    color: '#9B806A',
    fontSize: 10,
    fontWeight: '700',
  },

  resultTitle: {
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },

  highlightTitle: {
    color: '#963D34',
    backgroundColor: 'rgba(161, 110, 53, 0.12)',
  },

  resultSource: {
    marginTop: 3,
    color: '#8A6549',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },

  highlightSource: {
    color: '#963D34',
    fontWeight: '800',
  },

  resultSnippet: {
    marginTop: 7,
    color: '#684E3B',
    fontFamily: 'serif',
    fontSize: 13,
    lineHeight: 19,
  },

  highlightSnippet: {
    color: '#963D34',
    fontWeight: '800',
    backgroundColor: 'rgba(161, 110, 53, 0.12)',
  },

  resultArrow: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: 3,
    color: '#A16E35',
    fontSize: 26,
    lineHeight: 28,
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  historyCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(123, 79, 36, 0.18)',
    borderRadius: 16,
    backgroundColor: 'rgba(255, 244, 222, 0.88)',
  },

  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },

  historyTitle: {
    color: '#4A3121',
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '700',
  },

  historyClear: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },

  historyClearText: {
    color: '#9B6D46',
    fontSize: 11,
    fontWeight: '700',
  },

  historyChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  historyChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: 'rgba(161, 110, 53, 0.11)',
    borderWidth: 1,
    borderColor: 'rgba(123, 79, 36, 0.13)',
  },

  historyChipText: {
    maxWidth: 250,
    color: '#68452F',
    fontSize: 12,
    fontWeight: '600',
  },

  indexHint: {
    marginTop: 14,
    color: '#9B806A',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },

    center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
  },

  centerText: {
    marginTop: 10,
    color: '#765238',
    fontFamily: 'serif',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },

  emptyGlyph: {
    color: '#A16E35',
    fontSize: 34,
    lineHeight: 38,
  },

  moreText: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: '#8A6B53',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },

  pressed: {
    opacity: 0.68,
  },
});
