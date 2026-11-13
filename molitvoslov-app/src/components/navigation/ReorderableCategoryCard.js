import React, {useEffect, useMemo, useRef} from 'react';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {getCategoryDragTarget} from '../../services/homeCategoryOrder';

const SHIFT_MS = 135;
const SETTLE_MS = 105;

/**
 * Absolute slots make the dragged card independent of React's list order:
 * it follows the finger while crossed cards animate into their new positions.
 * The gesture object never changes while held, even as the index changes.
 */
export const ReorderableCategoryCard = ({
  itemKey,
  index,
  rowHeight,
  cardHeight,
  total,
  activeKey,
  onDragStart,
  onDragHover,
  onDragFinish,
  children,
}) => {
  const currentIndex = useRef(index);
  const currentStep = useRef(rowHeight);
  const currentCount = useRef(total);
  const callbacks = useRef({onDragStart, onDragHover, onDragFinish});
  currentIndex.current = index;
  currentStep.current = rowHeight;
  currentCount.current = total;
  callbacks.current = {onDragStart, onDragHover, onDragFinish};

  const gestureActive = useRef(false);
  const originIndex = useRef(index);
  const hoverIndex = useRef(index);
  const slotY = useSharedValue(index * rowHeight);
  const fingerY = useSharedValue(0);
  const originY = useSharedValue(index * rowHeight);
  const dragging = useSharedValue(false);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    slotY.value = withTiming(index * rowHeight, {duration: SHIFT_MS});
  }, [index, rowHeight, slotY]);

  useEffect(() => {
    const otherCardIsMoving = !!activeKey && activeKey !== itemKey;
    scale.value = withTiming(
      otherCardIsMoving ? 0.965 : activeKey === itemKey ? 1.025 : 1,
      {duration: SHIFT_MS},
    );
    opacity.value = withTiming(otherCardIsMoving ? 0.9 : 1, {
      duration: SHIFT_MS,
    });
  }, [activeKey, itemKey, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: cardHeight,
    zIndex: dragging.value ? 100 : 0,
    elevation: dragging.value ? 18 : 0,
    opacity: opacity.value,
    borderRadius: 17,
    borderColor: '#9B643B',
    borderWidth: dragging.value ? 1.5 : 0,
    transform: [
      {translateY: dragging.value ? originY.value + fingerY.value : slotY.value},
      {scale: scale.value},
    ],
  }), [cardHeight]);

  const gesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(320)
    .onStart(() => {
      gestureActive.current = true;
      originIndex.current = currentIndex.current;
      hoverIndex.current = originIndex.current;
      originY.value = slotY.value;
      fingerY.value = 0;
      dragging.value = true;
      callbacks.current.onDragStart(itemKey);
    })
    .onUpdate(event => {
      if (!gestureActive.current) return;
      fingerY.value = event.translationY;
      const target = getCategoryDragTarget(
        originIndex.current,
        event.translationY,
        currentStep.current,
        currentCount.current,
      );
      if (target !== hoverIndex.current) {
        hoverIndex.current = target;
        // Shift adjacent cards as soon as the finger crosses a slot boundary.
        callbacks.current.onDragHover(itemKey, target);
      }
    })
    .onFinalize(() => {
      if (!gestureActive.current) return;
      gestureActive.current = false;
      // Immediately adopt the final slot; no delayed reorder after release.
      slotY.value = withTiming(hoverIndex.current * currentStep.current, {
        duration: SETTLE_MS,
      });
      dragging.value = false;
      fingerY.value = 0;
      callbacks.current.onDragFinish(itemKey, hoverIndex.current);
    })
    .runOnJS(true), [dragging, fingerY, itemKey, originY, slotY]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={animatedStyle}
        accessibilityHint="Удерживайте карточку, чтобы изменить порядок категорий"
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
};
