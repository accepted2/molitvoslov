import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import {SQLiteProvider} from 'expo-sqlite';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {AppBackground} from '../components/layout/AppBackground';
import {useLanguage} from '../context/LanguageContext';
import {useBibleContentGeneration} from '../hooks/useBibleContentGeneration';
import {subscribeToContentUpdates} from '../services/contentStore';
import {addSearchHistory, clearSearchHistory, getSearchHistory} from '../services/searchHistory';
import {isPersistentSearchReady, searchPersistent} from '../services/search/engine';
import {
  SEARCH_GROUPS,
  SEARCH_GROUP_OPTIONS,
  getHighlightSegments,
  getSearchSuggestions,
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
      tabs: {
        all: 'Усе',
        calendar: 'Календар',
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
      tabs: {
        all: 'Все',
        calendar: 'Календарь',
        prayers: 'Молитвы',
        akathists: 'Акафисты',
        psalter: 'Псалтирь',
        canons: 'Каноны',
        scripture: 'Писание',
      },
    };

// FTS5 encloses actual matched tokens in brackets. Select the context around
// these hits instead of looking for the literal user query (which may include
// several words, inflections or removed accent marks).
const extractSentence = (snippet) => {
  const raw = String(snippet || '').trim();
  if (!raw) return '';
  const hits = [...raw.matchAll(/\[([^\]]+)\]/g)];
  if (!hits.length) return '';
  const clean = raw.replace(/\[([^\]]+)\]/g, '$1');
  const first = hits[0];
  const at = raw.slice(0, first.index).replace(/\[([^\]]+)\]/g, '$1').length;
  const prev = clean.slice(0, at);
  const next = clean.slice(at);
  const boundary = Math.max(prev.lastIndexOf('. '), prev.lastIndexOf('! '), prev.lastIndexOf('? '), prev.lastIndexOf('… '));
  let start = boundary < 0 ? 0 : boundary + 2;
  const nextBoundary = next.search(/[.!?…](?:\s|$)/);
  let end = nextBoundary < 0 ? clean.length : at + nextBoundary + 1;
  // Keep at least the matched span visible when the query has several tokens.
  const last = hits[hits.length - 1];
  const lastEnd = raw.slice(0, last.index + last[0].length)
    .replace(/\[([^\]]+)\]/g, '$1').length;
  end = Math.max(end, lastEnd);
  // The bundled Bible index includes book/chapter metadata before verse text.
  // Discard remote metadata when it is far from the actual matched word.
  if (at - start > 85) start = Math.max(start, at - 65);
  if (end - start > 250) {
    start = Math.max(0, at - 65);
    end = Math.min(clean.length, Math.max(lastEnd + 55, at + 160));
  }
  return (start ? '…' : '') + clean.slice(start, end).trim() + (end < clean.length ? '…' : '');
};

// Resolve parent title without changing the real section heading or its route.
const sourceForSearchResult = (item) => {
  const parent = item?.route?.params?.parentTitle || item?.route?.params?.title || item?.source || '';
  const source = String(parent).trim();
  const lowered = source.toLowerCase();
  if (!source || ['akathists', 'canons', 'prayers', 'акафисты', 'каноны', 'молитвы',
    'писание', 'псалтирь', 'акaфист', 'канон'].includes(lowered)) return '';
  return source === item?.title ? '' : source;
};

