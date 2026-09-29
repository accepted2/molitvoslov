import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

export const MemorialPhotoViewer = ({
  visible,
  photos = [],
  initialIndex = 0,
  onClose,
}) => {
  const {width, height} =
    useWindowDimensions();

  const listRef =
    useRef(null);

  const availablePhotos =
    useMemo(
      () =>
        photos.filter(
          (photo) =>
            photo?.display_uri ||
            photo?.local_uri ||
            photo?.remote_url
        ),
      [photos]
    );

  const safeInitialIndex =
    Math.max(
      0,
      Math.min(
        Number(initialIndex || 0),
        Math.max(
          availablePhotos.length - 1,
          0
        )
      )
    );

  const [index, setIndex] =
    useState(
      safeInitialIndex
    );

  useEffect(() => {
    if (!visible) {
      return;
    }

    setIndex(
      safeInitialIndex
    );

    const timer =
      setTimeout(
        () => {
          listRef.current
            ?.scrollToIndex({
              index:
                safeInitialIndex,

              animated:
                false,
            });
        },
        60
      );

    return () =>
      clearTimeout(timer);
  }, [
    visible,
    safeInitialIndex,
  ]);

  const viewabilityConfig =
    useRef({
      itemVisiblePercentThreshold:
        60,
    }).current;

  const onViewableItemsChanged =
    useRef(
      ({viewableItems}) => {
        const nextIndex =
          viewableItems?.[0]
            ?.index;

        if (
          Number.isFinite(
            Number(nextIndex)
          )
        ) {
          setIndex(
            Number(nextIndex)
          );
        }
      }
    ).current;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.screen}>
        <FlatList
          ref={listRef}
          data={availablePhotos}
          keyExtractor={(item) =>
            String(
              item.sync_id ||
              item.id
            )
          }
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={
            false
          }
          bounces={false}
          initialScrollIndex={
            availablePhotos.length
              ? safeInitialIndex
              : undefined
          }
          getItemLayout={(
            _data,
            itemIndex
          ) => ({
            length: width,
            offset:
              width *
              itemIndex,
            index:
              itemIndex,
          })}
          onViewableItemsChanged={
            onViewableItemsChanged
          }
          viewabilityConfig={
            viewabilityConfig
          }
          renderItem={({item}) => (
            <View
              style={[
                styles.page,
                {
                  width,
                  height,
                },
              ]}
            >
              <Image
                source={{
                  uri:
                    item.display_uri ||
                    item.local_uri ||
                    item.remote_url,
                }}
                resizeMode="contain"
                style={{
                  width,
                  height,
                }}
              />
            </View>
          )}
          ListEmptyComponent={
            <View
              style={[
                styles.empty,
                {
                  width,
                  height,
                },
              ]}
            >
              <Text
                style={
                  styles.emptyText
                }
              >
                Фотография недоступна
              </Text>
            </View>
          }
        />

        <View
          pointerEvents="box-none"
          style={styles.topBar}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({pressed}) => [
              styles.closeButton,
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

          {!!availablePhotos.length && (
            <View
              style={
                styles.counter
              }
            >
              <Text
                style={
                  styles.counterText
                }
              >
                {index + 1} /{' '}
                {
                  availablePhotos.length
                }
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        '#17120E',
    },

    page: {
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        '#17120E',
    },

    empty: {
      alignItems: 'center',
      justifyContent:
        'center',
    },

    emptyText: {
      color:
        'rgba(255,255,255,0.72)',
      fontSize: 15,
    },

    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingTop: 44,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
    },

    closeButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(0,0,0,0.46)',
    },

    closeText: {
      marginTop: -3,
      color: '#FFFFFF',
      fontSize: 34,
      lineHeight: 38,
      fontWeight: '300',
    },

    counter: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 14,
      backgroundColor:
        'rgba(0,0,0,0.46)',
    },

    counterText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },

    pressed: {
      opacity: 0.62,
    },
  });
