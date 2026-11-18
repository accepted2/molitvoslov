import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, Text, View} from 'react-native';

// A complete prayer-rope loop instead of the previous curved row of beads.
// Both sizes use the same moving highlight, with a small hanging cross on the
// full-size loader. The animation uses the native driver for smooth rendering.
const BEAD_COUNT = 24;
const COMPACT_BEAD_COUNT = 14;
const circlePositions = (count, centerX, centerY, radius, beadSize) =>
  Array.from({length: count}, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
    return {
      left: centerX + radius * Math.cos(angle) - beadSize / 2,
      top: centerY + radius * Math.sin(angle) - beadSize / 2,
    };
  });

const LARGE_POSITIONS = circlePositions(BEAD_COUNT, 56, 55, 43, 11);
const SMALL_POSITIONS = circlePositions(COMPACT_BEAD_COUNT, 22, 22, 16, 7);

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
        {!compact && (
          <>
            <View style={[styles.pendantLine, light && styles.pendantLineLight]} />
            <Text style={[styles.cross, light && styles.crossLight]}>☦</Text>
          </>
        )}
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
    minHeight: 154,
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerCompact: {
    minHeight: 44,
    flexDirection: 'row',
  },
  rosary: {
    width: 112,
    height: 139,
    position: 'relative',
  },
  rosaryCompact: {
    width: 44,
    height: 44,
  },
  thread: {
    position: 'absolute',
    left: 13,
    top: 12,
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1.5,
    borderColor: 'rgba(111, 71, 39, 0.36)',
  },
  threadCompact: {
    left: 6,
    top: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
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
    width: 7,
    height: 7,
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
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  beadLight: {
    borderColor: '#F0CF92',
    backgroundColor: '#F7DFB4',
  },
  pendantLine: {
    position: 'absolute',
    top: 100,
    left: 55.5,
    width: 1,
    height: 13,
    backgroundColor: 'rgba(111, 71, 39, 0.48)',
  },
  pendantLineLight: {
    backgroundColor: 'rgba(255, 239, 207, 0.55)',
  },
  cross: {
    position: 'absolute',
    top: 109,
    left: 44,
    width: 24,
    textAlign: 'center',
    color: '#8E5D32',
    fontFamily: 'serif',
    fontSize: 19,
    lineHeight: 24,
  },
  crossLight: {
    color: '#F3D89F',
  },
  text: {
    marginTop: 3,
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
