import React, {useMemo, useState} from 'react';
import {View, Text, Pressable} from 'react-native';

const clamp = (v) => Math.min(1, Math.max(0, v));
const hsvToHex = (h, s, v) => {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
};
const hexToHsv = (hex) => {
  const n = parseInt(String(hex || '#FFF4DE').replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
  let h = 0;
  if (d) h = max === r ? ((g-b)/d)%6 : max === g ? (b-r)/d+2 : (r-g)/d+4;
  return {h: (h*60+360)%360, s: max ? d/max : 0, v: max};
};
const HUES = ['#FF0000','#FFFF00','#00FF00','#00FFFF','#0000FF','#FF00FF','#FF0000'];

export default function ColorPalettePicker({title, color, onChange}) {
  const original = useMemo(() => hexToHsv(color), []);
  const [hue, setHue] = useState(original.h);
  const [width, setWidth] = useState(1);
  const [height, setHeight] = useState(1);
  const [hueWidth, setHueWidth] = useState(1);
  const [sat, setSat] = useState(original.s);
  const [val, setVal] = useState(original.v);
  const updateSquare = (evt) => {
    const x = clamp(evt.nativeEvent.locationX / Math.max(width, 1));
    const y = clamp(evt.nativeEvent.locationY / Math.max(height, 1));
    setSat(x); setVal(1-y);
    onChange(hsvToHex(hue, x, 1-y));
  };
  const updateHue = (evt) => {
    const h = clamp(evt.nativeEvent.locationX / Math.max(hueWidth, 1))*360;
    setHue(h);
    onChange(hsvToHex(h, sat, val));
  };
  return (
    <View style={{gap: 8}}>
      <Text style={{fontSize: 14, fontWeight: '700', color:'#684229'}}>{title}</Text>
      <View onLayout={(e) => {setWidth(e.nativeEvent.layout.width);setHeight(e.nativeEvent.layout.height);}}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={updateSquare} onResponderMove={updateSquare}
        style={{height: 150, borderRadius: 12, overflow:'hidden', backgroundColor: hsvToHex(hue,1,1)}}>
        <View pointerEvents="none" style={{position:'absolute',left:0,right:0,top:0,bottom:0,flexDirection:'row'}}>
          {Array.from({length:30},(_,i)=><View key={i} style={{flex:1,backgroundColor:'#FFFFFF',opacity:(29-i)/29}}/>)}
        </View>
        <View pointerEvents="none" style={{position:'absolute',left:0,right:0,top:0,bottom:0,justifyContent:'flex-end'}}>
          {Array.from({length:30},(_,i)=><View key={i} style={{flex:1,backgroundColor:'#000000',opacity:i/29}}/>)}
        </View>
        <View pointerEvents="none" style={{position:'absolute',left:Math.max(0,sat*width-8),top:Math.max(0,(1-val)*height-8),height:16,width:16,borderRadius:8,borderWidth:2,borderColor:'#FFFFFF',backgroundColor:color}} />
      </View>
      <View onLayout={(e) => setHueWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={updateHue} onResponderMove={updateHue}
        style={{height:26,flexDirection:'row',borderRadius:13,overflow:'hidden'}}>
        {HUES.slice(0,-1).map((value,i)=><View pointerEvents="none" key={i} style={{flex:1,backgroundColor:value}}/>)}
        <View pointerEvents="none" style={{position:'absolute',left:Math.max(0,hue/360*hueWidth-3),top:0,bottom:0,width:6,borderWidth:2,borderColor:'#FFFFFF',backgroundColor:'#3E2A1D'}} />
      </View>
      <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
        <View style={{width:35,height:35,backgroundColor:color,borderWidth:1,borderColor:'#9C8165',borderRadius:7}}/>
        <Text style={{color:'#684229'}}>{color}</Text>
      </View>
    </View>
  );
}
