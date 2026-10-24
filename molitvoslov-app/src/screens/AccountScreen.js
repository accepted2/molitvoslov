import React, {useEffect, useState} from 'react';

import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';

import {SafeAreaView} from 'react-native-safe-area-context';

import {getCurrentBackendUser, deleteBackendAccount} from '../services/backendAuth';

import {signInWithGoogle, signOutFromGoogle} from '../services/googleAuth';

import {syncSavedItems} from '../services/savedItems';

import {syncReadingProgress} from '../services/readingProgress';

import {syncMemorials} from '../services/memorials';
import {syncPrayerBooks} from '../services/prayerBooks';

import {colors, radius, spacing} from '../theme';

import {adoptAnonymousLocalData} from '../services/localDataOwnership';

import {BottomNav} from '../components/navigation/BottomNav';
import {useLanguage} from '../context/LanguageContext';
import {getReadingSettings, saveReadingSettings, resetReadingSettings, DEFAULT_READING_SETTINGS} from '../services/readerPreferences';
import {READER_LANGUAGE_MODES} from '../services/readerLanguageModes';
import ColorPalettePicker from '../components/settings/ColorPalettePicker';

const MODE_CHOICES = [
  {value: READER_LANGUAGE_MODES.CHURCH, label: 'Церковнославянский'},
  {value: READER_LANGUAGE_MODES.RUSSIAN, label: 'Русский'},
  {value: READER_LANGUAGE_MODES.BOTH, label: 'Церковнославянский + русский'},
  {value: READER_LANGUAGE_MODES.TRADITIONAL, label: 'Церковнославянский традиционный'},
];
const PALETTES = [
  {value: 'parchment', label: 'Пергамент', color: '#FFF4DE'},
  {value: 'warm', label: 'Тёплый коричневый', color: '#DEBE94'},
  {value: 'ivory', label: 'Слоновая кость', color: '#FFFDF3'},
  {value: 'night', label: 'Ночная', color: '#29231F'},
  {value: 'custom', label: 'Своя', color: '#E5D6C1'},
];

