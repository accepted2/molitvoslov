import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {subscribeShareFeedback,hideShareFeedback} from '../../services/shareFeedback';

export const ShareFeedbackHost=()=>{
  const safe=useSafeAreaInsets();
  const [state,setState]=useState({visible:false});
  useEffect(()=>subscribeShareFeedback(setState),[]);
  const close=()=>{
    if(state.loading)return;
    const fn=state.onCancel;
    hideShareFeedback();
    fn?.();
  };
  const confirm=()=>{
    const fn=state.onConfirm;
    hideShareFeedback();
    fn?.();
  };
  return <Modal transparent statusBarTranslucent animationType="fade"
    visible={!!state.visible} onRequestClose={close}>
    <View style={[styles.overlay,{paddingBottom:Math.max(22,safe.bottom)}]}>
      <View style={styles.card}>
        <View style={styles.crossWrap}><Text style={styles.cross}>☦</Text></View>
        <Text style={styles.heading}>{state.title||'Поделиться'}</Text>
        {!!state.loading && <ActivityIndicator color="#985B36" size="large"
          style={styles.spinner}/>}
        <Text style={styles.message}>{state.message||'Подготавливаем ссылку...'}</Text>
        {!state.loading && <View style={styles.actions}>
          <Pressable onPress={close} accessibilityRole="button"
            style={[styles.button,styles.cancel]}>
            <Text style={styles.cancelText}>{state.cancelLabel||'Закрыть'}</Text>
          </Pressable>
          {!!state.onConfirm && <Pressable onPress={confirm}
            accessibilityRole="button" style={[styles.button,styles.confirm]}>
            <Text style={styles.confirmText}>{state.confirmLabel||'Продолжить'}</Text>
          </Pressable>}
        </View>}
      </View>
    </View>
  </Modal>;
};
const styles=StyleSheet.create({
 overlay:{flex:1,alignItems:'center',justifyContent:'center',
   backgroundColor:'rgba(42,27,17,0.55)',paddingHorizontal:24},
 card:{width:'100%',maxWidth:430,borderRadius:19,backgroundColor:'#FFF5E5',
   borderWidth:1,borderColor:'#DFC6A4',padding:22,alignItems:'center',elevation:20},
 crossWrap:{width:38,height:38,borderRadius:19,backgroundColor:'#F1E0C4',
   justifyContent:'center',alignItems:'center',marginBottom:10},
 cross:{color:'#98603A',fontSize:23},
 heading:{fontSize:19,fontFamily:'serif',fontWeight:'700',color:'#503021',
   textAlign:'center',marginBottom:9},
 spinner:{marginVertical:10},
 message:{color:'#6C4C38',fontSize:14,lineHeight:21,textAlign:'center'},
 actions:{flexDirection:'row',gap:10,alignSelf:'stretch',marginTop:21},
 button:{flex:1,minHeight:43,borderRadius:10,justifyContent:'center',
   alignItems:'center',paddingHorizontal:5},
 cancel:{backgroundColor:'#F2E2C8'},
 confirm:{backgroundColor:'#855438'},
 cancelText:{color:'#724A2D',fontWeight:'700',fontSize:13},
 confirmText:{color:'#FFF8E9',fontWeight:'700',fontSize:13},
});
