import React, {useRef} from 'react';
import {Animated, Pressable} from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Reusable low-key touch feedback for cards and buttons.
// Preserve the original pressed style callbacks and existing event handlers.
export const FadePressable = ({style, onPressIn, onPressOut, disabled, ...props}) => {
  const opacity = useRef(new Animated.Value(1)).current;

  const fadeTo = (value, duration) => {
    Animated.timing(opacity, {
      toValue: value,
      duration,
      useNativeDriver: true,
    }).start();
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) fadeTo(0.84, 110);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        fadeTo(1, 180);
        onPressOut?.(event);
      }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        {opacity},
      ]}
    />
  );
};
