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
  const [sliderDragging, setSliderDragging] = useState(false);
  const sliderPreviewOpacity = useRef(new Animated.Value(1)).current;

  const restorePanel = () => {
    sliderPreviewOpacity.stopAnimation();
    sliderPreviewOpacity.setValue(1);
    setSliderDragging(false);
  };

  // Reset even when reopening after an interrupted gesture. The normal menu
  // must never inherit a transparent panel from a previous font preview.
  useEffect(() => {
    restorePanel();
    if (!visible) setShowColorPicker(null);
  }, [visible, sliderPreviewOpacity]);

  const setSliderPreview = (dragging) => {
    setSliderDragging(dragging);
    sliderPreviewOpacity.stopAnimation();
    Animated.timing(sliderPreviewOpacity, {
      toValue: dragging ? 0 : 1,
      duration: dragging ? 140 : 260,
      easing: Easing.out(Easing.cubic),
      // Opacity only: never switch this Animated.Value between JS and native drivers.
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
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      onShow={restorePanel}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View pointerEvents="none" style={[styles.scrim, {opacity: sliderPreviewOpacity}]} />
        <Pressable style={styles.dismiss} onPress={onClose}/>
        <View
          style={[
            styles.sheet,
            sliderDragging && styles.sheetPreview,
            {paddingBottom: Math.max(18, insets.bottom + 12)},
          ]}
        >
          {/* A solid background is the default, independent of animation state.
              Only an active slider gesture makes the real sheet transparent. */}
          <Animated.View pointerEvents={sliderDragging ? 'none' : 'auto'} style={[styles.header, {opacity: sliderPreviewOpacity}]}>
            <Text style={styles.heading}>Оформление чтения</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть настройки" onPress={onClose} style={styles.done}>
              <Text style={styles.doneText}>Готово</Text>
            </Pressable>
          </Animated.View>
          <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <Animated.Text style={[styles.label, {opacity: sliderPreviewOpacity}]}>Размер шрифта: {resolved.fontSize}</Animated.Text>
            <View pointerEvents={sliderDragging && showColorPicker ? 'none' : 'auto'} style={[styles.sizeRow, sliderDragging && showColorPicker && {opacity:0}]}>
              <Animated.View pointerEvents={sliderDragging ? 'none' : 'auto'} style={{opacity: sliderPreviewOpacity}}>
                <Pressable onPress={() => onChange?.({fontSize: clampSize(resolved.fontSize - 1)})} style={styles.step}><Text style={styles.stepText}>A−</Text></Pressable>
              </Animated.View>
              <View
                accessibilityRole="adjustable"
                accessibilityLabel="Размер шрифта"
                accessibilityValue={{min:14, max:28, now:resolved.fontSize}}
                onAccessibilityAction={(event) => onChange?.({fontSize:clampSize(resolved.fontSize + (event.nativeEvent.actionName === 'increment' ? 1 : -1))})}
                accessibilityActions={[{name:'increment'}, {name:'decrement'}]}
                onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(event) => {setSliderPreview(true); changeSize(event);}}
                onResponderMove={changeSize}
                onResponderRelease={() => setSliderPreview(false)}
                onResponderTerminate={() => setSliderPreview(false)}
                style={styles.track}>
                <View pointerEvents="none" style={[styles.trackFill,{width:(resolved.fontSize - 14) / 14 * 100 + '%'}]}/>
                <View pointerEvents="none" style={[styles.thumb,{left:(resolved.fontSize - 14) / 14 * 100 + '%'}]}/>
              </View>
              <Animated.View pointerEvents={sliderDragging ? 'none' : 'auto'} style={{opacity: sliderPreviewOpacity}}>
                <Pressable onPress={() => onChange?.({fontSize: clampSize(resolved.fontSize + 1)})} style={styles.step}><Text style={styles.stepText}>A+</Text></Pressable>
              </Animated.View>
            </View>
            <Animated.View pointerEvents={sliderDragging ? 'none' : 'auto'} style={[styles.settingsBlock, {opacity: sliderPreviewOpacity}]}>
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
            <Pressable onPress={onReset} style={styles.reset}><Text style={styles.resetText}>Вернуть общие настройки</Text></Pressable>
            </Animated.View>
            {!!showColorPicker && (
              <View style={styles.activeColorPicker}>
                <ColorPalettePicker
                  key={showColorPicker}
                  title={showColorPicker==='customBackground'?'Выбрать фон':'Выбрать цвет текста'}
                  color={showColorPicker==='customBackground'?resolved.background:resolved.text}
                  onChange={(color) => setCustom(showColorPicker,color)}
                  onGestureStart={() => setSliderPreview(true)}
                  onGestureEnd={() => setSliderPreview(false)}
                />
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles=StyleSheet.create({
  overlay:{flex:1,justifyContent:'flex-end',backgroundColor:'transparent'},
  scrim:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(24,17,12,.35)'},
  dismiss:{flex:1},
  sheet:{
    maxHeight:'78%',
    backgroundColor:'#E6D0AD',
    borderTopLeftRadius:23,
    borderTopRightRadius:23,
    borderWidth:1,
    borderColor:'#B9946B',
    paddingHorizontal:18,
    paddingTop:16,
  },
  sheetPreview:{
    backgroundColor:'transparent',
    borderColor:'transparent',
  },
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},
  heading:{fontSize:19,fontWeight:'700',color:'#4B2D18'},
  done:{paddingVertical:9,paddingHorizontal:15,borderRadius:14,backgroundColor:'#E6CEAA'},
  doneText:{color:'#54351C',fontWeight:'700'},
  scrollArea:{flexGrow:0,flexShrink:1},
  scroll:{paddingBottom:8,gap:13},
  settingsBlock:{gap:13},
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
  activeColorPicker:{gap:7,padding:10,borderRadius:14,backgroundColor:'rgba(245,227,198,0.92)',borderWidth:1,borderColor:'rgba(177,145,104,0.46)'},
  colorRow:{flexDirection:'row',gap:8},
  colorButton:{flex:1,flexDirection:'row',gap:8,alignItems:'center',padding:8,borderRadius:9,backgroundColor:'#F2E0C5'},
  colorChip:{width:23,height:23,borderRadius:6,borderColor:'#A88762',borderWidth:1},
  reset:{alignSelf:'center',padding:12},
  resetText:{fontSize:13,color:'#7E5235',textDecorationLine:'underline'}
});
