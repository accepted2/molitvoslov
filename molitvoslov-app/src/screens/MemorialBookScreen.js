import React, {useCallback, useEffect, useRef, useState} from 'react';

import {
  Alert,
  Image,
  KeyboardAvoidingView,
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

import {MemorialPhotoViewer} from '../components/memorial/MemorialPhotoViewer';

import {
  addMemorialPhoto,
  deleteMemorialBook,
  deleteMemorialPhoto,
  getMemorialBook,
  updateMemorialBook,
} from '../services/memorials';

import {colors, radius, spacing} from '../theme';
import {useLanguage} from '../context/LanguageContext';

const cleanDraftNames = (names) =>
  (names || []).map((name) => String(name || '').trim()).filter(Boolean);

const MIN_VISIBLE_ROWS = 4;

const ensureInputRows = (names, minimumRows = MIN_VISIBLE_ROWS) => {
  const next = Array.isArray(names) ? [...names] : [];

  while (next.length < minimumRows) {
    next.push('');
  }

  if (next.length && String(next[next.length - 1] || '').trim()) {
    next.push('');
  }

  return next;
};

const NameEditor = ({title, subtitle, names, onChange}) => {
  const {t} = useLanguage();
  const inputRefs = useRef([]);

  const filledCount = names.filter((name) => String(name || '').trim()).length;

  const update = (index, value) => {
    const next = [...names];

    next[index] = value;

    if (index === next.length - 1 && String(value || '').trim()) {
      next.push('');
    }

    onChange(ensureInputRows(next));
  };

  const addRows = (count = 4) => {
    const next = [...names, ...Array.from({length: count}, () => '')];

    onChange(next);

    requestAnimationFrame(() => {
      const firstNewIndex = names.length;

      inputRefs.current[firstNewIndex]?.focus?.();
    });
  };

  const remove = (index) => {
    const next = names.filter((_item, itemIndex) => itemIndex !== index);

    onChange(ensureInputRows(next));
  };

  const move = (index, direction) => {
    const target = index + direction;

    if (target < 0 || target >= names.length) {
      return;
    }

    const next = [...names];

    const current = next[index];

    next[index] = next[target];

    next[target] = current;

    onChange(next);

    requestAnimationFrame(() => {
      inputRefs.current[target]?.focus?.();
    });
  };

  const focusNext = (index) => {
    const nextIndex = index + 1;

    if (nextIndex >= names.length) {
      addRows(1);
      return;
    }

    requestAnimationFrame(() => {
      inputRefs.current[nextIndex]?.focus?.();
    });
  };

  return (
    <View style={styles.namesCard}>
      <View style={styles.namesHeader}>
        <Text style={styles.namesTitle}>{title}</Text>

        <Text style={styles.namesCount}>
          {filledCount
            ? t(
                filledCount === 1
                  ? 'memorial.nameCountOne'
                  : filledCount < 5
                    ? 'memorial.nameCountFew'
                    : 'memorial.nameCountMany',
                {count: filledCount}
              )
            : t('memorial.empty')}
        </Text>
      </View>

      <Text style={styles.namesSubtitle}>{subtitle}</Text>

      <View style={styles.paperSheet}>
        <View pointerEvents="none" style={styles.paperMarginLine} />

        {names.map((name, index) => (
          <View key={`${title}-${index}`} style={styles.nameRow}>
            <Text style={styles.nameNumber}>{index + 1}</Text>

            <TextInput
              ref={(node) => {
                inputRefs.current[index] = node;
              }}
              value={name}
              onChangeText={(value) => update(index, value)}
              onSubmitEditing={() => focusNext(index)}
              placeholder={index === 0 ? t('memorial.enterName') : ''}
              placeholderTextColor={'#B4A693'}
              autoCapitalize="words"
              autoCorrect={false}
              spellCheck={false}
              keyboardType="default"
              inputMode="text"
              maxLength={100}
              returnKeyType="next"
              blurOnSubmit={false}
              style={styles.nameInput}
            />

            <View style={styles.rowActions}>
              <Pressable
                hitSlop={5}
                disabled={index === 0}
                onPress={() => move(index, -1)}
                style={({pressed}) => [
                  styles.miniButton,
                  index === 0 && styles.miniButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.miniButtonText}>↑</Text>
              </Pressable>

              <Pressable
                hitSlop={5}
                disabled={index === names.length - 1}
                onPress={() => move(index, 1)}
                style={({pressed}) => [
                  styles.miniButton,
                  index === names.length - 1 && styles.miniButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.miniButtonText}>↓</Text>
              </Pressable>

              <Pressable
                hitSlop={5}
                onPress={() => remove(index)}
                style={({pressed}) => [styles.removeButton, pressed && styles.pressed]}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => addRows(4)}
        style={({pressed}) => [styles.addNameButton, pressed && styles.pressed]}
      >
        <Text style={styles.addNameText}>{t('memorial.addFourRows')}</Text>
      </Pressable>
    </View>
  );
};

export const MemorialBookScreen = ({navigation, route}) => {
  const {t} = useLanguage();
  const insets = useSafeAreaInsets();

  const headerHeight = insets.top + 56;

  const bookSyncId = route.params?.bookSyncId;

  const [book, setBook] = useState(null);

  const [title, setTitle] = useState('');

  const [healthNames, setHealthNames] = useState(['']);

  const [reposeNames, setReposeNames] = useState(['']);

  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);

  const [saveStatus, setSaveStatus] = useState('save');

  const [viewer, setViewer] = useState({
    visible: false,
    photos: [],
    index: 0,
  });

  const draftRef = useRef({
    title: '',
    healthNames: [''],
    reposeNames: [''],
  });

  const dirtyRef = useRef(false);

  /*
   * Защищает от редкого сценария, когда пользователь успевает
   * изменить имя во время уже запущенного сохранения.
   */
  const editRevisionRef = useRef(0);

  const allowLeaveRef = useRef(false);

  const leavingRef = useRef(false);

  useEffect(() => {
    draftRef.current = {
      title,
      healthNames,
      reposeNames,
    };
  }, [title, healthNames, reposeNames]);

  const markDirty = () => {
    editRevisionRef.current += 1;
    dirtyRef.current = true;
    setDirty(true);
    setSaveStatus('save');
  };

  const load = useCallback(async () => {
    if (!bookSyncId) {
      return;
    }

    try {
      const current = await getMemorialBook(bookSyncId);

      if (!current) {
        Alert.alert(t('memorial.notFoundTitle'), t('memorial.notFoundText'), [
          {
            text: t('memorial.back'),
            onPress: () => navigation.goBack(),
          },
        ]);

        return;
      }

      setBook(current);

      setTitle(current.title || t('memorial.my'));

      setHealthNames(ensureInputRows(current.health_names));

      setReposeNames(ensureInputRows(current.repose_names));

      dirtyRef.current = false;

      setDirty(false);
      setSaveStatus('save');
    } catch (error) {
      console.log('Ошибка открытия помянника:', error?.message || error);
    }
  }, [bookSyncId, navigation, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const saveDraft = useCallback(async () => {
    if (!bookSyncId || !dirtyRef.current) {
      return true;
    }

    if (saving) {
      return false;
    }

    try {
      setSaving(true);
      setSaveStatus('saving');

      const revisionAtStart = editRevisionRef.current;

      const draft = {
        title: draftRef.current.title,

        healthNames: [...draftRef.current.healthNames],

        reposeNames: [...draftRef.current.reposeNames],
      };

      const updated = await updateMemorialBook(bookSyncId, {
        title: draft.title,

        health_names: cleanDraftNames(draft.healthNames),

        repose_names: cleanDraftNames(draft.reposeNames),
      });

      if (updated) {
        setBook(updated);
      }

      /*
       * Если во время await появилась новая правка,
       * не помечаем её как сохранённую.
       */
      if (editRevisionRef.current !== revisionAtStart) {
        dirtyRef.current = true;

        setDirty(true);
        setSaveStatus('hasChanges');

        return false;
      }

      dirtyRef.current = false;

      setDirty(false);
      setSaveStatus('saved');

      return true;
    } catch (error) {
      console.log('Ошибка сохранения помянника:', error?.message || error);

      setSaveStatus('error');

      Alert.alert(t('memorial.saveErrorTitle'), error?.message || t('common.tryAgain'));

      return false;
    } finally {
      setSaving(false);
    }
  }, [bookSyncId, saving, t]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current || !dirtyRef.current || leavingRef.current) {
        return;
      }

      event.preventDefault();

      leavingRef.current = true;

      saveDraft()
        .then((success) => {
          if (!success) {
            leavingRef.current = false;
            return;
          }

          allowLeaveRef.current = true;

          navigation.dispatch(event.data.action);
        })
        .catch(() => {
          leavingRef.current = false;
        });
    });

    return unsubscribe;
  }, [navigation, saveDraft]);

  const changeTitle = (value) => {
    setTitle(value);
    markDirty();
  };

  const changeHealth = (value) => {
    setHealthNames(value);
    markDirty();
  };

  const changeRepose = (value) => {
    setReposeNames(value);
    markDirty();
  };

  const refreshBook = async () => {
    const current = await getMemorialBook(bookSyncId);

    if (current) {
      setBook(current);
    }
  };

  const addAssets = async (assets) => {
    const list = Array.isArray(assets) ? assets : [];

    if (!list.length) {
      return;
    }

    try {
      for (const asset of list) {
        await addMemorialPhoto(bookSyncId, asset);
      }

      await refreshBook();
    } catch (error) {
      console.log('Ошибка добавления фото:', error?.message || error);

      Alert.alert(t('memorial.addPhotoError'), error?.message || t('common.tryAgain'));
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        t('memorial.cameraPermissionTitle'),
        t('memorial.cameraPermissionText')
      );

      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });

    if (!result.canceled) {
      await addAssets(result.assets);
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
      await addAssets(result.assets);
    }
  };

  const removePhoto = (photo) => {
    Alert.alert(t('memorial.deletePhotoTitle'), t('memorial.deletePhotoText'), [
      {
        text: t('memorial.cancel'),
        style: 'cancel',
      },
      {
        text: t('memorial.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMemorialPhoto(photo.sync_id);

            await refreshBook();
          } catch (error) {
            Alert.alert(t('memorial.deletePhotoError'), error?.message || t('common.tryAgain'));
          }
        },
      },
    ]);
  };

  const confirmDeleteBook = () => {
    Alert.alert(t('memorial.deleteBookTitle'), t('memorial.deleteBookText'), [
      {
        text: t('memorial.cancel'),
        style: 'cancel',
      },
      {
        text: t('memorial.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            allowLeaveRef.current = true;

            await deleteMemorialBook(bookSyncId);

            navigation.navigate('Memorial');
          } catch (error) {
            allowLeaveRef.current = false;

            Alert.alert(t('common.deleteFailed'), error?.message || t('common.tryAgain'));
          }
        },
      },
    ]);
  };

  const photos = book?.photos || [];

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: headerHeight + 18,

              paddingBottom: Math.max(insets.bottom, 12) + 30,
            },
          ]}
        >
          <View style={styles.titleCard}>
            <Text style={styles.fieldLabel}>{t('memorial.titleField')}</Text>

            <TextInput
              value={title}
              onChangeText={changeTitle}
              maxLength={120}
              keyboardType="default"
              inputMode="text"
              autoCorrect={false}
              spellCheck={false}
              placeholder={t('memorial.my')}
              placeholderTextColor={colors.textMuted}
              style={styles.titleInput}
            />

            <Text style={styles.syncHint}>
              {book?.cloud_user_id
                ? t('memorial.syncedHint')
                : t('memorial.deviceOnly')}
            </Text>
          </View>

          <NameEditor
            title={t('memorial.health')}
            subtitle={t('memorial.healthHint')}
            names={healthNames}
            onChange={changeHealth}
          />

          <NameEditor
            title={t('memorial.repose')}
            subtitle={t('memorial.reposeHint')}
            names={reposeNames}
            onChange={changeRepose}
          />

          <View style={styles.photoCard}>
            <Text style={styles.namesTitle}>{t('memorial.photoNotes')}</Text>

            <Text style={styles.namesSubtitle}>
              {t('memorial.photoNotesHint')}
            </Text>

            <View style={styles.photoActions}>
              <Pressable
                onPress={takePhoto}
                style={({pressed}) => [styles.photoAction, pressed && styles.pressed]}
              >
                <Text style={styles.photoActionIcon}>◉</Text>

                <Text style={styles.photoActionText}>{t('memorial.camera')}</Text>
              </Pressable>

              <Pressable
                onPress={pickPhotos}
                style={({pressed}) => [styles.photoAction, pressed && styles.pressed]}
              >
                <Text style={styles.photoActionIcon}>▧</Text>

                <Text style={styles.photoActionText}>{t('memorial.addPhoto')}</Text>
              </Pressable>
            </View>

            {!!photos.length && (
              <View style={styles.photoGrid}>
                {photos.map((photo, index) => {
                  const uri = photo.display_uri || photo.local_uri || photo.remote_url;

                  if (!uri) {
                    return null;
                  }

                  return (
                    <View key={photo.sync_id || photo.id} style={styles.photoTile}>
                      <Pressable
                        onPress={() =>
                          setViewer({
                            visible: true,
                            photos,
                            index,
                          })
                        }
                        style={({pressed}) => [styles.photoPreview, pressed && styles.pressed]}
                      >
                        <Image
                          source={{
                            uri,
                          }}
                          style={styles.photo}
                        />
                      </Pressable>

                      <Pressable
                        hitSlop={6}
                        onPress={() => removePhoto(photo)}
                        style={({pressed}) => [styles.photoDelete, pressed && styles.pressed]}
                      >
                        <Text style={styles.photoDeleteText}>×</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <Pressable
            onPress={saveDraft}
            disabled={saving || !dirty}
            style={({pressed}) => [
              styles.saveButton,
              !dirty && styles.saveButtonIdle,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.saveText}>{t(`memorial.${saveStatus}`)}</Text>
          </Pressable>

          <Pressable
            onPress={confirmDeleteBook}
            style={({pressed}) => [styles.deleteBookButton, pressed && styles.pressed]}
          >
            <Text style={styles.deleteBookText}>{t('memorial.deleteBook')}</Text>
          </Pressable>
        </ScrollView>

        <FixedSectionHeader
          title={title || t('memorial.title')}
          navigation={navigation}
          topInset={insets.top}
        />
      </KeyboardAvoidingView>

      <MemorialPhotoViewer
        visible={viewer.visible}
        photos={viewer.photos}
        initialIndex={viewer.index}
        onClose={() =>
          setViewer((current) => ({
            ...current,
            visible: false,
          }))
        }
      />
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  content: {
    paddingHorizontal: spacing.lg,
  },

  titleCard: {
    marginBottom: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 244, 222, 0.90)',
  },

  fieldLabel: {
    marginBottom: 6,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  titleInput: {
    minHeight: 45,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    color: colors.text,
    backgroundColor: 'rgba(255, 250, 240, 0.88)',
    fontFamily: 'serif',
    fontSize: 18,
  },

  syncHint: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },

  namesCard: {
    marginBottom: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 244, 222, 0.90)',
  },

  namesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  namesTitle: {
    flexShrink: 1,
    color: colors.liturgical,
    fontFamily: 'serif',
    fontSize: 19,
    fontWeight: '700',
  },

  namesCount: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    color: colors.accentDark,
    backgroundColor: 'rgba(138, 90, 56, 0.09)',
    fontSize: 11,
    fontWeight: '700',
  },

  namesSubtitle: {
    marginTop: 3,
    marginBottom: 10,
    color: colors.textSecondary,
    fontFamily: 'serif',
    fontSize: 12,
    lineHeight: 17,
  },

  paperSheet: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(139, 101, 63, 0.20)',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 250, 238, 0.96)',
  },

  paperMarginLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 34,
    width: 1,
    backgroundColor: 'rgba(163, 58, 50, 0.16)',
  },

  nameRow: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(92, 119, 145, 0.16)',
  },

  nameNumber: {
    width: 33,
    paddingRight: 6,
    color: 'rgba(138, 90, 56, 0.65)',
    fontFamily: 'serif',
    fontSize: 11,
    textAlign: 'right',
  },

  nameInput: {
    flex: 1,
    minWidth: 40,
    height: 38,
    paddingHorizontal: 9,
    paddingVertical: 5,
    color: colors.text,
    backgroundColor: 'transparent',
    fontFamily: 'serif',
    fontSize: 16,
  },

  rowActions: {
    paddingRight: 4,
    flexDirection: 'row',
    gap: 1,
  },

  miniButton: {
    width: 24,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: 'transparent',
  },

  miniButtonDisabled: {
    opacity: 0.18,
  },

  miniButtonText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: '700',
  },

  removeButton: {
    width: 24,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: 'transparent',
  },

  removeButtonText: {
    marginTop: -1,
    color: colors.liturgical,
    fontSize: 18,
    lineHeight: 20,
  },

  addNameButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: 'rgba(138, 90, 56, 0.08)',
  },

  addNameText: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: '700',
  },

  photoCard: {
    marginBottom: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255, 244, 222, 0.90)',
  },

  photoActions: {
    flexDirection: 'row',
    gap: 8,
  },

  photoAction: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 10,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: 'rgba(138, 90, 56, 0.07)',
  },

  photoActionIcon: {
    color: colors.accentDark,
    fontSize: 17,
  },

  photoActionText: {
    textAlign: 'center',
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: '700',
  },

  photoGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },

  photoTile: {
    position: 'relative',
    width: 92,
    height: 118,
  },

  photoPreview: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },

  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  photoDelete: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(163, 58, 50, 0.28)',
    backgroundColor: '#FFF4DE',
  },

  photoDeleteText: {
    marginTop: -2,
    color: colors.liturgical,
    fontSize: 20,
    lineHeight: 21,
  },

  saveButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentDark,
  },

  saveButtonIdle: {
    backgroundColor: 'rgba(104, 66, 41, 0.45)',
  },

  saveText: {
    color: '#FFF8EA',
    fontSize: 15,
    fontWeight: '800',
  },

  deleteBookButton: {
    alignSelf: 'center',
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  deleteBookText: {
    color: colors.liturgical,
    fontSize: 13,
    fontWeight: '700',
  },

  pressed: {
    opacity: 0.62,
  },
});