export const AccountScreen = ({navigation}) => {
  const {language, setLanguage} = useLanguage();
  const [readingSettings, setReadingSettings] = useState(DEFAULT_READING_SETTINGS);
  useEffect(() => { getReadingSettings().then(setReadingSettings).catch(console.warn); }, []);
  const changeReadingSettings = async (patch) => {
    const next = {...readingSettings, ...patch};
    setReadingSettings(next);
    try { await saveReadingSettings(next); }
    catch (error) { console.warn('Reading settings:', error); }
  };
  const [googleUser, setGoogleUser] = useState(null);

  const [loading, setLoading] = useState(true);

  const [googleLoading, setGoogleLoading] = useState(false);

  const [googleError, setGoogleError] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const deleteAccount = () => Alert.alert(
    'Удалить аккаунт?',
    'Серверный аккаунт, избранное, прогресс чтения, помянники и личные молитвословы будут удалены без возможности восстановления. Локальные данные на устройстве могут сохраниться.',
    [{text: 'Отмена', style: 'cancel'}, {text: 'Удалить навсегда', style: 'destructive', onPress: async () => {
      setDeletingAccount(true);
      try {
        await deleteBackendAccount();
        setGoogleUser(null);
        Alert.alert('Аккаунт удалён', 'Серверный аккаунт и связанные с ним данные удалены.');
      } catch (error) {
        Alert.alert('Ошибка удаления', error.message || 'Проверьте подключение к интернету.');
      } finally { setDeletingAccount(false); }
    }}]
  );

  useEffect(() => {
    const loadUser = async () => {
      try {
        const backendUser = await getCurrentBackendUser();

        if (backendUser) {
          setGoogleUser({
            id: backendUser.id,

            email: backendUser.email,

            name: backendUser.name || backendUser.first_name || backendUser.username,

            photo: backendUser.picture_url || backendUser.picture || null,
          });
        }
      } catch (err) {
        console.error('LOAD ACCOUNT ERROR', err);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const googleLogin = async () => {
    try {
      setGoogleError('');

      setGoogleLoading(true);

      const googleResult = await signInWithGoogle();

      if (!googleResult) {
        return;
      }

      setGoogleUser(googleResult.user);
      await adoptAnonymousLocalData(googleResult.user.id);
      /*
       * После успешного Google/Django
       * входа сразу восстанавливаем
       * облачные данные пользователя.
       */
      const [
        savedItemsSyncResult,
        readingProgressSyncResult,
        memorialsSyncResult,
        prayerBooksSyncResult,
      ] = await Promise.all([
        syncSavedItems(),
        syncReadingProgress(),
        syncMemorials(),
        syncPrayerBooks(),
      ]);

      if (
        savedItemsSyncResult?.success &&
        readingProgressSyncResult?.success &&
        memorialsSyncResult?.success &&
        prayerBooksSyncResult?.success
      ) {
        console.log('Cloud sync OK: google-login');
      } else {
        const error =
          savedItemsSyncResult?.error ||
          readingProgressSyncResult?.error ||
          memorialsSyncResult?.error ||
          prayerBooksSyncResult?.error;

        const reason =
          savedItemsSyncResult?.reason ||
          readingProgressSyncResult?.reason ||
          memorialsSyncResult?.reason ||
          prayerBooksSyncResult?.reason;

        console.log('Cloud sync после Google-входа отложен', error?.message || reason || 'unknown');
      }

      console.log('GOOGLE LOGIN OK', {
        email: googleResult.user?.email,

        name: googleResult.user?.name,

        hasIdToken: Boolean(googleResult.idToken),
      });
    } catch (err) {
      console.error('GOOGLE LOGIN ERROR', err);

      setGoogleError(err?.message || 'Не удалось выполнить вход через Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const googleLogout = async () => {
    try {
      /*
       * signOutFromGoogle()
       * уже вызывает logoutFromBackend()
       * внутри googleAuth.js.
       */
      await signOutFromGoogle();
    } finally {
      setGoogleUser(null);
    }
  };

  // if (loading) {
  //   return (
  //     <SafeAreaView style={styles.safeArea}>
  //       <View style={styles.center}>
  //         <ActivityIndicator size="large" color={colors.accent} />
  //       </View>
  //     </SafeAreaView>
  //   );
  // }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        <ScrollView style={{flex: 1}} contentContainerStyle={[styles.content, {flex: undefined, flexGrow: 1, paddingBottom: 110}]}>
          <Text style={styles.title}>Аккаунт</Text>

          {loading ? (
            <View style={styles.card}>
              <View style={styles.accountLoading}>
                <ActivityIndicator size="small" color={colors.accent} />

                <Text style={styles.accountLoadingText}>Проверка аккаунта...</Text>
              </View>
            </View>
          ) : googleUser ? (
            <View style={styles.card}>
              <Text style={styles.label}>Вы вошли через Google</Text>

              {!!googleUser.name && <Text style={styles.username}>{googleUser.name}</Text>}

              {!!googleUser.email && <Text style={styles.googleEmail}>{googleUser.email}</Text>}

              <Pressable disabled={deletingAccount} onPress={deleteAccount} style={{paddingVertical: 12, marginTop: 14}}>
                <Text style={{color: '#A33A32', fontWeight: '700'}}>Удалить аккаунт и облачные данные</Text>
              </Pressable>
              <Pressable
                onPress={googleLogout}
                style={({pressed}) => [styles.button, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>Выйти</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.loginDescription}>
                Войдите через Google, чтобы синхронизировать избранное, прогресс чтения, помянник,
                личные молитвословы и другие данные между устройствами.
              </Text>

              <Text style={styles.loginHint}>
                При первом входе аккаунт будет создан автоматически.
              </Text>

              {!!googleError && <Text style={styles.error}>{googleError}</Text>}

              <Pressable
                onPress={googleLogin}
                disabled={googleLoading}
                style={({pressed}) => [
                  styles.googleButton,

                  pressed && styles.pressed,

                  googleLoading && styles.disabled,
                ]}
              >
                {googleLoading ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.googleButtonText}>Продолжить с Google</Text>
                )}
              </Pressable>
            </View>
          )}
          <View style={[styles.card, {marginTop: 16, gap: 12}]}>
            <Text style={styles.sectionTitle}>Настройки приложения</Text>
            <Text style={styles.settingCaption}>Язык интерфейса</Text>
            <View style={styles.optionRow}>
              {[{value: 'ru', label: 'Русский'}, {value: 'uk', label: 'Українська'}].map((option) => (
                <Pressable key={option.value} onPress={() => setLanguage(option.value)} style={[styles.settingOption, language === option.value && styles.optionSelected]}>
                  <Text style={styles.settingText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.settingCaption}>Язык чтения по умолчанию</Text>
            {MODE_CHOICES.map((option) => (
              <Pressable key={option.value} onPress={() => changeReadingSettings({defaultMode: option.value})} style={[styles.settingOption, readingSettings.defaultMode === option.value && styles.optionSelected]}>
                <Text style={styles.settingText}>{readingSettings.defaultMode === option.value ? '●  ' : '○  '}{option.label}</Text>
              </Pressable>
            ))}
            <Text style={styles.settingHint}>Если выбранный перевод отсутствует, будет показан доступный текст. Индивидуально сохранённый режим книги имеет приоритет.</Text>
            <Text style={styles.settingCaption}>Размер текста по умолчанию</Text>
            <View style={styles.optionRow}>
              <Pressable style={styles.settingOption} onPress={() => changeReadingSettings({fontSize: readingSettings.fontSize - 1})}><Text style={styles.settingText}>A−</Text></Pressable>
              <Text style={styles.settingText}>{readingSettings.fontSize}</Text>
              <Pressable style={styles.settingOption} onPress={() => changeReadingSettings({fontSize: readingSettings.fontSize + 1})}><Text style={styles.settingText}>A+</Text></Pressable>
            </View>
            <Text style={styles.settingCaption}>Цветовая палитра чтения</Text>
            <View style={styles.optionRow}>
              {PALETTES.map((option) => <Pressable key={option.value} accessibilityLabel={option.label} onPress={() => changeReadingSettings({palette: option.value})} style={[styles.paletteCircle, {backgroundColor: option.color}, readingSettings.palette === option.value && styles.paletteSelected]} />)}
            </View>
            {readingSettings.palette === 'custom' && (
              <View style={{gap: 12}}>
                <ColorPalettePicker title="Цвет фона" color={readingSettings.customBackground} onChange={(color) => changeReadingSettings({customBackground: color})} />
                <ColorPalettePicker title="Цвет текста" color={readingSettings.customText} onChange={(color) => changeReadingSettings({customText: color})} />
              </View>
            )}
            <View style={[styles.readerPreview, {backgroundColor: readingSettings.palette === 'custom' ? readingSettings.customBackground : (PALETTES.find((x) => x.value === readingSettings.palette)?.color || '#FFF4DE')}] }>
              <Text style={{fontFamily: 'serif', fontSize: readingSettings.fontSize, lineHeight: readingSettings.fontSize * 1.65, color: readingSettings.palette === 'custom' ? readingSettings.customText : readingSettings.palette === 'night' ? '#F4E7D2' : '#3E2A1D'}}>Господи, научи меня творить волю Твою. Образец текста для чтения.</Text>
            </View>
            <Pressable style={styles.settingOption} onPress={() => Alert.alert('Сбросить настройки?', 'Будет восстановлен русский язык интерфейса, церковнославянский текст и исходное оформление чтения.', [{text: 'Отмена', style: 'cancel'}, {text: 'Сбросить', onPress: async () => {await setLanguage('ru'); const settings = await resetReadingSettings(); await saveReadingSettings({...settings, defaultMode: 'church'}); setReadingSettings({...settings, defaultMode: 'church'});}}])}>
              <Text style={styles.settingText}>Сбросить настройки чтения и языка</Text>
            </Pressable>
            <Text style={styles.settingHint}>Настройки сохраняются на устройстве. Применение палитры и размера ко всем видам чтения, а также синхронизация через аккаунт требуют отдельного подключения.</Text>
          </View>
        </ScrollView>

        <BottomNav navigation={navigation} active="account" />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  readerPreview: {padding: 18, borderRadius: 13, minHeight: 100, borderWidth: 1, borderColor: '#AE9070'},
  hexInput: {borderWidth: 1, borderColor: '#D6BC94', borderRadius: 10, backgroundColor: '#FFF8EB', padding: 10, color: '#3E2A1D'},
  sectionTitle: {fontSize: 20, fontWeight: '700', color: '#503524'},
  settingCaption: {fontSize: 15, fontWeight: '700', color: '#684229'},
  settingText: {fontSize: 14, color: '#503524'},
  settingHint: {fontSize: 12, lineHeight: 19, color: '#836A52'},
  optionRow: {flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap'},
  settingOption: {paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, backgroundColor: '#F7E8CF', borderWidth: 1, borderColor: '#E2CCAA'},
  optionSelected: {backgroundColor: '#E8CDA4', borderColor: '#875627'},
  paletteCircle: {width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#AD9679'},
  paletteSelected: {borderWidth: 3, borderColor: '#875627'},
  safeArea: {
    flex: 1,

    backgroundColor: colors.background,
  },

  screen: {
    flex: 1,
  },

  content: {
    flex: 1,

    padding: spacing.lg,
  },

  center: {
    flex: 1,

    alignItems: 'center',

    justifyContent: 'center',
  },

  title: {
    fontSize: 28,

    fontWeight: '700',

    color: colors.text,

    marginBottom: spacing.lg,
  },

  card: {
    padding: spacing.lg,

    borderRadius: radius.lg,

    backgroundColor: colors.surface,

    borderWidth: 1,

    borderColor: colors.border,
  },
  accountLoading: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  accountLoadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },

  label: {
    color: colors.textSecondary,

    fontSize: 14,
  },

  username: {
    marginTop: spacing.xs,

    marginBottom: spacing.md,

    fontSize: 22,

    fontWeight: '700',

    color: colors.text,
  },

  googleEmail: {
    marginBottom: spacing.lg,

    color: colors.textSecondary,

    fontSize: 15,
  },

  loginDescription: {
    marginBottom: spacing.sm,

    color: colors.textSecondary,

    fontSize: 15,

    lineHeight: 22,
  },

  loginHint: {
    marginBottom: spacing.lg,

    color: colors.textMuted,

    fontSize: 13,

    lineHeight: 19,
  },

  error: {
    marginBottom: spacing.md,

    color: colors.liturgical,

    fontSize: 14,
  },

  button: {
    height: 48,

    alignItems: 'center',

    justifyContent: 'center',

    borderRadius: radius.md,

    backgroundColor: colors.accent,
  },

  buttonText: {
    color: colors.white,

    fontSize: 16,

    fontWeight: '700',
  },

  googleButton: {
    height: 48,

    alignItems: 'center',

    justifyContent: 'center',

    borderRadius: radius.md,

    borderWidth: 1,

    borderColor: colors.borderStrong,

    backgroundColor: colors.background,
  },

  googleButtonText: {
    color: colors.text,

    fontSize: 16,

    fontWeight: '600',
  },

  disabled: {
    opacity: 0.6,
  },

  pressed: {
    opacity: 0.7,
  },
});
