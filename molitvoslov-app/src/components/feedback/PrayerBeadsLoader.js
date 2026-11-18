import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, Text, View} from 'react-native';

// Slightly flattened oval, like a prayer rope hanging on a finger.
// The thread border and bead geometry use the exact same radii.
const BEAD_COUNT = 24;
const COMPACT_BEAD_COUNT = 14;
const ellipsePositions = (count, centerX, centerY, radiusX, radiusY, beadSize) =>
  Array.from({length: count}, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
    return {
      left: centerX + radiusX * Math.cos(angle) - beadSize / 2,
      top: centerY + radiusY * Math.sin(angle) - beadSize / 2,
    };
  });

const LARGE_POSITIONS = ellipsePositions(BEAD_COUNT, 54, 50, 40, 34, 11);
const SMALL_POSITIONS = ellipsePositions(COMPACT_BEAD_COUNT, 19, 15, 12, 9.5, 5);

export const PrayerBeadsLoader = ({text = '', compact = false, light = false}) => {
  const beads = useRef(Array.from({length: BEAD_COUNT}, () => new Animated.Value(0))).current;
  const visibleBeads = compact ? beads.slice(0, COMPACT_BEAD_COUNT) : beads;
  const positions = compact ? SMALL_POSITIONS : LARGE_POSITIONS;

  useEffect(() => {
    visibleBeads.forEach(value => value.setValue(0));
    const animation = Animated.loop(Animated.stagger(
      compact ? 105 : 78,
      visibleBeads.map(value => Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 165,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 315,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])),
    ));
    animation.start();

    return () => {
      animation.stop();
      beads.forEach(value => value.stopAnimation());
    };
  }, [beads, compact]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={text || 'Загрузка'}
      style={[styles.container, compact && styles.containerCompact]}
    >
      <View style={[styles.rosary, compact && styles.rosaryCompact]}>
        <View
          style={[
            styles.thread,
            compact && styles.threadCompact,
            light && styles.threadLight,
          ]}
        />
        {visibleBeads.map((value, index) => (
          <View
            key={index}
            style={[
              styles.beadPosition,
              compact && styles.beadPositionCompact,
              positions[index],
            ]}
          >
            <Animated.View
              style={[
                styles.bead,
                compact && styles.beadCompact,
                light && styles.beadLight,
                {
                  opacity: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.62, 1],
                  }),
                  transform: [{
                    scale: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.87, 1.22],
                    }),
                  }],
                },
              ]}
            />
          </View>
        ))}
        <View style={[
          styles.pendantKnot, compact && styles.pendantKnotCompact,
          light && styles.pendantKnotLight,
        ]} />
        <View style={[
          styles.pendantLine, compact && styles.pendantLineCompact,
          light && styles.pendantLineLight,
        ]} />
        <View
          style={[styles.cross, compact && styles.crossCompact]}
          accessible
          accessibilityLabel="Православный крестик"
        >
          <View style={[
            styles.crossStem, compact && styles.crossStemCompact,
            light && styles.crossLight,
          ]} />
          <View style={[
            styles.crossTopBar, compact && styles.crossTopBarCompact,
            light && styles.crossLight,
          ]} />
          <View style={[
            styles.crossMiddleBar, compact && styles.crossMiddleBarCompact,
            light && styles.crossLight,
          ]} />
          <View style={[
            styles.crossFootBar, compact && styles.crossFootBarCompact,
            light && styles.crossLight,
          ]} />
        </View>
      </View>

      {!!text && (
        <Text
          numberOfLines={compact ? 1 : 2}
          style={[styles.text, compact && styles.textCompact, light && styles.textLight]}
        >
          {text}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 169,
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerCompact: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rosary: {
    width: 108,
    height: 139,
    position: 'relative',
  },
  rosaryCompact: {
    width: 38,
    height: 51,
  },
  thread: {
    position: 'absolute',
    left: 14,
    top: 16,
    width: 80,
    height: 68,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(111, 71, 39, 0.36)',
  },
  threadCompact: {
    left: 7,
    top: 5.5,
    width: 24,
    height: 19,
    borderRadius: 12,
    borderWidth: 1,
  },
  threadLight: {
    borderColor: 'rgba(255, 239, 207, 0.48)',
  },
  beadPosition: {
    position: 'absolute',
    width: 11,
    height: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beadPositionCompact: {
    width: 5,
    height: 5,
  },
  bead: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#B98545',
    backgroundColor: '#6D4223',
  },
  beadCompact: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    borderWidth: 0.8,
  },
  beadLight: {
    borderColor: '#F0CF92',
    backgroundColor: '#F7DFB4',
  },
  pendantKnot: {
    position: 'absolute',
    top: 88,
    left: 51.5,
    width: 5,
    height: 5,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#B98545',
    backgroundColor: '#6D4223',
  },
  pendantKnotCompact: {
    top: 26,
    left: 17.25,
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    borderWidth: 0.8,
  },
  pendantKnotLight: {
    borderColor: '#F0CF92',
    backgroundColor: '#F7DFB4',
  },
  // Pendant reduced from 16 to 8 layout pixels.
  pendantLine: {
    position: 'absolute',
    top: 93,
    left: 53,
    width: 2,
    height: 8,
    backgroundColor: 'rgba(111, 71, 39, 0.72)',
  },
  pendantLineCompact: {
    top: 29.5,
    left: 18.5,
    width: 1,
    height: 4,
  },
  pendantLineLight: {
    backgroundColor: 'rgba(255, 239, 207, 0.75)',
  },
  // Construct the Orthodox cross from native Views; no font dependency.
  cross: {
    position: 'absolute',
    top: 101,
    left: 43,
    width: 22,
    height: 28,
  },
  crossCompact: {
    top: 33.5,
    left: 13,
    width: 12,
    height: 15,
  },
  crossStem: {
    position: 'absolute',
    top: 0,
    left: 10,
    width: 2,
    height: 25,
    borderRadius: 1,
    backgroundColor: '#B98545',
  },
  crossStemCompact: {
    top: 0,
    left: 5.25,
    width: 1.5,
    height: 12,
  },
  crossTopBar: {
    position: 'absolute',
    top: 4,
    left: 7,
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#B98545',
  },
  crossTopBarCompact: {
    top: 2.5,
    left: 4,
    width: 4,
    height: 1.5,
  },
  crossMiddleBar: {
    position: 'absolute',
    top: 11.5,
    left: 2,
    width: 18,
    height: 2.5,
    borderRadius: 1,
    backgroundColor: '#B98545',
  },
  crossMiddleBarCompact: {
    top: 5.5,
    left: 1,
    width: 10,
    height: 1.5,
  },
  crossFootBar: {
    position: 'absolute',
    top: 19,
    left: 4,
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#B98545',
    transform: [{rotate: '20deg'}],
  },
  crossFootBarCompact: {
    top: 9.5,
    left: 2,
    width: 8,
    height: 1.5,
    transform: [{rotate: '20deg'}],
  },
  crossLight: {
    backgroundColor: '#F3D89F',
  },
  text: {
    marginTop: 6,
    color: '#7B624D',
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'center',
  },
  textCompact: {
    marginTop: 0,
    marginLeft: 9,
    color: '#4B3020',
    fontSize: 13,
    lineHeight: 16,
  },
  textLight: {
    color: '#F8E7C5',
  },
});
