import React, {useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {WebView} from 'react-native-webview';

import {BottomNav} from '../components/navigation/BottomNav';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {getHoursEntry} from '../data/hoursCatalog';

// Some source documents contain all four Hours on one page. Locate the
// requested hour after loading rather than assuming an unstable URL fragment.
const makeHeadingScript = (heading) => {
  if (!heading) return 'true;';
  return `(function() {
    var requested = ${JSON.stringify(heading)}.toLocaleLowerCase('ru');
    var headings = document.querySelectorAll('h1, h2, h3, h4, h5, strong');
    var target = Array.prototype.find.call(headings, function(node) {
      var name = String(node.textContent || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase('ru');
      return name === requested || name.indexOf(requested + ' ') === 0;
    });
    if (target) {
      target.scrollIntoView({block: 'start', behavior: 'auto'});
    }
  })(); true;`;
};

export const HoursReadingScreen = ({route, navigation}) => {
  const entry = getHoursEntry(route.params?.entryId);
  const insets = useSafeAreaInsets();
  const webRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const headingScript = useMemo(() => makeHeadingScript(entry?.focusHeading), [entry?.focusHeading]);

  const openExternal = () => {
    if (entry?.sourceUrl) {
      Linking.openURL(entry.sourceUrl).catch((error) => {
        console.warn('Unable to open Hours source:', error?.message || error);
      });
    }
  };

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Последование не найдено</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.sourceButton}>
          <Text style={styles.sourceButtonText}>Назад к списку часов</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <View style={[
        styles.body,
        {paddingTop: headerHeight + 14, paddingBottom: 78 + insets.bottom},
      ]}>
        <View style={styles.sourcePanel}>
          <View style={styles.sourceCopy}>
            <Text style={styles.sourceLabel} numberOfLines={2}>
              Источник: {entry.source}
            </Text>
            {!!entry.sourceNote && (
              <Text style={styles.sourceNote} numberOfLines={3}>{entry.sourceNote}</Text>
            )}
            <Text style={styles.sourceNote}>Онлайн-текст. Требуется интернет.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть источник в браузере"
            onPress={openExternal}
            style={({pressed}) => [styles.sourceButton, pressed && styles.pressed]}
          >
            <Text style={styles.sourceButtonText}>Браузер</Text>
          </Pressable>
        </View>

        <View style={styles.readerSurface}>
          {!loadError && (
            <WebView
              ref={webRef}
              source={{uri: entry.sourceUrl}}
              originWhitelist={['https://*']}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              style={styles.webview}
              onLoadStart={() => {setLoading(true); setLoadError(false);}}
              onLoadEnd={() => {
                setLoading(false);
                webRef.current?.injectJavaScript(headingScript);
              }}
              onError={() => {setLoading(false); setLoadError(true);}}
              onHttpError={({nativeEvent}) => {
                if (nativeEvent.url === entry.sourceUrl && nativeEvent.statusCode >= 400) {
                  setLoadError(true);
                }
              }}
              renderLoading={() => (
                <View style={styles.center}>
                  <ActivityIndicator color="#80532E" size="large" />
                </View>
              )}
            />
          )}
          {loadError && (
            <View style={styles.center}>
              <Text style={styles.errorTitle}>Не удалось загрузить текст</Text>
              <Text style={styles.errorText}>
                Проверь подключение к интернету или открой источник в браузере.
              </Text>
              <Pressable onPress={openExternal} style={styles.sourceButton}>
                <Text style={styles.sourceButtonText}>Открыть источник</Text>
              </Pressable>
              <Pressable onPress={() => setLoadError(false)} style={styles.retryButton}>
                <Text style={styles.retryText}>Повторить загрузку</Text>
              </Pressable>
            </View>
          )}
          {loading && !loadError && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator color="#80532E" size="small" />
            </View>
          )}
        </View>
      </View>
      <FixedSectionHeader
        title={entry.title}
        navigation={navigation}
        onHeaderHeightChange={setHeaderHeight}
        topInset={insets.top}
      />
      <BottomNav navigation={navigation} active={null} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#FFF4DE'},
  body: {flex: 1, paddingHorizontal: 8, gap: 8},
  readerSurface: {flex: 1, borderRadius: 9, overflow: 'hidden', backgroundColor: '#FFF8EB'},
  webview: {flex: 1, backgroundColor: '#FFF8EB'},
  sourcePanel: {
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F3E4CB',
  },
  sourceCopy: {flex: 1, gap: 3},
  sourceLabel: {color: '#4E3522', fontSize: 12, fontWeight: '600', lineHeight: 18},
  sourceNote: {color: '#80654A', fontSize: 11, lineHeight: 16},
  sourceButton: {
    backgroundColor: '#8F6039',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceButtonText: {fontSize: 12, fontWeight: '700', color: '#FFF6E6'},
  retryButton: {padding: 12, alignItems: 'center'},
  retryText: {color: '#8F6039', fontWeight: '600', fontSize: 13},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 12},
  errorTitle: {color: '#52361F', fontSize: 16, fontWeight: '700', textAlign: 'center'},
  errorText: {color: '#75573B', fontSize: 13, lineHeight: 21, textAlign: 'center'},
  loadingOverlay: {position: 'absolute', right: 12, top: 10},
  pressed: {opacity: 0.65},
});
