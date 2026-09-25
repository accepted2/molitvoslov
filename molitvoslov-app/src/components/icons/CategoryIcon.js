import React from 'react';
import {StyleSheet, View} from 'react-native';

const INK = '#95602E';
const SLOT = '#F5E2C4';

const Ray = ({rotate}) => (
  <View
    style={[
      styles.ray,
      {
        transform: [{rotate: `${rotate}deg`}],
      },
    ]}
  />
);

const Sun = () => (
  <View style={styles.canvas}>
    {[0, 45, 90, 135].map(angle => (
      <React.Fragment key={angle}>
        <Ray rotate={angle} />
        <Ray rotate={angle + 180} />
      </React.Fragment>
    ))}
    <View style={styles.sunCore} />
  </View>
);

const Moon = () => (
  <View style={styles.canvas}>
    <View style={styles.moonOuter} />
    <View style={styles.moonCutout} />
    <View style={styles.starLarge} />
    <View style={styles.starSmall} />
  </View>
);

const Angel = () => (
  <View style={styles.canvas}>
    <View style={styles.angelHalo} />
    <View style={styles.angelHead} />
    <View style={styles.angelWingLeft} />
    <View style={styles.angelWingRight} />
    <View style={styles.angelBody} />
    <View style={styles.angelCrossV} />
    <View style={styles.angelCrossH} />
  </View>
);

const Book = () => (
  <View style={styles.canvas}>
    <View style={styles.bookLeft} />
    <View style={styles.bookRight} />
    <View style={styles.bookSpine} />
    <View style={styles.bookLineLeft} />
    <View style={styles.bookLineRight} />
  </View>
);

const Chalice = () => (
  <View style={styles.canvas}>
    <View style={styles.chaliceCup} />
    <View style={styles.chaliceStem} />
    <View style={styles.chaliceFoot} />
    <View style={styles.chaliceBase} />
  </View>
);

const Psalter = () => (
  <View style={styles.canvas}>
    <View style={styles.lyreBowl} />
    <View style={styles.lyreTop} />
    <View style={styles.lyreArmLeft} />
    <View style={styles.lyreArmRight} />
    <View style={[styles.lyreString, {left: 15}]} />
    <View style={[styles.lyreString, {left: 20}]} />
    <View style={[styles.lyreString, {left: 25}]} />
    <View style={[styles.lyreString, {left: 30}]} />
  </View>
);

export const CategoryIcon = ({type}) => {
  switch (type) {
    case 'morning':
      return <Sun />;
    case 'evening':
      return <Moon />;
    case 'akathists':
      return <Angel />;
    case 'canons':
      return <Book />;
    case 'communion':
      return <Chalice />;
    case 'psalter':
      return <Psalter />;
    default:
      return <Book />;
  }
};

const styles = StyleSheet.create({
  canvas: {
    width: 46,
    height: 46,
    position: 'relative',
  },

  ray: {
    position: 'absolute',
    left: 22,
    top: 3,
    width: 2,
    height: 10,
    borderRadius: 2,
    backgroundColor: INK,
    transformOrigin: '1px 20px',
  },
  sunCore: {
    position: 'absolute',
    left: 13,
    top: 13,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: INK,
  },

  moonOuter: {
    position: 'absolute',
    left: 8,
    top: 8,
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: INK,
  },
  moonCutout: {
    position: 'absolute',
    left: 17,
    top: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: SLOT,
  },
  starLarge: {
    position: 'absolute',
    right: 5,
    top: 8,
    width: 7,
    height: 7,
    backgroundColor: INK,
    transform: [{rotate: '45deg'}],
  },
  starSmall: {
    position: 'absolute',
    right: 2,
    top: 20,
    width: 4,
    height: 4,
    backgroundColor: INK,
    transform: [{rotate: '45deg'}],
  },

  angelHalo: {
    position: 'absolute',
    left: 15,
    top: 1,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: INK,
  },
  angelHead: {
    position: 'absolute',
    left: 19,
    top: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: INK,
  },
  angelWingLeft: {
    position: 'absolute',
    left: 4,
    top: 15,
    width: 17,
    height: 25,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: INK,
    transform: [{rotate: '24deg'}],
  },
  angelWingRight: {
    position: 'absolute',
    right: 4,
    top: 15,
    width: 17,
    height: 25,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: INK,
    transform: [{rotate: '-24deg'}],
  },
  angelBody: {
    position: 'absolute',
    left: 17,
    top: 16,
    width: 12,
    height: 26,
    borderRadius: 6,
    backgroundColor: INK,
  },
  angelCrossV: {
    position: 'absolute',
    left: 22,
    top: 21,
    width: 2,
    height: 13,
    backgroundColor: SLOT,
  },
  angelCrossH: {
    position: 'absolute',
    left: 18,
    top: 25,
    width: 10,
    height: 2,
    backgroundColor: SLOT,
  },

  bookLeft: {
    position: 'absolute',
    left: 3,
    top: 9,
    width: 19,
    height: 29,
    borderWidth: 3,
    borderColor: INK,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 7,
  },
  bookRight: {
    position: 'absolute',
    right: 3,
    top: 9,
    width: 19,
    height: 29,
    borderWidth: 3,
    borderColor: INK,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 7,
  },
  bookSpine: {
    position: 'absolute',
    left: 22,
    top: 8,
    width: 2,
    height: 32,
    backgroundColor: INK,
  },
  bookLineLeft: {
    position: 'absolute',
    left: 8,
    top: 16,
    width: 9,
    height: 2,
    backgroundColor: INK,
  },
  bookLineRight: {
    position: 'absolute',
    right: 8,
    top: 16,
    width: 9,
    height: 2,
    backgroundColor: INK,
  },

  chaliceCup: {
    position: 'absolute',
    left: 10,
    top: 7,
    width: 26,
    height: 17,
    borderBottomLeftRadius: 13,
    borderBottomRightRadius: 13,
    backgroundColor: INK,
  },
  chaliceStem: {
    position: 'absolute',
    left: 21,
    top: 22,
    width: 4,
    height: 13,
    backgroundColor: INK,
  },
  chaliceFoot: {
    position: 'absolute',
    left: 14,
    top: 34,
    width: 18,
    height: 4,
    borderRadius: 2,
    backgroundColor: INK,
  },
  chaliceBase: {
    position: 'absolute',
    left: 9,
    top: 39,
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: INK,
  },

  lyreBowl: {
    position: 'absolute',
    left: 7,
    top: 14,
    width: 32,
    height: 26,
    borderWidth: 4,
    borderTopWidth: 0,
    borderColor: INK,
    borderBottomLeftRadius: 17,
    borderBottomRightRadius: 17,
  },
  lyreTop: {
    position: 'absolute',
    left: 8,
    top: 9,
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: INK,
  },
  lyreArmLeft: {
    position: 'absolute',
    left: 8,
    top: 8,
    width: 4,
    height: 17,
    borderRadius: 2,
    backgroundColor: INK,
    transform: [{rotate: '-9deg'}],
  },
  lyreArmRight: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 4,
    height: 17,
    borderRadius: 2,
    backgroundColor: INK,
    transform: [{rotate: '9deg'}],
  },
  lyreString: {
    position: 'absolute',
    top: 14,
    width: 1.5,
    height: 20,
    backgroundColor: INK,
  },
});
