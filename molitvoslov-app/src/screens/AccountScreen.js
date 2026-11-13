import {getCalendarBibleTranslation, saveCalendarBibleTranslation} from '../services/bibleTranslationPreference';
import React, {useEffect, useRef, useState} from 'react';

import {ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';

import {SafeAreaView} from 'react-native-safe-area-context';

import {getCurrentBackendUser, deleteBackendAccount, API_BASE_URL} from '../services/backendAuth';

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
import {resolveReaderAppearance} from '../services/scopedReaderAppearance';
import {queueAccountPreferencePatch, syncAccountPreferences} from '../services/accountPreferencesSync';
import {subscribeReadingSettings} from '../services/readerPreferences';
import {useInterfaceScale} from '../context/InterfaceScaleContext';

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
  const [calendarBibleTranslationCode, setCalendarBibleTranslationCode] = React.useState('rst');

  React.useEffect(() => {
    let active = true;
    getCalendarBibleTranslation()
      .then((code) => {
        if (active) setCalendarBibleTranslationCode(code);
      })
      .catch(console.warn);

    return () => { active = false; };
  }, []);

  const changeCalendarBibleTranslation = (code) => {
    setCalendarBibleTranslationCode(code);
    saveCalendarBibleTranslation(code).catch(console.warn);
  };

  const {language, setLanguage} = useLanguage();
  const [readingSettings, setReadingSettings] = useState(DEFAULT_READING_SETTINGS);
  const readingSettingsRef = useRef(DEFAULT_READING_SETTINGS);
  const [showColorPicker, setShowColorPicker] = useState(null);
  const [fontSliderWidth, setFontSliderWidth] = useState(200);
  const uiScale = useInterfaceScale();
  useEffect(() => {
    let active = true;
    const apply = settings => {
      if (!active) return;
      readingSettingsRef.current = settings;
      setReadingSettings(settings);
    };
    const unsub = subscribeReadingSettings(apply);
    getReadingSettings().then(apply).catch(console.warn);
    return () => {active = false; unsub();};
  }, []);
  const changeReadingSettings = async (patch) => {
    const next = {...readingSettingsRef.current, ...patch};
    readingSettingsRef.current = next;
    setReadingSettings(next);
    try {
      await saveReadingSettings(next);
      queueAccountPreferencePatch({settings: patch}).catch(console.warn);
    } catch (error) {
      console.warn('[account preferences] local save:', error);
    }
  };
  // Drag gestures render preview immediately; persist once on finger release.
  const previewReadingSettings = patch => {
    const next = {...readingSettingsRef.current, ...patch};
    readingSettingsRef.current = next;
    setReadingSettings(next);
  };
  const commitReadingSettings = async () => {
    const next = {...readingSettingsRef.current};
    try {
      await saveReadingSettings(next);
      queueAccountPreferencePatch({settings: next}).catch(console.warn);
    } catch (error) {
      console.warn('[account preferences] gesture save:', error);
    }
  };
  const changeCustomColor = (field, color) => {
    const resolved = resolveReaderAppearance(readingSettingsRef.current);
    previewReadingSettings({
      palette: 'custom',
      customBackground: resolved.background,
      customText: resolved.text,
      [field]: color,
    });
  };
  const changeFontFromGesture = event => {
    const position = Math.max(0, Math.min(fontSliderWidth, event.nativeEvent.locationX));
    previewReadingSettings({
      fontSize: Math.max(14, Math.min(28, Math.round(14 + 14 * position / Math.max(fontSliderWidth, 1)))),
    });
  };
  const [googleUser, setGoogleUser] = useState(null);

  const [loading, setLoading] = useState(true);

  const [googleLoading, setGoogleLoading] = useState(false);

  const [googleError, setGoogleError] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [settingsCloudStatus,setSettingsCloudStatus]=useState('');
  const openPolicyPage = path => Linking.openURL(API_BASE_URL + '/api/' + path)
    .catch(error => Alert.alert('Не удалось открыть страницу',error?.message||'Попробуйте позже'));
  const verifyCloudSettings = async () => {
    setSettingsCloudStatus('Проверка...');
    try {
      const result=await syncAccountPreferences();
      setSettingsCloudStatus(result?.success
        ? result.pending?'Есть изменения, ожидающие отправки':'Настройки синхронизированы'
        : 'Синхронизация недоступна: '+(result?.reason||'проверьте интернет'));
    } catch(error) {
      setSettingsCloudStatus('Ошибка синхронизации: '+(error?.message||'попробуйте позже'));
    }
  };
  const deleteAccount = () => Alert.alert(
    'Удалить аккаунт?',
    'Серверный аккаунт, избранное, прогресс чтения, помянники и личные молитвословы будут удалены без возможности восстановления. Локальные данные на устройстве могут сохраниться.',
    [{text: 'Отмена', style: 'cancel'}, {text: 'Удалить навсегда', style: 'destructive', onPress: async () => {
      setDeletingAccount(true);
      try {
        const result=await deleteBackendAccount();
        await signOutFromGoogle().catch(error=>console.warn('[account] Google signout:',error?.message||error));
        setGoogleUser(null);
        setSettingsCloudStatus('');
        Alert.alert('Аккаунт удалён',result.localClean
          ? 'Серверный аккаунт, синхронизированные данные и локальные записи этого аккаунта удалены.'
          : 'Серверный аккаунт удалён. Часть локальных данных могла сохраниться: очистите данные приложения на устройстве.');
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
        preferencesSyncResult,
      ] = await Promise.all([
        syncSavedItems(),
        syncReadingProgress(),
        syncMemorials(),
        syncPrayerBooks(),
        syncAccountPreferences().catch(error => ({success: false, error})),
      ]);

      if (
        savedItemsSyncResult?.success &&
        readingProgressSyncResult?.success &&
        memorialsSyncResult?.success &&
        prayerBooksSyncResult?.success &&
        preferencesSyncResult?.success
      ) {
        console.log('Cloud sync OK: google-login');
      } else {
        const error =
          savedItemsSyncResult?.error ||
          readingProgressSyncResult?.error ||
          memorialsSyncResult?.error ||
          prayerBooksSyncResult?.error ||
          preferencesSyncResult?.error;

        const reason =
          savedItemsSyncResult?.reason ||
          readingProgressSyncResult?.reason ||
          memorialsSyncResult?.reason ||
          prayerBooksSyncResult?.reason ||
          preferencesSyncResult?.reason;

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
      await syncAccountPreferences().catch(console.warn);
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
          <Text style={[styles.title, {fontSize:28*uiScale}]}>Аккаунт</Text>

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
              <Pressable onPress={verifyCloudSettings}
                accessibilityRole="button" style={styles.settingOption}>
                <Text style={styles.settingText}>Проверить синхронизацию тем и настроек</Text>
              </Pressable>
              {!!settingsCloudStatus && (
                <Text style={styles.settingHint}>{settingsCloudStatus}</Text>
              )}

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
            <Text style={[styles.sectionTitle, {fontSize:20*uiScale}]}>Настройки приложения</Text>
            <Text style={[styles.settingCaption, {fontSize:15*uiScale}]}>Язык интерфейса</Text>
            <View style={styles.optionRow}>
              {[{value: 'ru', label: 'Русский'}, {value: 'uk', label: 'Українська'}].map((option) => (
                <Pressable key={option.value} onPress={() => setLanguage(option.value)} style={[styles.settingOption, language === option.value && styles.optionSelected]}>
                  <Text style={[styles.settingText, {fontSize:14*uiScale}]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.settingCaption, {fontSize:15*uiScale}]}>Язык чтения по умолчанию</Text>
            {MODE_CHOICES.map((option) => (
              <Pressable key={option.value} onPress={() => changeReadingSettings({defaultMode: option.value})} style={[styles.settingOption, readingSettings.defaultMode === option.value && styles.optionSelected]}>
                <Text style={[styles.settingText, {fontSize:14*uiScale}]}>{readingSettings.defaultMode === option.value ? '●  ' : '○  '}{option.label}</Text>
              </Pressable>
            ))}
            <Text style={[styles.settingHint, {fontSize:12*uiScale,lineHeight:19*uiScale}]}>Если выбранный перевод отсутствует, будет показан доступный текст. Индивидуально сохранённый режим книги имеет приоритет.</Text>
            <Text style={[styles.settingCaption, {fontSize:15*uiScale}]}>Размер шрифта интерфейса</Text>
            <View style={styles.optionRow}>
              {[1, 1.1, 1.25].map(scale => (
                <Pressable
                  key={String(scale)}
                  accessibilityRole="button"
                  accessibilityState={{selected: readingSettings.interfaceScale === scale}}
                  style={[styles.settingOption, readingSettings.interfaceScale === scale && styles.optionSelected]}
                  onPress={() => changeReadingSettings({interfaceScale: scale})}
                >
                  <Text style={[styles.settingText, {fontSize: 14 * uiScale}]}>{Math.round(scale * 100)}%</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.settingHint, {fontSize:12*uiScale,lineHeight:19*uiScale}]}>Масштабирует подписи интерфейса отдельно от текста молитв.</Text>
            <Text style={[styles.settingCaption, {fontSize:15*uiScale}]}>Размер текста молитв по умолчанию: {readingSettings.fontSize}</Text>
            <View style={styles.fontSizeRow}>
              <Pressable style={styles.settingOption} onPress={() => changeReadingSettings({fontSize: Math.max(14, readingSettingsRef.current.fontSize - 1)})}>
                <Text style={[styles.settingText, {fontSize:14*uiScale}]}>A−</Text>
              </Pressable>
              <View
                style={styles.fontSlider}
                accessibilityRole="adjustable"
                accessibilityLabel="Размер текста молитв"
                accessibilityValue={{min: 14, max: 28, now: readingSettings.fontSize}}
                accessibilityActions={[{name:'increment'}, {name:'decrement'}]}
                onAccessibilityAction={event => changeReadingSettings({
                  fontSize: Math.max(14, Math.min(28, readingSettingsRef.current.fontSize + (event.nativeEvent.actionName === 'increment' ? 1 : -1))),
                })}
                onLayout={event => setFontSliderWidth(event.nativeEvent.layout.width)}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={changeFontFromGesture}
                onResponderMove={changeFontFromGesture}
                onResponderRelease={commitReadingSettings}
                onResponderTerminate={commitReadingSettings}
              >
                <View pointerEvents="none" style={[styles.fontSliderFill, {width: (readingSettings.fontSize - 14) / 14 * 100 + '%'}]}/>
                <View pointerEvents="none" style={[styles.fontSliderThumb, {left: (readingSettings.fontSize - 14) / 14 * 100 + '%'}]}/>
              </View>
              <Pressable style={styles.settingOption} onPress={() => changeReadingSettings({fontSize: Math.min(28, readingSettingsRef.current.fontSize + 1)})}>
                <Text style={[styles.settingText, {fontSize:14*uiScale}]}>A+</Text>
              </Pressable>
            </View>
            <Text style={[styles.settingCaption, {fontSize:15*uiScale}]}>Цветовая тема чтения</Text>
            <View style={styles.palettePresetRow}>
              {PALETTES.filter(option => option.value !== 'custom').map(option => (
                <Pressable key={option.value} accessibilityRole="button"
                  accessibilityState={{selected: readingSettings.palette === option.value}}
                  onPress={() => changeReadingSettings({palette: option.value})}
                  style={styles.palettePreset}
                >
                  <View style={[styles.paletteCircle, {backgroundColor: option.color},
                    readingSettings.palette === option.value && styles.paletteSelected]}/>
                  <Text style={styles.paletteName}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.optionRow}>
              {[{key:'customBackground',label:'Цвет фона'}, {key:'customText',label:'Цвет текста'}].map(option => (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  onPress={() => setShowColorPicker(value => value === option.key ? null : option.key)}
                  style={styles.colorPickerButton}
                >
                  <View style={[styles.colorChip, {backgroundColor: option.key === 'customBackground'
                    ? resolveReaderAppearance(readingSettings).background
                    : resolveReaderAppearance(readingSettings).text}]}/>
                  <Text style={[styles.settingText, {fontSize:14*uiScale}]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            {showColorPicker && (
              <View style={styles.colorPickerPanel}>
                <ColorPalettePicker
                  key={showColorPicker}
                  title={showColorPicker === 'customBackground' ? 'Выбрать фон' : 'Выбрать цвет текста'}
                  color={showColorPicker === 'customBackground'
                    ? resolveReaderAppearance(readingSettings).background
                    : resolveReaderAppearance(readingSettings).text}
                  onChange={color => changeCustomColor(showColorPicker, color)}
                  onGestureEnd={commitReadingSettings}
                />
              </View>
            )}
            <View style={[styles.readerPreview, {backgroundColor: resolveReaderAppearance(readingSettings).background}]}>
              <Text style={{
                fontFamily: 'serif',
                fontSize: readingSettings.fontSize,
                lineHeight: readingSettings.fontSize * 1.65,
                color: resolveReaderAppearance(readingSettings).text,
              }}>Господи, научи меня творить волю Твою.</Text>
            </View>
            <Pressable style={styles.settingOption} onPress={() => Alert.alert(
              'Сбросить общие настройки?',
              'Общие настройки вернутся к исходным. Индивидуальные настройки каждой читалки сохранятся.',
              [{text: 'Отмена', style: 'cancel'}, {text: 'Сбросить', onPress: async () => {
                await setLanguage('ru');
                const reset = await resetReadingSettings();
                await saveReadingSettings(reset);
                readingSettingsRef.current = reset;
                setReadingSettings(reset);
                queueAccountPreferencePatch({settings: {...reset, language: 'ru'}}).catch(console.warn);
              }}]
            )}>
              <Text style={[styles.settingText, {fontSize:14*uiScale}]}>Сбросить общие настройки</Text>
            </Pressable>
          </View>
        <View style={{marginTop:16,padding:14,borderRadius:12,
          backgroundColor:'#F7E8CF',borderWidth:1,borderColor:'#E2CCAA',gap:12}}>
          <Text style={[styles.settingCaption,{fontSize:15*uiScale}]}>
            Конфиденциальность и удаление данных
          </Text>
          <Pressable accessibilityRole="link"
            onPress={()=>openPolicyPage('privacy-policy/')}>
            <Text style={[styles.settingText,{textDecorationLine:'underline'}]}>
              Политика конфиденциальности
            </Text>
          </Pressable>
          <Pressable accessibilityRole="link"
            onPress={()=>openPolicyPage('account-deletion/')}>
            <Text style={[styles.settingText,{textDecorationLine:'underline'}]}>
              Запросить удаление аккаунта через сайт
            </Text>
          </Pressable>
          <Text style={styles.settingHint}>
            Запрос доступен без установки приложения. Для защиты от чужого
            удаления требуется подтверждение принадлежности аккаунта.
          </Text>
        </View>
        <View style={{
  marginTop: 16,
  marginBottom: 12,
  padding: 16,
  borderRadius: 14,
  backgroundColor: '#F7E8CF',
  borderWidth: 1,
  borderColor: '#E2CCAA',
  gap: 10,
}}>
  <Text style={{
    fontSize: 17,
    fontWeight: '700',
    color: '#503524',
  }}>
    Текст Библии в церковном календаре
  </Text>

  {[
    {
      value: 'rst',
      label: 'Русский (Синодальный перевод)',
    },
    {
      value: 'csl_traditional',
      label: 'Церковнославянский (Елизаветинская Библия)',
    },
  ].map((option) => (
    <Pressable
      key={option.value}
      accessibilityRole="radio"
      accessibilityState={{
        selected: calendarBibleTranslationCode === option.value,
      }}
      onPress={() => changeCalendarBibleTranslation(option.value)}
      style={[
        {
          padding: 12,
          borderWidth: 1,
          borderColor: '#E2CCAA',
          borderRadius: 10,
        },
        calendarBibleTranslationCode === option.value && {
          backgroundColor: '#E8CDA4',
          borderColor: '#875627',
        },
      ]}
    >
      <Text style={{color: '#503524', fontSize: 14}}>
        {calendarBibleTranslationCode === option.value ? '●  ' : '○  '}
        {option.label}
      </Text>
    </Pressable>
  ))}

  <Text style={{
    fontSize: 12,
    lineHeight: 19,
    color: '#836A52',
  }}>
    Выбранный перевод используется для библейских чтений
    календаря независимо от языка самой Библии.
  </Text>
</View>
        </ScrollView>

        <BottomNav navigation={navigation} active="account" />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  readerPreview: {padding: 18, borderRadius: 13, minHeight: 85, borderWidth: 1, borderColor: '#AE9070'},
  fontSizeRow: {flexDirection:'row',alignItems:'center',gap:8},
  fontSlider: {flex:1,height:26,borderRadius:12,backgroundColor:'#EFE1CB',borderWidth:1,borderColor:'#D7B991',justifyContent:'center',overflow:'hidden'},
  fontSliderFill: {position:'absolute',top:0,bottom:0,left:0,backgroundColor:'#B38A51'},
  fontSliderThumb: {position:'absolute',height:20,width:15,marginLeft:-7,borderRadius:10,backgroundColor:'#694126',borderWidth:2,borderColor:'#FFF4DE'},
  palettePresetRow: {flexDirection:'row',gap:5,justifyContent:'space-between'},
  palettePreset: {flex:1,alignItems:'center',gap:4},
  paletteName: {fontSize:11,color:'#69472B',textAlign:'center'},
  colorPickerButton: {flex:1,flexDirection:'row',alignItems:'center',gap:8,padding:9,borderRadius:10,backgroundColor:'#F2E0C5'},
  colorChip: {height:23,width:23,borderRadius:6,borderColor:'#A88762',borderWidth:1},
  colorPickerPanel: {padding:10,borderRadius:14,backgroundColor:'#F5E3C6',borderWidth:1,borderColor:'#B19168'},
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
