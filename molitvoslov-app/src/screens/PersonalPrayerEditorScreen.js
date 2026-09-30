import React, {useCallback, useState} from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';

import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {
  addPrayerPhoto,
  addPrayerToBook,
  createPersonalPrayer,
  deletePrayerPhoto,
  getPersonalPrayers,
  updatePersonalPrayer,
} from '../services/prayerBooks';
import {colors, spacing} from '../theme';

export const PersonalPrayerEditorScreen = ({route, navigation}) => {
  const {bookSyncId = null, prayerSyncId = null} = route.params || {};
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;

  const [prayer, setPrayer] = useState(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [pendingAssets, setPendingAssets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [viewerUri, setViewerUri] = useState(null);

  const load = useCallback(async () => {
    if (!prayerSyncId) return;
    const prayers = await getPersonalPrayers();
    const current = prayers.find((item) => item.sync_id === prayerSyncId) || null;
    setPrayer(current);
    if (current) {
      setTitle(current.title || '');
      setText(current.text || '');
    }
  }, [prayerSyncId]);

  useFocusEffect(
    useCallback(() => {
      load().catch((error) => console.log('Ошибка загрузки молитвы:', error));
    }, [load])
  );

  const addAssets = (assets) => {
    const list = Array.isArray(assets) ? assets : [];
    setPendingAssets((current) => [...current, ...list].slice(0, 10));
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Нужен доступ к камере', 'Разрешите доступ к камере, чтобы добавить фото.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (!result.canceled) {
      addAssets(result.assets);
    }
  };

  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
    });
    if (!result.canceled) {
      addAssets(result.assets);
    }
  };

  const save = async () => {
    if (!title.trim()) {
      Alert.alert('Укажите название', 'Например: Молитва перед дорогой.');
      return;
    }
    if (!text.trim() && !(prayer?.photos?.length || pendingAssets.length)) {
      Alert.alert('Добавьте текст или фото', 'Молитва не может быть полностью пустой.');
      return;
    }

    try {
      setSaving(true);
      let current = prayer;
      if (current) {
        current = await updatePersonalPrayer(current.sync_id, {
          title,
          text,
        });
      } else {
        current = await createPersonalPrayer({
          title,
          text,
          origin_type: 'custom',
          origin_data: {created_in_app: true},
        });
      }

      for (const asset of pendingAssets) {
        await addPrayerPhoto(current.sync_id, asset);
      }

      if (bookSyncId) {
        await addPrayerToBook(bookSyncId, current.sync_id);
      }

      setPendingAssets([]);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Не удалось сохранить молитву', error.message || 'Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  const removeExistingPhoto = (photo) => {
    Alert.alert('Удалить фото?', 'Фото будет удалено из этой молитвы.', [
      {text: 'Отмена', style: 'cancel'},
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deletePrayerPhoto(photo.sync_id);
          await load();
        },
      },
    ]);
  };

  const allPhotos = [
    ...(prayer?.photos || []).map((photo) => ({
      key: photo.sync_id,
      uri: photo.uri,
      existing: photo,
    })),
    ...pendingAssets.map((asset, index) => ({
      key: `pending-${index}`,
      uri: asset.uri,
      pendingIndex: index,
    })),
  ].filter((item) => !!item.uri);

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: headerHeight + 18,
            paddingHorizontal: spacing.md,
            paddingBottom: 32 + insets.bottom,
          }}
        >
          <Text style={styles.label}>Название</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Название молитвы"
            placeholderTextColor="#A58A73"
            style={styles.titleInput}
          />

          <Text style={[styles.label, styles.textLabel]}>Текст молитвы</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            placeholder="Вставьте сюда скопированный текст молитвы…"
            placeholderTextColor="#A58A73"
            style={styles.textInput}
          />

          <View style={styles.photoHeading}>
            <View>
              <Text style={styles.label}>Фото</Text>
              <Text style={styles.photoHint}>Можно сохранить молитву и как фотографию.</Text>
            </View>
          </View>

          <View style={styles.photoActions}>
            <Pressable
              onPress={takePhoto}
              style={({pressed}) => [styles.photoButton, pressed && styles.pressed]}
            >
              <Text style={styles.photoButtonText}>Камера</Text>
            </Pressable>
            <Pressable
              onPress={pickPhotos}
              style={({pressed}) => [styles.photoButton, pressed && styles.pressed]}
            >
              <Text style={styles.photoButtonText}>Добавить фото</Text>
            </Pressable>
          </View>

          {!!allPhotos.length && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
              {allPhotos.map((item) => (
                <View key={item.key} style={styles.photoWrap}>
                  <Pressable onPress={() => setViewerUri(item.uri)}>
                    <Image source={{uri: item.uri}} style={styles.photo} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (item.existing) {
                        removeExistingPhoto(item.existing);
                      } else {
                        setPendingAssets((current) =>
                          current.filter((_asset, index) => index !== item.pendingIndex)
                        );
                      }
                    }}
                    style={styles.photoRemove}
                  >
                    <Text style={styles.photoRemoveText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          <Pressable
            onPress={save}
            disabled={saving}
            style={({pressed}) => [
              styles.saveButton,
              saving && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.saveText}>{saving ? 'Сохранение…' : 'Сохранить молитву'}</Text>
          </Pressable>
        </ScrollView>

        <FixedSectionHeader
          title={prayer ? 'Редактировать молитву' : 'Новая молитва'}
          navigation={navigation}
          topInset={insets.top}
        />

        <Modal
          visible={!!viewerUri}
          transparent
          animationType="fade"
          onRequestClose={() => setViewerUri(null)}
        >
          <Pressable style={styles.viewer} onPress={() => setViewerUri(null)}>
            {!!viewerUri && (
              <Image source={{uri: viewerUri}} style={styles.viewerImage} resizeMode="contain" />
            )}
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1},
  label: {color: '#4A2E1D', fontFamily: 'serif', fontSize: 16, fontWeight: '700'},
  titleInput: {
    marginTop: 7,
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.24)',
    borderRadius: 12,
    backgroundColor: '#FFF9ED',
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 16,
  },
  textLabel: {marginTop: 18},
  textInput: {
    marginTop: 7,
    minHeight: 250,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.24)',
    borderRadius: 14,
    backgroundColor: '#FFF9ED',
    color: '#3E2A1D',
    fontFamily: 'serif',
    fontSize: 17,
    lineHeight: 26,
  },
  photoHeading: {marginTop: 20, flexDirection: 'row', justifyContent: 'space-between'},
  photoHint: {marginTop: 3, color: colors.textSecondary, fontSize: 12},
  photoActions: {marginTop: 9, flexDirection: 'row', gap: 8},
  photoButton: {
    minHeight: 39,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(126,82,38,0.28)',
    borderRadius: 12,
    backgroundColor: 'rgba(255,244,222,0.92)',
  },
  photoButtonText: {color: '#765238', fontWeight: '700'},
  photoStrip: {marginTop: 12},
  photoWrap: {marginRight: 10},
  photo: {width: 102, height: 128, borderRadius: 12, backgroundColor: '#EAD7B8'},
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: 'rgba(62,42,29,0.78)',
  },
  photoRemoveText: {color: '#FFF4DE', fontSize: 19, lineHeight: 20},
  saveButton: {
    marginTop: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#7A4F2D',
  },
  saveText: {color: '#FFF4DE', fontSize: 15, fontWeight: '700'},
  disabled: {opacity: 0.45},
  viewer: {
    flex: 1,
    padding: 20,
    backgroundColor: 'rgba(20,12,8,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {width: '100%', height: '100%'},
  pressed: {opacity: 0.65},
});