const isGenericSectionHeading = (title) => {
  const value = String(title || '').trim().replace(/[.:;!?]+$/, '');
  return /^(?:молитва|молитвы|молитви|тропарь|тропар[ьи]|кондак|кондаки)(?:\s*(?:№\s*)?\d+|\s+[ivxlcdm]+)?$/i.test(value) ||
    /^песнь\s+\d+\s*[—-]\s*тропар[ьи]$/i.test(value);
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

const SearchContent = ({navigation}) => {
  const [seedReady, setSeedReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;
  const bibleGeneration = useBibleContentGeneration();

  const [publicGeneration, setPublicGeneration] = useState(0);
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState(SEARCH_GROUPS.ALL);
  const [index, setIndex] = useState(null);
  const [indexLoading, setIndexLoading] = useState(true);
  const [searchScope, setSearchScope] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [history, setHistory] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);


  const resultCache = useRef(new Map())

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
    setSeedReady(false);
    isPersistentSearchReady(language)
      .then((ready) => {
        if (active) setSeedReady(ready);
      })
      .catch((error) => console.warn('Search seed unavailable:', error?.message || error));
    return () => {
      active = false;
    };
  }, [language, publicGeneration, bibleGeneration]);

  useEffect(() => {
    setIndexLoading(!seedReady);
  }, [seedReady]);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => {
      setSearchQuery(query);
    }, 320);
    return () => clearTimeout(timer);
  }, [query, paused]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = searchQuery.trim();
    if (paused || !seedReady || trimmed.length < 2) {
      if (!paused) setSearchLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const scope = `${language}:${activeGroup}:${searchQuery}`;

    if (resultCache.current.has(scope)) {
      const cached = resultCache.current.get(scope);
      setResult(cached);
      setSearchScope(scope);
      setHasMore(cached.hasMore ?? false);
      setSearchLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setSearchLoading(true);
    searchPersistent(language, searchQuery, activeGroup, 120, 0)
      .then((nextResult) => {
        if (!cancelled && nextResult) {
          if (resultCache.current.size >= 30) {
            const firstKey = resultCache.current.keys().next().value;
            resultCache.current.delete(firstKey);
          }
          resultCache.current.set(scope, nextResult);
          setResult(nextResult);
          setSearchScope(scope);
          setHasMore(nextResult.hasMore);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('Exact phrase search failed:', error?.message || error);
          setResult({ items: [], total: 0 });
          setSearchScope(scope);
        }
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, activeGroup, language, seedReady, paused]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || paused || !seedReady) return;
    setLoadingMore(true);
    try {
      const nextOffset = result.items.length;
      const next = await searchPersistent(
        language, searchQuery, activeGroup, 120, nextOffset
      );
      if (next) {
        setResult((prev) => ({
          items: [...prev.items, ...next.items],
          total: Math.max(prev.total, next.total),
        }));
        setHasMore(next.hasMore);
      }
    } finally {
      setLoadingMore(false);
    }
  };

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
      SEARCH_GROUP_OPTIONS.filter((item) => item.key !== 'prayers').map((item) => ({
        ...item,
        label: copy.tabs[item.key] || item.label,
      })),
    [copy]
  );

  const rememberQuery = async (value = query) => {
    const clean = String(value || '').trim();
    if (clean.length < 2) return;
    setHistory(await addSearchHistory(clean));
  };

  const openResult = (item) => {
    Keyboard.dismiss();
    if (!item?.route?.name) return;
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

  const renderResult = ({ item }) => {
    console.error('[search-ui] renderResult:', 'title =', item.title, '| snippet_len =', (item.snippet || '').length);
    return (
    <Pressable
      onPress={() => openResult(item)}
      style={({ pressed }) => [styles.resultCard, pressed && styles.pressed]}
    >
      <View style={styles.resultTopLine}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{copy.tabs[item.group] || item.groupLabel || item.group}</Text>
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
        numberOfLines={3}
      />

      {!!sourceForSearchResult(item) && (isGenericSectionHeading(item.title) ||
        (item.group === 'prayers' && !item.titleMatched)) && (
        <Text style={styles.resultSource} numberOfLines={3}>
          {sourceForSearchResult(item)}
        </Text>
      )}

      {!!item.snippet && (item.group === 'prayers' || item.group === 'calendar' || (!item.titleMatched && extractSentence(item.snippet))) && (
        <HighlightedText
          text={(item.group === 'prayers' || item.group === 'calendar') ? item.snippet.replace(/\\[[^\\]]+\\]/g, (match) => match.slice(1, -1)).slice(0, 190) : extractSentence(item.snippet)}
          query={searchQuery}
          style={styles.resultSnippet}
          highlightStyle={styles.highlightSnippet}
          numberOfLines={4}
        />
      )}

      <Text style={styles.resultArrow}>›</Text>
    </Pressable>
  )
}

  const trimmedQuery = query.trim();
  const waitingForQuery = !trimmedQuery;
  const queryTooShort = !!trimmedQuery && trimmedQuery.length < 2;
  const displayScope = `${language}:${activeGroup}:${searchQuery}`;
  const resultsCurrent = (paused || searchQuery === query) && displayScope === searchScope;
  const visibleResults = useMemo(() => {
    const filtered = resultsCurrent
      ? activeGroup === SEARCH_GROUPS.ALL
        ? result.items
        : result.items.filter((item) => item.group === activeGroup)
      : [];
    if (activeGroup !== SEARCH_GROUPS.ALL && result.items.length > 0) {
      const groups = [...new Set(result.items.map((i) => i.group))];
      console.error('[search-ui] visibleResults: activeGroup =', activeGroup, '| groups in result.items =', groups, '| filtered =', filtered.length);
    }
    return filtered;
  }, [result.items, activeGroup, resultsCurrent]);

  const showEmpty =
    resultsCurrent &&
    !indexLoading &&
    !searchLoading &&
    !waitingForQuery &&
    !queryTooShort &&
    result.total === 0;

  return (
    <AppBackground imageOpacity={0.42}>
      <View style={styles.screen}>
        <StatusBar style="dark" translucent backgroundColor="transparent" />

        <View style={[styles.searchPanel, {paddingTop: headerHeight + 8}]}>
          <View style={styles.inputWrap}>
            <SearchIcon />
            <TextInput
              autoFocus
              value={query}
              onChangeText={(value) => {
                setPaused(false);
                setHasMore(false)
                setResult({items: [], total: 0})
                setQuery(value);
              }}
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
                  onPress={() => {
                    if (tab.key !== activeGroup) {
                      // setResult({items: [], total: 0});
                      setPaused(false);
                      setHasMore(false);
                      setResult({items: [], total: 0});
                      setActiveGroup(tab.key);
                    }
                  }}
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

          {!waitingForQuery && !queryTooShort && (
            <View style={styles.countRow}>
              {indexLoading || (searchLoading && !paused) || (!resultsCurrent && !paused) ? (
                <>
                  <ActivityIndicator size="small" color="#A16E35" />
                  <Text style={styles.countText}>Ищем…</Text>
                </>
              ) : result.total > 0 ? (
                <Text style={styles.countText}>
                  {copy.found(
                    hasMore
                      ? `${result.total}+`
                      : result.total >= 500
                        ? '500+'
                        : result.total
                  )}
                </Text>
              ) : null}
              {!paused && !!query && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Остановить поиск"
                  onPress={() => {
                    setPaused(true);
                    setSearchLoading(false);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.countText}>Стоп</Text>
                </Pressable>
              )}
              {paused && <Text style={styles.countText}>Поиск остановлен</Text>}
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
          </View>
        ) : queryTooShort ? (
          <View style={styles.center}>
            <Text style={styles.centerText}>{copy.short}</Text>
          </View>
        ) : showEmpty ? (
          <View style={styles.center}>
            <Text style={styles.emptyGlyph}>⌕</Text>
            <Text style={styles.centerText}>{copy.empty}</Text>
          </View>
        ) : (
          <FlatList
            data={visibleResults}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            onScrollBeginDrag={() => {
              // setPaused(true);
              setSearchLoading(false);
            }}
            keyExtractor={(item) => item.id}
            renderItem={renderResult}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[styles.results, {paddingBottom: 28 + insets.bottom}]}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator size="small" color="#A16E35" />
              ) : hasMore ? (
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
  screen: {flex: 1, backgroundColor: 'rgba(255, 244, 222, 0.64)'},
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
  searchIcon: {width: 16, height: 16, borderWidth: 2, borderColor: '#7A4F2D', borderRadius: 9},
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
  clearButton: {width: 34, height: 34, alignItems: 'center', justifyContent: 'center'},
  clearText: {marginTop: -2, color: '#765238', fontSize: 26, lineHeight: 30},
  searchHint: {marginTop: 6, marginHorizontal: 3, color: '#8A6B53', fontSize: 11, lineHeight: 15},
  tabsContent: {flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 9},
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
  tabActive: {borderColor: '#7A4F2D', backgroundColor: '#7A4F2D'},
  tabText: {color: '#765238', fontSize: 12, fontWeight: '700'},
  tabTextActive: {color: '#FFF8EA'},
  suggestionsContent: {gap: 7, paddingTop: 8, paddingRight: 12},
  suggestion: {
    maxWidth: 260,
    minHeight: 30,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(161, 110, 53, 0.10)',
  },
  suggestionText: {color: '#68452F', fontSize: 12},
  suggestionHighlight: {color: '#8E342D', fontWeight: '800'},
  countRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 7,
    marginHorizontal: 3,
  },
  countText: {color: '#8A6B53', fontSize: 11, fontWeight: '600'},
  results: {paddingHorizontal: 10, paddingTop: 8},
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
  resultTopLine: {minHeight: 23, flexDirection: 'row', alignItems: 'center', marginBottom: 5},
  badge: {paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(155, 59, 50, 0.10)'},
  badgeText: {
    color: '#8F4539',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.25,
  },
  languageLabel: {marginLeft: 7, color: '#9B806A', fontSize: 10, fontWeight: '700'},
  resultTitle: {color: '#3E2A1D', fontFamily: 'serif', fontSize: 17, lineHeight: 22, fontWeight: '700'},
  highlightTitle: {color: '#963D34', backgroundColor: 'rgba(161, 110, 53, 0.12)'},
  resultSource: {marginTop: 3, color: '#8A6549', fontSize: 11, lineHeight: 15, fontWeight: '600'},
  highlightSource: {color: '#963D34', fontWeight: '800'},
  resultSnippet: {marginTop: 7, color: '#684E3B', fontFamily: 'serif', fontSize: 13, lineHeight: 19},
  highlightSnippet: {color: '#963D34', fontWeight: '800', backgroundColor: 'rgba(161, 110, 53, 0.12)'},
  resultArrow: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: 3,
    color: '#A16E35',
    fontSize: 26,
    lineHeight: 28,
  },
  emptyState: {flex: 1, justifyContent: 'center', paddingHorizontal: 18},
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
  historyTitle: {color: '#4A3121', fontFamily: 'serif', fontSize: 17, fontWeight: '700'},
  historyClear: {paddingVertical: 4, paddingHorizontal: 4},
  historyClearText: {color: '#9B6D46', fontSize: 11, fontWeight: '700'},
  historyChips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  historyChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: 'rgba(161, 110, 53, 0.11)',
    borderWidth: 1,
    borderColor: 'rgba(123, 79, 36, 0.13)',
  },
  historyChipText: {maxWidth: 250, color: '#68452F', fontSize: 12, fontWeight: '600'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34},
  centerText: {marginTop: 10, color: '#765238', fontFamily: 'serif', fontSize: 15, lineHeight: 22, textAlign: 'center'},
  emptyGlyph: {color: '#A16E35', fontSize: 34, lineHeight: 38},
  moreText: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: '#8A6B53',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  pressed: {opacity: 0.68},
});

export const SearchScreen = (props) => (
  <SQLiteProvider
    databaseName="molitvoslov_search_seed_v10.db"
    assetSource={{assetId: require('../data/search_seed.db')}}
  >
    <SearchContent {...props} />
  </SQLiteProvider>
);