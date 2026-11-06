import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, PanResponder, StyleSheet, View} from 'react-native';

// Shared slim, draggable scrollbar for native ScrollView and FlatList screens.
// Keep a wide invisible touch area while the visible thumb stays narrow.
// Scroll metrics are supplied by the host list. No source text is affected.
export const ThinScrollIndicator = ({
  scrollY,
  viewportHeight,
  contentHeight,
  topInset = 0,
  bottomInset = 0,
  scrollTo,
}) => {
  const trackHeight = Math.max(0, viewportHeight - topInset - bottomInset);
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const thumbHeight = Math.min(
    trackHeight,
    Math.max(40, maxScroll > 0 ? (viewportHeight / contentHeight) * trackHeight : trackHeight)
  );
  const thumbTravel = Math.max(0, trackHeight - thumbHeight);
  const offsetRef = useRef(0);
  const dragStartRef = useRef(0);

  useEffect(() => {
    const listener = scrollY.addListener(({value}) => {offsetRef.current = value;});
    return () => scrollY.removeListener(listener);
  }, [scrollY]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {dragStartRef.current = offsetRef.current;},
    onPanResponderMove: (_event, gesture) => {
      if (maxScroll <= 0 || thumbTravel <= 0) return;
      const destination = Math.max(0, Math.min(
        maxScroll,
        dragStartRef.current + gesture.dy * maxScroll / thumbTravel
      ));
      scrollTo(destination);
      // Also update the thumb immediately when native scroll events lag.
      scrollY.setValue(destination);
    },
    onPanResponderTerminationRequest: () => false,
  }), [maxScroll, scrollTo, scrollY, thumbTravel]);

  const translateY = scrollY.interpolate({
    inputRange: [0, Math.max(1, maxScroll)],
    outputRange: [0, thumbTravel],
    extrapolate: 'clamp',
  });

  if (trackHeight < 80 || maxScroll <= 5) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, {top: topInset, bottom: bottomInset}]}
      accessibilityLabel="Полоса прокрутки"
    >
      <View pointerEvents="none" style={styles.rail} />
      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.touchTarget,
          {height: thumbHeight, transform: [{translateY}]},
        ]}
        accessibilityRole="adjustable"
        accessibilityLabel="Перетащить для прокрутки"
      >
        <View pointerEvents="none" style={styles.thumb} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 0,
    width: 22,
    zIndex: 25,
    justifyContent: 'flex-start',
  },
  rail: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(104, 66, 41, 0.14)',
  },
  touchTarget: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 9,
  },
  thumb: {
    width: 4,
    height: '100%',
    borderRadius: 3,
    backgroundColor: 'rgba(100, 61, 35, 0.62)',
  },
});
