import React, {
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getMemorialBooks,
  syncMemorials,
} from '../../services/memorials';

import {
  colors,
  radius,
  spacing,
} from '../../theme';

import {MemorialPhotoViewer} from './MemorialPhotoViewer';

const NameList = ({
  title,
  names,
  emptyText,
}) => {
  const list =
    Array.isArray(names)
      ? names.filter(Boolean)
      : [];

  return (
    <View style={styles.namesSection}>
      <View
        style={
          styles.namesHeading
        }
      >
        <Text
          style={
            styles.namesTitle
          }
        >
          {title}
        </Text>

        {!!list.length && (
          <Text
            style={
              styles.namesCount
            }
          >
            {list.length}
          </Text>
        )}
      </View>

      {list.length ? (
        <View
          style={
            styles.namesPaper
          }
        >
          <View
            pointerEvents="none"
            style={
              styles.namesPaperMargin
            }
          />

          {list.map(
            (name, index) => (
              <View
                key={`${title}-${index}-${name}`}
                style={
                  styles.quickNameRow
                }
              >
                <Text
                  style={
                    styles.quickNameText
                  }
                >
                  {name}
                </Text>
              </View>
            )
          )}
        </View>
      ) : (
        <Text
          style={
            styles.emptyNames
          }
        >
          {emptyText}
        </Text>
      )}
    </View>
  );
};

