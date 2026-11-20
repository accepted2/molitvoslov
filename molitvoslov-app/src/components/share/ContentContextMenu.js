import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useLanguage} from '../../context/LanguageContext';

// Native transparent modal is above BottomNav even when FlatList clips rows.
export const ContentContextMenu = ({
  visible,title,onClose,onOpen,onShare,onPin,pinned=false,onSave=null,saved=false,
  onDelete=null,
}) => {
  const safe=useSafeAreaInsets();
  const {language,t}=useLanguage();
  const cslFont=language==='csl_traditional' ? {fontFamily:'Ponomar',fontWeight:'400'} : null;
  const item=(label,icon,action,danger=false)=>{
    if(!action)return null;
    return (
      <Pressable key={label} onPress={()=>{
        onClose?.();
        // Let Android remove the Modal before the native Share chooser opens.
        setTimeout(action,170);
      }} accessibilityRole="button" style={({pressed})=>[
        styles.action,pressed&&styles.pressed,
      ]}>
        <Ionicons name={icon} color={danger ? "#A34738" : "#875532"} size={21}/>
        <Text style={[styles.actionText,danger && styles.dangerText,cslFont]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <Modal visible={!!visible} transparent animationType="fade"
      statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable style={[styles.panel,{marginBottom:Math.max(28,safe.bottom+22)}]}
          onPress={()=>{}}>
          <View style={styles.handle}/>
          <Text style={[styles.title,cslFont]} numberOfLines={2}>{title||t('contextActions.title')}</Text>
          {item(t('contextActions.open'),'book-outline',onOpen)}
          {item(t('contextActions.share'),'share-social-outline',onShare)}
          {item(t(saved?'contextActions.unsave':'contextActions.save'),
            saved?'bookmark':'bookmark-outline',onSave)}
          {item(t(pinned?'contextActions.unpin':'contextActions.pin'),
            pinned?'pin':'pin-outline',onPin)}
          {item(t('contextActions.delete'),'trash-outline',onDelete,true)}
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={[styles.cancelText,cslFont]}>{t('contextActions.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
const styles=StyleSheet.create({
  backdrop:{flex:1,justifyContent:'flex-end',
    backgroundColor:'rgba(33,21,15,0.42)'},
  panel:{marginHorizontal:12,borderRadius:21,backgroundColor:'#FFF4DE',
    paddingHorizontal:16,paddingTop:13,paddingBottom:13,
    borderWidth:1,borderColor:'#D6B98C',elevation:22},
  handle:{height:4,width:44,borderRadius:3,backgroundColor:'#D8C5A7',
    alignSelf:'center',marginBottom:12},
  title:{fontSize:17,fontWeight:'700',color:'#50331F',
    paddingHorizontal:6,marginBottom:10},
  action:{flexDirection:'row',alignItems:'center',gap:13,
    minHeight:48,borderTopWidth:0.5,borderColor:'#DFC9AB',paddingHorizontal:8},
  pressed:{opacity:0.65},
  actionText:{fontSize:15,color:'#4F3526',fontWeight:'600'},
  dangerText:{color:'#A34738'},
  cancel:{alignItems:'center',paddingVertical:12,marginTop:5},
  cancelText:{color:'#875532',fontSize:15,fontWeight:'600'},
});
