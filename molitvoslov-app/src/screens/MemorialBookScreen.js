import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

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

import {
  useFocusEffect,
} from '@react-navigation/native';

import {
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  StatusBar,
} from 'expo-status-bar';

import * as ImagePicker from 'expo-image-picker';

import {
  AppBackground,
} from '../components/layout/AppBackground';

import {
  FixedSectionHeader,
} from '../components/navigation/FixedSectionHeader';

import {
  MemorialPhotoViewer,
} from '../components/memorial/MemorialPhotoViewer';

import {
  addMemorialPhoto,
  deleteMemorialBook,
  deleteMemorialPhoto,
  getMemorialBook,
  updateMemorialBook,
} from '../services/memorials';

import {
  colors,
  radius,
  spacing,
} from '../theme';

const cleanDraftNames = (
  names
) =>
  (names || [])
    .map((name) =>
      String(name || '').trim()
    )
    .filter(Boolean);

const ensureInputRows = (
  names
) =>
  names?.length
    ? names
    : [''];

const NameEditor = ({
  title,
  subtitle,
  names,
  onChange,
}) => {
  const update = (
    index,
    value
  ) => {
    const next = [
      ...names,
    ];

    next[index] = value;
    onChange(next);
  };

  const add = () => {
    onChange([
      ...names,
      '',
    ]);
  };

  const remove = (
    index
  ) => {
    const next =
      names.filter(
        (_item, itemIndex) =>
          itemIndex !== index
      );

    onChange(
      ensureInputRows(next)
    );
  };

  const move = (
    index,
    direction
  ) => {
    const target =
      index + direction;

    if (
      target < 0 ||
      target >= names.length
    ) {
      return;
    }

    const next = [
      ...names,
    ];

    const current =
      next[index];

    next[index] =
      next[target];

    next[target] =
      current;

    onChange(next);
  };

  return (
    <View
      style={
        styles.namesCard
      }
    >
      <Text
        style={
          styles.namesTitle
        }
      >
        {title}
      </Text>

      <Text
        style={
          styles.namesSubtitle
        }
      >
        {subtitle}
      </Text>

      {names.map(
        (name, index) => (
          <View
            key={`${title}-${index}`}
            style={
              styles.nameRow
            }
          >
            <Text
              style={
                styles.nameNumber
              }
            >
              {index + 1}.
            </Text>

            <TextInput
              value={name}
              onChangeText={(
                value
              ) =>
                update(
                  index,
                  value
                )
              }
              placeholder="Имя"
              placeholderTextColor={
                '#A89A8B'
              }
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={100}
              returnKeyType="next"
              style={
                styles.nameInput
              }
            />

            <View
              style={
                styles.rowActions
              }
            >
              <Pressable
                hitSlop={5}
                disabled={
                  index === 0
                }
                onPress={() =>
                  move(index, -1)
                }
                style={({pressed}) => [
                  styles.miniButton,
                  index === 0 &&
                    styles.miniButtonDisabled,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.miniButtonText
                  }
                >
                  ↑
                </Text>
              </Pressable>

              <Pressable
                hitSlop={5}
                disabled={
                  index ===
                  names.length - 1
                }
                onPress={() =>
                  move(index, 1)
                }
                style={({pressed}) => [
                  styles.miniButton,
                  index ===
                    names.length - 1 &&
                    styles.miniButtonDisabled,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.miniButtonText
                  }
                >
                  ↓
                </Text>
              </Pressable>

              <Pressable
                hitSlop={5}
                onPress={() =>
                  remove(index)
                }
                style={({pressed}) => [
                  styles.removeButton,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.removeButtonText
                  }
                >
                  ×
                </Text>
              </Pressable>
            </View>
          </View>
        )
      )}

      <Pressable
        onPress={add}
        style={({pressed}) => [
          styles.addNameButton,
          pressed &&
            styles.pressed,
        ]}
      >
        <Text
          style={
            styles.addNameText
          }
        >
          + Добавить имя
        </Text>
      </Pressable>
    </View>
  );
};

export const MemorialBookScreen = ({
  navigation,
  route,
}) => {
  const insets =
    useSafeAreaInsets();

  const headerHeight =
    insets.top + 56;

  const bookSyncId =
    route.params
      ?.bookSyncId;

  const [book, setBook] =
    useState(null);

  const [title, setTitle] =
    useState('');

  const [
    healthNames,
    setHealthNames,
  ] = useState(['']);

  const [
    reposeNames,
    setReposeNames,
  ] = useState(['']);

  const [dirty, setDirty] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [saveLabel, setSaveLabel] =
    useState('Сохранить');

  const [viewer, setViewer] =
    useState({
      visible: false,
      photos: [],
      index: 0,
    });

  const draftRef =
    useRef({
      title: '',
      healthNames: [''],
      reposeNames: [''],
    });

  const dirtyRef =
    useRef(false);

  /*
   * Защищает от редкого сценария, когда пользователь успевает
   * изменить имя во время уже запущенного сохранения.
   */
  const editRevisionRef =
    useRef(0);

  const allowLeaveRef =
    useRef(false);

  const leavingRef =
    useRef(false);

  useEffect(() => {
    draftRef.current = {
      title,
      healthNames,
      reposeNames,
    };
  }, [
    title,
    healthNames,
    reposeNames,
  ]);

  const markDirty = () => {
    editRevisionRef.current += 1;
    dirtyRef.current = true;
    setDirty(true);
    setSaveLabel(
      'Сохранить'
    );
  };

  const load = useCallback(
    async () => {
      if (!bookSyncId) {
        return;
      }

      try {
        const current =
          await getMemorialBook(
            bookSyncId
          );

        if (!current) {
          Alert.alert(
            'Помянник не найден',
            'Возможно, он был удалён.',
            [
              {
                text: 'Назад',
                onPress: () =>
                  navigation.goBack(),
              },
            ]
          );

          return;
        }

        setBook(current);

        setTitle(
          current.title ||
            'Мой помянник'
        );

        setHealthNames(
          ensureInputRows(
            current.health_names
          )
        );

        setReposeNames(
          ensureInputRows(
            current.repose_names
          )
        );

        dirtyRef.current =
          false;

        setDirty(false);
        setSaveLabel(
          'Сохранить'
        );
      } catch (error) {
        console.log(
          'Ошибка открытия помянника:',
          error?.message ||
            error
        );
      }
    },
    [
      bookSyncId,
      navigation,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const saveDraft =
    useCallback(
      async () => {
        if (
          !bookSyncId ||
          !dirtyRef.current
        ) {
          return true;
        }

        if (saving) {
          return false;
        }

        try {
          setSaving(true);
          setSaveLabel(
            'Сохраняем…'
          );

          const revisionAtStart =
            editRevisionRef.current;

          const draft = {
            title:
              draftRef.current.title,

            healthNames: [
              ...draftRef.current.healthNames,
            ],

            reposeNames: [
              ...draftRef.current.reposeNames,
            ],
          };

          const updated =
            await updateMemorialBook(
              bookSyncId,
              {
                title:
                  draft.title,

                health_names:
                  cleanDraftNames(
                    draft.healthNames
                  ),

                repose_names:
                  cleanDraftNames(
                    draft.reposeNames
                  ),
              }
            );

          if (updated) {
            setBook(updated);
          }

          /*
           * Если во время await появилась новая правка,
           * не помечаем её как сохранённую.
           */
          if (
            editRevisionRef.current !==
            revisionAtStart
          ) {
            dirtyRef.current =
              true;

            setDirty(true);
            setSaveLabel(
              'Есть изменения'
            );

            return false;
          }

          dirtyRef.current =
            false;

          setDirty(false);
          setSaveLabel(
            'Сохранено'
          );

          return true;
        } catch (error) {
          console.log(
            'Ошибка сохранения помянника:',
            error?.message ||
              error
          );

          setSaveLabel(
            'Ошибка'
          );

          Alert.alert(
            'Не удалось сохранить',
            error?.message ||
              'Попробуйте ещё раз.'
          );

          return false;
        } finally {
          setSaving(false);
        }
      },
      [
        bookSyncId,
        saving,
      ]
    );

  useEffect(() => {
    const unsubscribe =
      navigation.addListener(
        'beforeRemove',
        (event) => {
          if (
            allowLeaveRef.current ||
            !dirtyRef.current ||
            leavingRef.current
          ) {
            return;
          }

          event.preventDefault();

          leavingRef.current =
            true;

          saveDraft()
            .then(
              (success) => {
                if (!success) {
                  leavingRef.current =
                    false;
                  return;
                }

                allowLeaveRef.current =
                  true;

                navigation.dispatch(
                  event.data.action
                );
              }
            )
            .catch(() => {
              leavingRef.current =
                false;
            });
        }
      );

    return unsubscribe;
  }, [
    navigation,
    saveDraft,
  ]);

  const changeTitle = (
    value
  ) => {
    setTitle(value);
    markDirty();
  };

  const changeHealth = (
    value
  ) => {
    setHealthNames(value);
    markDirty();
  };

  const changeRepose = (
    value
  ) => {
    setReposeNames(value);
    markDirty();
  };

  const refreshBook =
    async () => {
      const current =
        await getMemorialBook(
          bookSyncId
        );

      if (current) {
        setBook(current);
      }
    };

  const addAssets =
    async (
      assets
    ) => {
      const list =
        Array.isArray(assets)
          ? assets
          : [];

      if (!list.length) {
        return;
      }

      try {
        for (const asset of list) {
          await addMemorialPhoto(
            bookSyncId,
            asset
          );
        }

        await refreshBook();
      } catch (error) {
        console.log(
          'Ошибка добавления фото:',
          error?.message ||
            error
        );

        Alert.alert(
          'Не удалось добавить фото',
          error?.message ||
            'Попробуйте ещё раз.'
        );
      }
    };

  const takePhoto =
    async () => {
      const permission =
        await ImagePicker
          .requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Нужен доступ к камере',
          'Разрешите доступ к камере, чтобы сфотографировать записку.'
        );

        return;
      }

      const result =
        await ImagePicker
          .launchCameraAsync({
            mediaTypes: [
              'images',
            ],
            quality: 0.9,
          });

      if (
        !result.canceled
      ) {
        await addAssets(
          result.assets
        );
      }
    };

  const pickPhotos =
    async () => {
      const result =
        await ImagePicker
          .launchImageLibraryAsync({
            mediaTypes: [
              'images',
            ],
            allowsMultipleSelection:
              true,
            selectionLimit: 10,
            quality: 1,
          });

      if (
        !result.canceled
      ) {
        await addAssets(
          result.assets
        );
      }
    };

  const removePhoto = (
    photo
  ) => {
    Alert.alert(
      'Удалить фотографию?',
      'Она будет удалена из этого помянника.',
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
        {
          text: 'Удалить',
          style:
            'destructive',
          onPress:
            async () => {
              try {
                await deleteMemorialPhoto(
                  photo.sync_id
                );

                await refreshBook();
              } catch (error) {
                Alert.alert(
                  'Не удалось удалить фото',
                  error?.message ||
                    'Попробуйте ещё раз.'
                );
              }
            },
        },
      ]
    );
  };

  const confirmDeleteBook =
    () => {
      Alert.alert(
        'Удалить помянник?',
        'Имена и фотографии этого помянника будут удалены.',
        [
          {
            text: 'Отмена',
            style: 'cancel',
          },
          {
            text: 'Удалить',
            style:
              'destructive',
            onPress:
              async () => {
                try {
                  allowLeaveRef.current =
                    true;

                  await deleteMemorialBook(
                    bookSyncId
                  );

                  navigation.navigate(
                    'Memorial'
                  );
                } catch (error) {
                  allowLeaveRef.current =
                    false;

                  Alert.alert(
                    'Не удалось удалить',
                    error?.message ||
                      'Попробуйте ещё раз.'
                  );
                }
              },
          },
        ]
      );
    };

  const photos =
    book?.photos || [];

  return (
    <AppBackground
      imageOpacity={0.72}
    >
      <StatusBar
        style="light"
        translucent
        backgroundColor="transparent"
      />

      <KeyboardAvoidingView
        style={
          styles.screen
        }
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={[
            styles.content,
            {
              paddingTop:
                headerHeight +
                18,

              paddingBottom:
                Math.max(
                  insets.bottom,
                  12
                ) + 30,
            },
          ]}
        >
          <View
            style={
              styles.titleCard
            }
          >
            <Text
              style={
                styles.fieldLabel
              }
            >
              НАЗВАНИЕ
            </Text>

            <TextInput
              value={title}
              onChangeText={
                changeTitle
              }
              maxLength={120}
              placeholder="Мой помянник"
              placeholderTextColor={
                colors.textMuted
              }
              style={
                styles.titleInput
              }
            />

            <Text
              style={
                styles.syncHint
              }
            >
              {book?.cloud_user_id
                ? 'Сохраняется на устройстве и синхронизируется с аккаунтом.'
                : 'Без аккаунта данные хранятся только на этом устройстве.'}
            </Text>
          </View>

          <NameEditor
            title="О здравии"
            subtitle="Живые родные, близкие и все, о ком хотите помолиться."
            names={
              healthNames
            }
            onChange={
              changeHealth
            }
          />

          <NameEditor
            title="Об упокоении"
            subtitle="Имена усопших для молитвенного поминовения."
            names={
              reposeNames
            }
            onChange={
              changeRepose
            }
          />

          <View
            style={
              styles.photoCard
            }
          >
            <Text
              style={
                styles.namesTitle
              }
            >
              Фотографии записок
            </Text>

            <Text
              style={
                styles.namesSubtitle
              }
            >
              Сфотографируйте бумажную
              записку или выберите
              готовое фото. Во время
              чтения его можно открыть
              на весь экран и листать.
            </Text>

            <View
              style={
                styles.photoActions
              }
            >
              <Pressable
                onPress={
                  takePhoto
                }
                style={({
                  pressed,
                }) => [
                  styles.photoAction,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.photoActionIcon
                  }
                >
                  ◉
                </Text>

                <Text
                  style={
                    styles.photoActionText
                  }
                >
                  Сфотографировать
                </Text>
              </Pressable>

              <Pressable
                onPress={
                  pickPhotos
                }
                style={({
                  pressed,
                }) => [
                  styles.photoAction,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.photoActionIcon
                  }
                >
                  ▧
                </Text>

                <Text
                  style={
                    styles.photoActionText
                  }
                >
                  Из галереи
                </Text>
              </Pressable>
            </View>

            {!!photos.length && (
              <View
                style={
                  styles.photoGrid
                }
              >
                {photos.map(
                  (
                    photo,
                    index
                  ) => {
                    const uri =
                      photo.display_uri ||
                      photo.local_uri ||
                      photo.remote_url;

                    if (!uri) {
                      return null;
                    }

                    return (
                      <View
                        key={
                          photo.sync_id ||
                          photo.id
                        }
                        style={
                          styles.photoTile
                        }
                      >
                        <Pressable
                          onPress={() =>
                            setViewer({
                              visible:
                                true,
                              photos,
                              index,
                            })
                          }
                          style={({
                            pressed,
                          }) => [
                            styles.photoPreview,
                            pressed &&
                              styles.pressed,
                          ]}
                        >
                          <Image
                            source={{
                              uri,
                            }}
                            style={
                              styles.photo
                            }
                          />
                        </Pressable>

                        <Pressable
                          hitSlop={6}
                          onPress={() =>
                            removePhoto(
                              photo
                            )
                          }
                          style={({
                            pressed,
                          }) => [
                            styles.photoDelete,
                            pressed &&
                              styles.pressed,
                          ]}
                        >
                          <Text
                            style={
                              styles.photoDeleteText
                            }
                          >
                            ×
                          </Text>
                        </Pressable>
                      </View>
                    );
                  }
                )}
              </View>
            )}
          </View>

          <Pressable
            onPress={
              saveDraft
            }
            disabled={
              saving ||
              !dirty
            }
            style={({
              pressed,
            }) => [
              styles.saveButton,
              !dirty &&
                styles.saveButtonIdle,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.saveText
              }
            >
              {saveLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={
              confirmDeleteBook
            }
            style={({
              pressed,
            }) => [
              styles.deleteBookButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.deleteBookText
              }
            >
              Удалить помянник
            </Text>
          </Pressable>
        </ScrollView>

        <FixedSectionHeader
          title={
            title ||
            'Помянник'
          }
          navigation={
            navigation
          }
          topInset={insets.top}
        />
      </KeyboardAvoidingView>

      <MemorialPhotoViewer
        visible={
          viewer.visible
        }
        photos={
          viewer.photos
        }
        initialIndex={
          viewer.index
        }
        onClose={() =>
          setViewer(
            (current) => ({
              ...current,
              visible: false,
            })
          )
        }
      />
    </AppBackground>
  );
};

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
    },

    content: {
      paddingHorizontal:
        spacing.lg,
    },

    titleCard: {
      marginBottom: 14,
      padding: 16,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.lg,
      backgroundColor:
        'rgba(255, 244, 222, 0.90)',
    },

    fieldLabel: {
      marginBottom: 6,
      color:
        colors.textMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },

    titleInput: {
      minHeight: 45,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor:
        colors.borderStrong,
      borderRadius:
        radius.md,
      color:
        colors.text,
      backgroundColor:
        'rgba(255, 250, 240, 0.88)',
      fontFamily: 'serif',
      fontSize: 18,
    },

    syncHint: {
      marginTop: 8,
      color:
        colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },

    namesCard: {
      marginBottom: 14,
      padding: 16,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.lg,
      backgroundColor:
        'rgba(255, 244, 222, 0.90)',
    },

    namesTitle: {
      color:
        colors.liturgical,
      fontFamily: 'serif',
      fontSize: 19,
      fontWeight: '700',
    },

    namesSubtitle: {
      marginTop: 4,
      marginBottom: 13,
      color:
        colors.textSecondary,
      fontFamily: 'serif',
      fontSize: 13,
      lineHeight: 19,
    },

    nameRow: {
      minHeight: 48,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },

    nameNumber: {
      width: 27,
      color:
        colors.accent,
      fontFamily: 'serif',
      fontSize: 14,
      textAlign: 'right',
      marginRight: 7,
    },

    nameInput: {
      flex: 1,
      height: 46,
      paddingHorizontal: 11,
      borderWidth: 1,
      borderColor:
        colors.borderStrong,
      borderRadius:
        radius.md,
      color:
        colors.text,
      backgroundColor:
        'rgba(255, 250, 240, 0.94)',
      fontFamily: 'serif',
      fontSize: 17,
    },

    rowActions: {
      marginLeft: 6,
      flexDirection: 'row',
      gap: 3,
    },

    miniButton: {
      width: 27,
      height: 34,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 8,
      backgroundColor:
        'rgba(138, 90, 56, 0.09)',
    },

    miniButtonDisabled: {
      opacity: 0.25,
    },

    miniButtonText: {
      color:
        colors.accentDark,
      fontSize: 15,
      fontWeight: '700',
    },

    removeButton: {
      width: 27,
      height: 34,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 8,
      backgroundColor:
        'rgba(163, 58, 50, 0.08)',
    },

    removeButtonText: {
      marginTop: -2,
      color:
        colors.liturgical,
      fontSize: 21,
      lineHeight: 23,
    },

    addNameButton: {
      alignSelf:
        'flex-start',
      marginTop: 3,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor:
        'rgba(138, 90, 56, 0.10)',
    },

    addNameText: {
      color:
        colors.accentDark,
      fontSize: 13,
      fontWeight: '700',
    },

    photoCard: {
      marginBottom: 14,
      padding: 16,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.lg,
      backgroundColor:
        'rgba(255, 244, 222, 0.90)',
    },

    photoActions: {
      flexDirection: 'row',
      gap: 8,
    },

    photoAction: {
      flex: 1,
      minHeight: 66,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent:
        'center',
      borderWidth: 1,
      borderColor:
        colors.borderStrong,
      borderRadius:
        radius.md,
      backgroundColor:
        'rgba(138, 90, 56, 0.08)',
    },

    photoActionIcon: {
      marginBottom: 4,
      color:
        colors.accentDark,
      fontSize: 19,
    },

    photoActionText: {
      textAlign: 'center',
      color:
        colors.accentDark,
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
      borderColor:
        colors.borderStrong,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.surfaceMuted,
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
      justifyContent:
        'center',
      borderWidth: 1,
      borderColor:
        'rgba(163, 58, 50, 0.28)',
      backgroundColor:
        '#FFF4DE',
    },

    photoDeleteText: {
      marginTop: -2,
      color:
        colors.liturgical,
      fontSize: 20,
      lineHeight: 21,
    },

    saveButton: {
      minHeight: 50,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius:
        radius.md,
      backgroundColor:
        colors.accentDark,
    },

    saveButtonIdle: {
      backgroundColor:
        'rgba(104, 66, 41, 0.45)',
    },

    saveText: {
      color:
        '#FFF8EA',
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
      color:
        colors.liturgical,
      fontSize: 13,
      fontWeight: '700',
    },

    pressed: {
      opacity: 0.62,
    },
  });
