import React, {useMemo, useRef, useState} from 'react';
import {Animated, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';

/**
 * A real press-and-hold gesture, leaving ordinary swipes to the main ScrollView.
 * Drops across cards; the card floats with the user's finger until release.
 */
export const ReorderableCategoryCard = ({
  itemKey, index, rowHeight, total, onDrop, onDragChange, children,
}) => {
  const offset=useRef(new Animated.Value(0)).current;
  const dragRef=useRef(false);
  const [dragging,setDragging]=useState(false);
  const [targetIndex,setTargetIndex]=useState(index);
  const drag=useMemo(()=>Gesture.Pan()
    .activateAfterLongPress(370)
    .onStart(()=>{
      dragRef.current=true;
      setDragging(true);
      onDragChange(true);
    })
    .onUpdate(event=>{
      if(!dragRef.current)return;
      offset.setValue(event.translationY);
      setTargetIndex(Math.max(0,Math.min(total-1,
        index+Math.round(event.translationY/Math.max(1,rowHeight)))));
    })
    .onEnd(event=>{
      if(dragRef.current)onDrop(itemKey,Math.round(event.translationY/Math.max(1,rowHeight)));
    })
    .onFinalize(()=>{
      dragRef.current=false;
      offset.setValue(0);
      setDragging(false);
      onDragChange(false);
    })
    .runOnJS(true),
  [itemKey,index,rowHeight,total,onDrop,onDragChange,offset]);
  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        accessibilityHint="Удерживайте карточку и перемещайте вверх или вниз для изменения порядка"
        style={{
          transform:[{translateY:offset}],
          zIndex:dragging?100:0,
          elevation:dragging?12:0,
          opacity:dragging?0.96:1,
          borderRadius:18,
          borderWidth:dragging?2:0,
          borderColor:'#AC7849',
        }}
      >
        <View pointerEvents="none" style={{
          position:'absolute',right:12,top:4,zIndex:15,
          width:5,height:5,borderRadius:3,
          backgroundColor:dragging?'#9B5635':'transparent',
        }}/>
        {children}
      </Animated.View>
    </GestureDetector>
  );
};
