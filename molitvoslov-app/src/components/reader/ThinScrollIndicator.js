import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, PanResponder, Pressable, StyleSheet, Text, View} from 'react-native';

// Match the morning-prayer reader: thumb visible during scrolling and fading
// after 950ms; an arrow-to-top appears on upward scrolling deep in the text.
// Menu screens keep the indicator visible by leaving autoHide disabled.
export const ThinScrollIndicator = ({
  scrollY, viewportHeight, contentHeight,
  topInset = 0, bottomInset = 0, scrollTo,
  autoHide = false, showScrollTop = false, onScrollTop,
}) => {
  const trackHeight = Math.max(0, viewportHeight - topInset - bottomInset);
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const thumbHeight = Math.min(trackHeight, Math.max(40,
    maxScroll > 0 ? (viewportHeight / contentHeight) * trackHeight : trackHeight));
  const thumbTravel = Math.max(0, trackHeight - thumbHeight);
  const offsetRef = useRef(0);
  const dragStartRef = useRef(0);
  const draggingRef = useRef(false);
  const hideTimerRef = useRef(null);
  const [visible, setVisible] = useState(!autoHide);
  const [topVisible, setTopVisible] = useState(false);
  const opacity = useRef(new Animated.Value(autoHide ? 0 : 1)).current;

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);
  const scheduleHide = useCallback(() => {
    cancelHide();
    if (!autoHide) return;
    hideTimerRef.current = setTimeout(() => {
      if (draggingRef.current) return;
      setVisible(false);
      setTopVisible(false);
    }, 950);
  }, [autoHide, cancelHide]);

  useEffect(() => {
    setVisible(!autoHide);
    if (!autoHide) setTopVisible(false);
  }, [autoHide]);
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0, duration: 120, useNativeDriver: true,
    }).start();
  }, [opacity, visible]);
  useEffect(() => {
    const listener = scrollY.addListener(({value}) => {
      const y = Math.max(0, Number(value) || 0);
      const previous = offsetRef.current;
      offsetRef.current = y;
      if (!autoHide || draggingRef.current || Math.abs(y - previous) < 1) return;
      setVisible(true);
      setTopVisible(showScrollTop && y < previous && y > viewportHeight * 0.65);
      scheduleHide();
    });
    return () => scrollY.removeListener(listener);
  }, [autoHide, scrollY, scheduleHide, showScrollTop, viewportHeight]);
  useEffect(() => () => cancelHide(), [cancelHide]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      draggingRef.current = true;
      cancelHide();
      setVisible(true);
      setTopVisible(false);
      dragStartRef.current = offsetRef.current;
    },
    onPanResponderMove: (_event, gesture) => {
      if (maxScroll <= 0 || thumbTravel <= 0) return;
      const destination = Math.max(0, Math.min(maxScroll,
        dragStartRef.current + gesture.dy * maxScroll / thumbTravel));
      scrollTo(destination);
      scrollY.setValue(destination);
    },
    onPanResponderRelease: () => {
      draggingRef.current = false;
      scheduleHide();
    },
    onPanResponderTerminate: () => {
      draggingRef.current = false;
      scheduleHide();
    },
    onPanResponderTerminationRequest: () => false,
  }), [cancelHide, maxScroll, scheduleHide, scrollTo, scrollY, thumbTravel]);

  const translateY = scrollY.interpolate({
    inputRange: [0, Math.max(1, maxScroll)],
    outputRange: [0, thumbTravel],
    extrapolate: 'clamp',
  });
  if (trackHeight < 80 || maxScroll <= 5) return null;

  return (
    <Animated.View
      pointerEvents={autoHide && !visible ? 'none' : 'box-none'}
      style={[styles.container, {top: topInset, bottom: bottomInset, opacity}]}
      accessibilityLabel="Полоса прокрутки"
    >
      <View pointerEvents="none" style={styles.rail} />
      <Animated.View
        {...responder.panHandlers}
        style={[styles.touchTarget, {height: thumbHeight, transform: [{translateY}]}]}
        accessibilityRole="adjustable"
        accessibilityLabel="Перетащить для прокрутки"
      >
        <View pointerEvents="none" style={styles.thumb} />
      </Animated.View>
      {showScrollTop && autoHide && visible && topVisible && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Вернуться к началу текста"
          hitSlop={5}
          style={styles.scrollTopButton}
          onPress={() => {
            setTopVisible(false);
            if (onScrollTop) onScrollTop();
            else scrollTo(0);
            scheduleHide();
          }}
        >
          <Text style={styles.scrollTopText}>↑</Text>
        </Pressable>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Wide enough for the 42px top button to remain inside its parent's
    // touch bounds. Only the 22px thumb area captures drag gestures.
    position: 'absolute', right: 0, width: 64, zIndex: 25,
    justifyContent: 'flex-start',
  },
  rail: {
    position: 'absolute', right: 10, top: 0, bottom: 0,
    width: 2, borderRadius: 2,
    backgroundColor: 'rgba(104, 66, 41, 0.14)',
  },
  touchTarget: {
    position: 'absolute', top: 0, right: 0, width: 22,
    alignItems: 'flex-end', justifyContent: 'center', paddingRight: 9,
  },
  thumb: {
    width: 4, height: '100%', borderRadius: 3,
    backgroundColor: 'rgba(100, 61, 35, 0.62)',
  },
  scrollTopButton: {
    position: 'absolute', bottom: 5, right: 12, zIndex: 2,
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 1, borderColor: 'rgba(112, 86, 55, 0.24)',
    backgroundColor: 'rgba(248, 233, 207, 0.96)',
    alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  scrollTopText: {color: '#795036', fontSize: 23, fontWeight: '700', lineHeight: 28},
});
