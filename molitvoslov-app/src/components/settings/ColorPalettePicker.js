import React, {useMemo, useState} from 'react';
import {View, Text} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';

const clamp = (value) => Math.max(0, Math.min(1, value));
const hsvToHex = (h, s, v) => {
  const channel = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return '#' + [channel(5), channel(3), channel(1)]
    .map((value) => Math.round(value * 255).toString(16).padStart(2, '0'))
    .join('').toUpperCase();
};
const hexToHsv = (hex) => {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(String(hex || '')) ? hex : '#FFF4DE';
  const n = parseInt(normalized.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), difference = max - min;
  let h = 0;
  if (difference) h = max === r ? ((g - b) / difference) % 6 :
    max === g ? (b - r) / difference + 2 : (r - g) / difference + 4;
  return {h: (h * 60 + 360) % 360, s: max ? difference / max : 0, v: max};
};
const HUES = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];

/**
 * Compact two-axis palette and hue rail. Like the reading font slider,
 * dragging previews changes immediately while the surrounding settings sheet
 * fades to reveal the actual document. Color is persisted by the parent.
 */
export default function ColorPalettePicker({
  title, color, onChange, onGestureStart, onGestureEnd,
}) {
  const original = useMemo(() => hexToHsv(color), []);
  const [hue, setHue] = useState(original.h);
  const [sat, setSat] = useState(original.s);
  const [val, setVal] = useState(original.v);
  const [width, setWidth] = useState(1);
  const [height, setHeight] = useState(1);
  const [hueWidth, setHueWidth] = useState(1);
  const updateSquare = (event) => {
    const saturation = clamp(event.nativeEvent.locationX / Math.max(width, 1));
    const value = 1 - clamp(event.nativeEvent.locationY / Math.max(height, 1));
    setSat(saturation);
    setVal(value);
    onChange?.(hsvToHex(hue, saturation, value));
  };
  const updateHue = (event) => {
    const next = clamp(event.nativeEvent.locationX / Math.max(hueWidth, 1)) * 360;
    setHue(next);
    onChange?.(hsvToHex(next, sat, val));
  };
  const start = (event, update) => {
    onGestureStart?.();
    update(event);
  };

  return (
    <View style={{gap: 7}}>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
        <Text style={{fontSize:14,fontWeight:'700',color:'#684229'}}>{title}</Text>
        <View style={{flexDirection:'row',alignItems:'center',gap:7}}>
          <View style={{width:21,height:21,backgroundColor:color,borderWidth:1,borderColor:'#9C8165',borderRadius:7}} />
          <Text style={{color:'#684229',fontSize:12,fontWeight:'700'}}>{color}</Text>
        </View>
      </View>
      <View
        accessibilityLabel={title + ': насыщенность и яркость'}
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
          setHeight(event.nativeEvent.layout.height);
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => start(event, updateSquare)}
        onResponderMove={updateSquare}
        onResponderRelease={onGestureEnd}
        onResponderTerminate={onGestureEnd}
        style={{height:84,borderRadius:11,overflow:'hidden',backgroundColor:hsvToHex(hue,1,1)}}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['#FFFFFF','rgba(255,255,255,0)']}
          start={{x:0,y:0.5}}
          end={{x:1,y:0.5}}
          style={{position:'absolute',top:0,bottom:0,left:0,right:0}}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)','#000000']}
          start={{x:0.5,y:0}}
          end={{x:0.5,y:1}}
          style={{position:'absolute',top:0,bottom:0,left:0,right:0}}
        />
        <View pointerEvents="none" style={{
          position:'absolute',left:Math.max(0,Math.min(width-17,sat*width-8)),
          top:Math.max(0,Math.min(height-17,(1-val)*height-8)),
          height:17,width:17,borderRadius:9,borderWidth:2,
          borderColor:'#FFFFFF',backgroundColor:color,
        }} />
      </View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={title + ': оттенок'}
        onLayout={(event) => setHueWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => start(event, updateHue)}
        onResponderMove={updateHue}
        onResponderRelease={onGestureEnd}
        onResponderTerminate={onGestureEnd}
        style={{height:29,borderRadius:15,overflow:'hidden',justifyContent:'center'}}
      >
        <LinearGradient
          pointerEvents="none"
          colors={HUES}
          locations={[0,1/6,2/6,3/6,4/6,5/6,1]}
          start={{x:0,y:0.5}}
          end={{x:1,y:0.5}}
          style={{position:'absolute',top:0,bottom:0,left:0,right:0}}
        />
        <View pointerEvents="none" style={{
          position:'absolute',left:Math.max(0,Math.min(hueWidth-9,hue/360*hueWidth-4.5)),
          top:2,bottom:2,width:9,borderWidth:2,borderColor:'#FFFFFF',
          borderRadius:6,backgroundColor:'#3E2A1D',
        }} />
      </View>
    </View>
  );
}
