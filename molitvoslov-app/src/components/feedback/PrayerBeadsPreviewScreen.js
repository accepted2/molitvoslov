import React, {useState} from 'react';
import {ImageBackground, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {PrayerBeadsLoader} from './PrayerBeadsLoader';

// Emulator-only visual preview. It stays on screen until the user closes it;
// it does not delay real startup or add a timer to the production app.
export const PrayerBeadsPreviewScreen = ({onContinue}) => {
  const [compact, setCompact] = useState(false);
  const [light, setLight] = useState(true);

  return (
    <ImageBackground
      source={require('../../../assets/home/hero.png')}
      resizeMode="cover"
      style={styles.background}
    >
      <View style={styles.shade} />
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.brandCross}>☦</Text>
          <Text style={styles.brand}>Молитвослов</Text>
          <Text style={styles.caption}>Предпросмотр анимации чёток</Text>
        </View>

        <View style={[styles.previewPanel, !light && styles.previewPanelDarkBeads]}>
          <PrayerBeadsLoader
            compact={compact}
            light={light}
            text="Подготавливаем молитвослов..."
          />
          <Text style={[styles.info, !light && styles.infoDark]}>
            {compact ? 'Компактный круг без крестика' : 'Полный круг с православным крестиком'}
          </Text>
        </View>

        <View style={styles.controls}>
          <Text style={styles.hint}>
            Анимация повторяется непрерывно — экран останется открытым,
            пока не нажмёте «Открыть приложение».
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={compact ? 'Показать полные чётки' : 'Показать компактные чётки'}
              onPress={() => setCompact(value => !value)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                {compact ? 'Полные чётки' : 'Компактные'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={light ? 'Посмотреть тёмные бусины' : 'Посмотреть светлые бусины'}
              onPress={() => setLight(value => !value)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                {light ? 'Тёмные бусины' : 'Светлые бусины'}
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть приложение"
            onPress={onContinue}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Открыть приложение</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {flex: 1, backgroundColor: '#2B190F'},
  shade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 20, 13, 0.72)',
  },
  screen: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  header: {alignItems: 'center', marginTop: 28},
  brandCross: {fontSize: 25, color: '#F0CF92', lineHeight: 33},
  brand: {fontSize: 28, fontFamily: 'serif', color: '#FFF0D0', fontWeight: '700'},
  caption: {marginTop: 8, color: '#F1D9B3', fontSize: 13},
  previewPanel: {
    width: '100%',
    minHeight: 230,
    maxWidth: 310,
    borderRadius: 22,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(43, 25, 16, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(243, 216, 159, 0.27)',
  },
  previewPanelDarkBeads: {
    backgroundColor: '#FFF1D8',
    borderColor: '#BD9466',
  },
  info: {marginTop: 13, fontSize: 12, color: '#F1D9B3', textAlign: 'center'},
  infoDark: {color: '#80502F'},
  controls: {width: '100%', maxWidth: 360, gap: 12, marginBottom: 12},
  hint: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    color: '#F1D9B3',
    marginBottom: 6,
  },
  buttonRow: {flexDirection: 'row', gap: 10},
  secondaryButton: {
    flex: 1,
    minHeight: 45,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8B88B',
    backgroundColor: 'rgba(70, 42, 24, 0.8)',
    paddingHorizontal: 7,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF0D0',
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 49,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 13,
    backgroundColor: '#E6BF86',
  },
  primaryButtonText: {color: '#3A2417', fontSize: 15, fontWeight: '700'},
});
