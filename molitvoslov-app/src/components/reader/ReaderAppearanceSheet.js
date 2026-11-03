import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import ColorPalettePicker from '../settings/ColorPalettePicker';
import {READER_PALETTES, resolveReaderAppearance} from '../../services/scopedReaderAppearance';

const clampSize = (value) => Math.max(14, Math.min(28, Math.round(value)));
const PRESETS = [
  {id: 'parchment', label: 'Пергамент'},
  {id: 'warm', label: 'Тёплый'},
  {id: 'ivory', label: 'Светлый'},
  {id: 'night', label: 'Ночной'},
];
const colorFields = [
  {id: 'customBackground', label: 'Фон'},
  {id: 'customText', label: 'Текст'},
];

export const ReaderAppearanceSheet = ({visible, onClose, appearance, onChange, onReset}) => {
  const insets = useSafeAreaInsets();
  const [sliderWidth, setSliderWidth] = useState(240);
  const [showColorPicker, setShowColorPicker] = useState(null);
  const sliderPreviewOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) sliderPreviewOpacity.setValue(1);
  }, [visible, sliderPreviewOpacity]);

  const animateControls = (opacity) => {
    Animated.timing(sliderPreviewOpacity, {
      toValue: opacity,
      duration: opacity ? 240 : 130,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };
  const resolved = resolveReaderAppearance(appearance);
  const changeSize = (event) => {
    const position = Math.max(0, Math.min(sliderWidth, event.nativeEvent.locationX));
    onChange?.({fontSize: clampSize(14 + (position / Math.max(sliderWidth, 1)) * 14)});
  };
  const setCustom = (field, color) => {
    onChange?.({
      palette: 'custom',
      customBackground: resolved.background,
      customText: resolved.text,
      [field]: color,
    });
  };
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View pointerEvents="none" style={[styles.scrim, {opacity: sliderPreviewOpacity}]} />
        <Pressable style={styles.dismiss} onPress={onClose}/>
        <Animated.View style={[styles.sheet, {opacity: sliderPreviewOpacity, paddingBottom: Math.max(18, insets.bottom + 12)}]}>
          <View style={styles.header}>
            <Text style={styles.heading}>Оформление чтения</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть настройки" onPress={onClose} style={styles.done}>
              <Text style={styles.doneText}>Готово</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <Text style={styles.label}>Размер шрифта: {resolved.fontSize}</Text>
            <View style={styles.sizeRow}>
              <Pressable onPress={() => onChange?.({fontSize: clampSize(resolved.fontSize - 1)})} style={styles.step}><Text style={styles.stepText}>A−</Text></Pressable>
              <View
                accessibilityRole="adjustable"
                accessibilityLabel="Размер шрифта"
                accessibilityValue={{min:14, max:28, now:resolved.fontSize}}
                onAccessibilityAction={(event) => onChange?.({fontSize:clampSize(resolved.fontSize + (event.nativeEvent.actionName === 'increment' ? 1 : -1))})}
                accessibilityActions={[{name:'increment'}, {name:'decrement'}]}
                onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(event) => {animateControls(0); changeSize(event);}}
                onResponderMove={changeSize}
                onResponderRelease={() => animateControls(1)}
                onResponderTerminate={() => animateControls(1)}
                style={styles.track}>
                <View pointerEvents="none" style={[styles.trackFill,{width:(resolved.fontSize - 14) / 14 * 100 + '%'}]}/>
                <View pointerEvents="none" style={[styles.thumb,{left:(resolved.fontSize - 14) / 14 * 100 + '%'}]}/>
              </View>
              <Pressable onPress={() => onChange?.({fontSize: clampSize(resolved.fontSize + 1)})} style={styles.step}><Text style={styles.stepText}>A+</Text></Pressable>
            </View>
            <Text style={styles.label}>Цветовая тема</Text>
            <View style={styles.paletteRow}>
              {PRESETS.map(item => (
                <Pressable key={item.id} accessibilityRole="button" accessibilityState={{selected:resolved.palette===item.id}}
                  onPress={() => onChange?.({palette:item.id})} style={styles.preset}>
                  <View style={[styles.swatch, {backgroundColor:READER_PALETTES[item.id].background, borderColor:resolved.palette===item.id?'#8B5828':'#CAB79F',borderWidth:resolved.palette===item.id?3:1}]}/>
                  <Text style={styles.presetText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.colorRow}>
              {colorFields.map(({id,label}) => (
                <Pressable key={id} onPress={() => setShowColorPicker(showColorPicker===id ? null : id)} style={styles.colorButton}>
                  <View style={[styles.colorChip,{backgroundColor:id==='customBackground'?resolved.background:resolved.text}]}/>
                  <Text style={styles.presetText}>{label}: {id==='customBackground'?resolved.background:resolved.text}</Text>
                </Pressable>
              ))}
            </View>
            {!!showColorPicker && (
              <ColorPalettePicker
                key={showColorPicker}
                title={showColorPicker==='customBackground'?'Выбрать фон':'Выбрать цвет текста'}
                color={showColorPicker==='customBackground'?resolved.background:resolved.text}
                onChange={(color) => setCustom(showColorPicker,color)}
              />
            )}
            <Pressable onPress={onReset} style={styles.reset}><Text style={styles.resetText}>Вернуть общие настройки</Text></Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles=StyleSheet.create({
  overlay:{flex:1,justifyContent:'flex-end',backgroundColor:'transparent'},
  scrim:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(24,17,12,.35)'},
  dismiss:{flex:1},
  sheet:{maxHeight:'78%',backgroundColor:'#FFF4DE',borderTopLeftRadius:23,borderTopRightRadius:23,paddingHorizontal:18,paddingTop:16},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},
  heading:{fontSize:19,fontWeight:'700',color:'#4B2D18'},
  done:{paddingVertical:9,paddingHorizontal:15,borderRadius:14,backgroundColor:'#E6CEAA'},
  doneText:{color:'#54351C',fontWeight:'700'},
  scrollArea:{flexGrow:0,flexShrink:1},
  scroll:{paddingBottom:8,gap:13},
  label:{fontSize:14,color:'#684229',fontWeight:'700'},
  sizeRow:{flexDirection:'row',alignItems:'center',gap:11},
  step:{padding:9,borderRadius:8,backgroundColor:'#F1DFC2'},
  stepText:{color:'#493322',fontWeight:'700'},
  track:{flex:1,height:26,justifyContent:'center',borderRadius:12,backgroundColor:'#EFE1CB',borderColor:'#D7B991',borderWidth:1,overflow:'hidden'},
  trackFill:{position:'absolute',left:0,top:0,bottom:0,backgroundColor:'#B38A51'},
  thumb:{position:'absolute',width:15,height:20,marginLeft:-7,backgroundColor:'#694126',borderRadius:10,borderWidth:2,borderColor:'#FFF4DE'},
  paletteRow:{flexDirection:'row',justifyContent:'space-between',gap:4},
  preset:{alignItems:'center',flex:1,gap:4},
  swatch:{width:42,height:42,borderRadius:22},
  presetText:{fontSize:11,color:'#69472B',textAlign:'center'},
  colorRow:{flexDirection:'row',gap:8},
  colorButton:{flex:1,flexDirection:'row',gap:8,alignItems:'center',padding:8,borderRadius:9,backgroundColor:'#F2E0C5'},
  colorChip:{width:23,height:23,borderRadius:6,borderColor:'#A88762',borderWidth:1},
  reset:{alignSelf:'center',padding:12},
  resetText:{fontSize:13,color:'#7E5235',textDecorationLine:'underline'}
});
