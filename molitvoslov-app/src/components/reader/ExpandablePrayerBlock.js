import React, {
  useState,
} from 'react';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import SelectableSaveText
  from './SelectableSaveText';


export default function ExpandablePrayerBlock({
  title,
  text,
  onCollapse,
  saveProps = null,
}) {
  const [
    isOpen,
    setIsOpen,
  ] = useState(false);


  if (!text) {
    return null;
  }


  const toggle = () => {
    if (isOpen) {
      setIsOpen(false);

      onCollapse?.();

      return;
    }

    setIsOpen(true);
  };


  const collapse = () => {
    setIsOpen(false);

    onCollapse?.();
  };


  return (
    <View
      style={styles.container}
    >
      <Pressable
        style={({pressed}) => [
          styles.header,

          pressed &&
            styles.pressed,
        ]}
        onPress={
          toggle
        }
      >
        <View
          style={
            styles
              .headerContent
          }
        >
          <Text
            style={styles.title}
          >
            ☦ {title}
          </Text>

          {!isOpen && (
            <Text
              style={
                styles.preview
              }
              numberOfLines={2}
            >
              {text}
            </Text>
          )}
        </View>

        <Text
          style={styles.arrow}
        >
          {
            isOpen
              ? '⌃'
              : '⌄'
          }
        </Text>
      </Pressable>


      {isOpen && (
        <View
          style={styles.content}
        >
          {saveProps ? (
            <SelectableSaveText
              text={text}
              textStyle={
                styles.prayerText
              }
              fullSaveType="prayer"
              fullSaveLabel="Молитва"
              {...saveProps}
            />
          ) : (
            <Text
              style={
                styles.prayerText
              }
            >
              {text}
            </Text>
          )}

          <Pressable
            style={({pressed}) => [
              styles.collapseButton,

              pressed &&
                styles
                  .collapsePressed,
            ]}
            onPress={
              collapse
            }
          >
            <Text
              style={
                styles
                  .collapseText
              }
            >
              Свернуть
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}


const styles =
  StyleSheet.create({
    container: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        'rgba(120, 90, 55, 0.16)',
      overflow: 'hidden',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 16,
    },

    pressed: {
      opacity: 0.7,
    },

    headerContent: {
      flex: 1,
      paddingRight: 12,
    },

    title: {
      fontSize: 17,
      fontWeight: '600',
      color: '#3A342D',
    },

    preview: {
      marginTop: 7,
      fontSize: 14,
      lineHeight: 20,
      color: '#777169',
      fontFamily: 'serif',
    },

    arrow: {
      fontSize: 22,
      color: '#8A7356',
    },

    content: {
      paddingHorizontal: 16,
      paddingBottom: 18,
      borderTopWidth:
        StyleSheet
          .hairlineWidth,
      borderTopColor:
        'rgba(120, 90, 55, 0.15)',
    },

    prayerText: {
      paddingTop: 16,
      fontSize: 17,
      lineHeight: 28,
      color: '#332F2A',
      fontFamily: 'serif',
    },

    collapseButton: {
      alignSelf: 'center',
      marginTop: 22,
      paddingVertical: 10,
      paddingHorizontal: 22,
      borderRadius: 20,
      backgroundColor:
        '#EEE6D7',
    },

    collapsePressed: {
      opacity: 0.7,
    },

    collapseText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#68563F',
    },
  });