export const MemorialQuickSheet = ({
  visible,
  onClose,
  onManage,
  preferredKind = null,
}) => {
  const [books, setBooks] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [viewer, setViewer] =
    useState({
      visible: false,
      photos: [],
      index: 0,
    });

  useEffect(() => {
    if (!visible) {
      return;
    }

    let active = true;

    const load = async () => {
      try {
        setLoading(true);

        const local =
          await getMemorialBooks();

        if (active) {
          setBooks(local);
        }

        await syncMemorials();

        const refreshed =
          await getMemorialBooks();

        if (active) {
          setBooks(
            refreshed
          );
        }
      } catch (error) {
        console.log(
          'Ошибка загрузки помянника:',
          error?.message || error
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [visible]);

  const openViewer = (
    photos,
    index
  ) => {
    const available =
      (photos || []).filter(
        (photo) =>
          photo.display_uri ||
          photo.local_uri ||
          photo.remote_url
      );

    if (!available.length) {
      return;
    }

    setViewer({
      visible: true,
      photos: available,
      index,
    });
  };

  const manage = () => {
    onClose?.();
    onManage?.();
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={
          onClose
        }
      >
        <View
          style={
            styles.overlay
          }
        >
          <Pressable
            style={
              StyleSheet.absoluteFill
            }
            onPress={onClose}
          />

          <View
            style={
              styles.sheet
            }
          >
            <View
              style={
                styles.handle
              }
            />

            <View
              style={
                styles.header
              }
            >
              <View>
                <Text
                  style={
                    styles.title
                  }
                >
                  Помянник
                </Text>

                <Text
                  style={
                    styles.subtitle
                  }
                >
                  Имена для молитвенного
                  поминовения
                </Text>
              </View>

              <Pressable
                hitSlop={10}
                onPress={
                  onClose
                }
                style={({
                  pressed,
                }) => [
                  styles.close,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.closeText
                  }
                >
                  ×
                </Text>
              </Pressable>
            </View>

            {loading &&
            !books.length ? (
              <View
                style={
                  styles.loading
                }
              >
                <ActivityIndicator
                  color={
                    colors.accent
                  }
                />
              </View>
            ) : !books.length ? (
              <View
                style={
                  styles.emptyCard
                }
              >
                <Text
                  style={
                    styles.emptyMark
                  }
                >
                  ✦
                </Text>

                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  Помянник пока пуст
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Добавьте имена о
                  здравии или упокоении,
                  либо сфотографируйте
                  бумажную записку.
                </Text>

                {!!onManage && (
                  <Pressable
                    onPress={
                      manage
                    }
                    style={({
                      pressed,
                    }) => [
                      styles.manageButton,
                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    <Text
                      style={
                        styles.manageButtonText
                      }
                    >
                      Создать помянник
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={
                  false
                }
                contentContainerStyle={
                  styles.content
                }
              >
                {books.map(
                  (book) => (
                    <View
                      key={
                        book.sync_id
                      }
                      style={
                        styles.bookCard
                      }
                    >
                      <Text
                        style={
                          styles.bookTitle
                        }
                      >
                        {book.title ||
                          'Мой помянник'}
                      </Text>

                      <View
                        style={
                          styles.ornament
                        }
                      >
                        <View
                          style={
                            styles.line
                          }
                        />
                        <Text
                          style={
                            styles.mark
                          }
                        >
                          ✦
                        </Text>
                        <View
                          style={
                            styles.line
                          }
                        />
                      </View>

                      {(preferredKind ===
                      'repose'
                        ? [
                            {
                              key: 'repose',
                              title:
                                'Об упокоении',
                              names:
                                book.repose_names,
                            },
                            {
                              key: 'health',
                              title:
                                'О здравии',
                              names:
                                book.health_names,
                            },
                          ]
                        : [
                            {
                              key: 'health',
                              title:
                                'О здравии',
                              names:
                                book.health_names,
                            },
                            {
                              key: 'repose',
                              title:
                                'Об упокоении',
                              names:
                                book.repose_names,
                            },
                          ]
                      ).map(
                        (section) => (
                          <NameList
                            key={
                              section.key
                            }
                            title={
                              section.title
                            }
                            names={
                              section.names
                            }
                            emptyText="Имена не добавлены"
                          />
                        )
                      )}

                      {!!book.photos
                        ?.length && (
                        <View
                          style={
                            styles.photoSection
                          }
                        >
                          <Text
                            style={
                              styles.photoTitle
                            }
                          >
                            Фотографии
                            записок
                          </Text>

                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={
                              false
                            }
                            contentContainerStyle={
                              styles.photoRow
                            }
                          >
                            {book.photos.map(
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
                                  <Pressable
                                    key={
                                      photo.sync_id ||
                                      photo.id
                                    }
                                    onPress={() => {
                                      const availablePhotos =
                                        (book.photos || []).filter(
                                          (candidate) =>
                                            candidate.display_uri ||
                                            candidate.local_uri ||
                                            candidate.remote_url
                                        );

                                      const tappedIndex =
                                        availablePhotos.findIndex(
                                          (candidate) =>
                                            String(candidate.sync_id || candidate.id) ===
                                            String(photo.sync_id || photo.id)
                                        );

                                      openViewer(
                                        availablePhotos,
                                        Math.max(0, tappedIndex)
                                      );
                                    }}
                                    style={({
                                      pressed,
                                    }) => [
                                      styles.photoButton,
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
                                );
                              }
                            )}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  )
                )}

                {!!onManage && (
                  <Pressable
                    onPress={
                      manage
                    }
                    style={({
                      pressed,
                    }) => [
                      styles.manageLink,
                      pressed &&
                        styles.pressed,
                    ]}
                  >
                    <Text
                      style={
                        styles.manageLinkText
                      }
                    >
                      Редактировать
                      помянник
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

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
    </>
  );
};

const styles =
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent:
        'flex-end',
      backgroundColor:
        'rgba(33, 22, 14, 0.36)',
    },

    sheet: {
      maxHeight: '88%',
      minHeight: 320,
      paddingTop: 8,
      paddingHorizontal:
        spacing.lg,
      paddingBottom: 24,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      backgroundColor:
        '#FFF4DE',
      shadowColor:
        colors.shadow,
      shadowOffset: {
        width: 0,
        height: -4,
      },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 18,
    },

    handle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      marginBottom: 12,
      borderRadius: 2,
      backgroundColor:
        'rgba(104, 66, 41, 0.25)',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingBottom: 12,
    },

    title: {
      color:
        '#432A19',
      fontFamily: 'serif',
      fontSize: 24,
      lineHeight: 29,
      fontWeight: '700',
    },

    subtitle: {
      marginTop: 2,
      color:
        colors.textSecondary,
      fontFamily: 'serif',
      fontSize: 12,
    },

    close: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent:
        'center',
      borderRadius: 20,
      backgroundColor:
        'rgba(161, 110, 53, 0.10)',
    },

    closeText: {
      marginTop: -3,
      color:
        colors.accentDark,
      fontSize: 30,
      lineHeight: 34,
    },

    content: {
      paddingBottom: 18,
    },

    loading: {
      minHeight: 190,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    bookCard: {
      marginBottom: 14,
      padding:
        spacing.lg,
      borderWidth: 1,
      borderColor:
        'rgba(123, 79, 36, 0.16)',
      borderRadius:
        radius.lg,
      backgroundColor:
        'rgba(255, 248, 233, 0.88)',
    },

    bookTitle: {
      textAlign: 'center',
      color:
        colors.accentDark,
      fontFamily: 'serif',
      fontSize: 20,
      lineHeight: 25,
      fontWeight: '700',
    },

    ornament: {
      alignSelf: 'center',
      width: 130,
      marginTop: 6,
      marginBottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
    },

    line: {
      flex: 1,
      height: 1,
      backgroundColor:
        'rgba(145, 94, 43, 0.34)',
    },

    mark: {
      marginHorizontal: 7,
      color:
        colors.accent,
      fontSize: 8,
    },

    namesSection: {
      marginBottom: 14,
    },

    namesHeading: {
      marginBottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
    },

    namesTitle: {
      color:
        colors.liturgical,
      fontFamily: 'serif',
      fontSize: 16,
      fontWeight: '700',
    },

    namesCount: {
      minWidth: 24,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 10,
      textAlign: 'center',
      color:
        colors.accentDark,
      backgroundColor:
        'rgba(138, 90, 56, 0.08)',
      fontSize: 10,
      fontWeight: '700',
    },

    namesPaper: {
      position: 'relative',
      overflow: 'hidden',
      paddingVertical: 2,
      paddingLeft: 16,
      borderWidth: 1,
      borderColor:
        'rgba(139, 101, 63, 0.17)',
      borderRadius: 10,
      backgroundColor:
        'rgba(255, 251, 241, 0.92)',
    },

    namesPaperMargin: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 10,
      width: 1,
      backgroundColor:
        'rgba(163, 58, 50, 0.13)',
    },

    quickNameRow: {
      minHeight: 27,
      justifyContent:
        'center',
      paddingHorizontal: 8,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        'rgba(92, 119, 145, 0.13)',
    },

    quickNameText: {
      color:
        '#3D2C20',
      fontFamily: 'serif',
      fontSize: 16,
      lineHeight: 22,
    },

    emptyNames: {
      color:
        colors.textMuted,
      fontFamily: 'serif',
      fontSize: 14,
      fontStyle: 'italic',
    },

    photoSection: {
      marginTop: 2,
    },

    photoTitle: {
      marginBottom: 8,
      color:
        colors.liturgical,
      fontFamily: 'serif',
      fontSize: 15,
      fontWeight: '700',
    },

    photoRow: {
      gap: 8,
    },

    photoButton: {
      width: 82,
      height: 104,
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

    emptyCard: {
      marginTop: 18,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius:
        radius.lg,
      backgroundColor:
        'rgba(255, 248, 233, 0.86)',
    },

    emptyMark: {
      color:
        colors.accent,
      fontSize: 20,
    },

    emptyTitle: {
      marginTop: 8,
      color:
        colors.accentDark,
      fontFamily: 'serif',
      fontSize: 19,
      fontWeight: '700',
    },

    emptyText: {
      marginTop: 8,
      textAlign: 'center',
      color:
        colors.textSecondary,
      fontFamily: 'serif',
      fontSize: 14,
      lineHeight: 21,
    },

    manageButton: {
      marginTop: 16,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.accentDark,
    },

    manageButtonText: {
      color:
        '#FFF8EA',
      fontSize: 14,
      fontWeight: '700',
    },

    manageLink: {
      alignSelf: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },

    manageLinkText: {
      color:
        colors.accentDark,
      fontSize: 14,
      fontWeight: '700',
    },

    pressed: {
      opacity: 0.62,
    },
  });
