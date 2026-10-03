import React, {useEffect, useRef} from 'react';

import {Animated, StyleSheet, Text, View} from 'react-native';

const BEAD_COUNT = 9;
const CURVE = [5, 3, 1, 0, 0, 0, 1, 3, 5];

export const PrayerBeadsLoader = ({text = '', compact = false, light = false}) => {
  const beads = useRef(Array.from({length: BEAD_COUNT}, () => new Animated.Value(0))).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.stagger(
        85,
        beads.map((value) =>
          Animated.sequence([
            Animated.timing(value, {
              toValue: 1,
              duration: 170,
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              toValue: 0,
              duration: 260,
              useNativeDriver: true,
            }),
          ])
        )
      )
    );

    animation.start();

    return () => {
      animation.stop();
      beads.forEach((value) => value.stopAnimation());
    };
  }, [beads]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={text || 'Загрузка'}
      style={[styles.container, compact && styles.containerCompact]}
    >
      <View style={[styles.thread, compact && styles.threadCompact, light && styles.threadLight]} />

      <View style={styles.beads}>
        {beads.map((value, index) => (
          <Animated.View
            key={index}
            style={[
              styles.beadWrap,
              compact && styles.beadWrapCompact,
              {transform: [{translateY: CURVE[index]}]},
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
                    outputRange: [0.46, 1],
                  }),
                  transform: [
                    {
                      scale: value.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.82, 1.22],
                      }),
                    },
                  ],
                },
              ]}
            />
          </Animated.View>
        ))}
      </View>

      {!compact && (
        <View style={styles.pendant}>
          <View style={[styles.pendantLine, light && styles.pendantLineLight]} />
          <Text style={[styles.cross, light && styles.crossLight]}>☦</Text>
        </View>
      )}

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
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerCompact: {
    minHeight: 28,
    flexDirection: 'row',
  },
  thread: {
    position: 'absolute',
    top: 17,
    width: 128,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(111, 71, 39, 0.24)',
  },
  threadCompact: {
    position: 'absolute',
    top: 13,
    left: 0,
    width: 74,
  },
  threadLight: {
    backgroundColor: 'rgba(255, 239, 207, 0.30)',
  },
  beads: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  beadWrap: {
    width: 15,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beadWrapCompact: {
    width: 9,
    height: 17,
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
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  beadLight: {
    borderColor: '#F0CF92',
    backgroundColor: '#F7DFB4',
  },
  pendant: {
    alignItems: 'center',
    marginTop: -5,
  },
  pendantLine: {
    width: 1,
    height: 7,
    backgroundColor: 'rgba(111, 71, 39, 0.38)',
  },
  pendantLineLight: {
    backgroundColor: 'rgba(255, 239, 207, 0.42)',
  },
  cross: {
    marginTop: -1,
    color: '#8E5D32',
    fontFamily: 'serif',
    fontSize: 13,
    lineHeight: 15,
  },
  crossLight: {
    color: '#F3D89F',
  },
  text: {
    marginTop: 5,
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
