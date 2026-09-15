import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';


export default function VerseRow({
                                   verse,
                                   psalmId,
                                   onLayout,
                                 }) {
  if (!verse){
    return null
  }
  return (
    <View
      style={styles.row}
      nativeID={`verse-${verse.id}`}
      onLayout={onLayout}
    >
      <View style={styles.column}>
        <Text
          selectable
          style={styles.text}
        >
          <Text style={styles.number}>
            {verse.number}{' '}
          </Text>

          {verse.church_slavonic}
        </Text>
      </View>

      <View style={styles.separator} />

      <View style={styles.column}>
        <Text
          selectable
          style={styles.text}
        >
          <Text style={styles.number}>
            {verse.number}{' '}
          </Text>

          {verse.russian}
        </Text>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 8,
  },

  column: {
    flex: 1,
    paddingHorizontal: 10,
  },

  separator: {
    width: StyleSheet.hairlineWidth,
    backgroundColor:
      'rgba(0, 0, 0, 0.15)',
  },

  text: {
    fontSize: 17,
    lineHeight: 26,
  },

  number: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.55,
  },
});