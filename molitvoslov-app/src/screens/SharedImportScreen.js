import React, {useCallback, useState} from 'react';
import {ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {getApiToken} from '../services/backendAuth';
import {fetchSharedInvitation, importSharedInvitation, sharedPhotoUrl} from '../services/shareInvitations';
import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {colors} from '../theme';

const TITLES = {
  quote:'Цитата',memorial:'Помянник',prayerbook:'Личный молитвослов',
};

const SharedPhotoStrip = ({token,count,start=0}) => {
  const [selected,setSelected]=useState(null);
  const total=Math.min(12,Math.max(0,Number(count)||0));
  if(!total)return null;
  const images=Array.from({length:total},(_,index)=>start+index);
  return (
    <View>
      <Text style={styles.photoInfo}>Фотографий: {total}</Text>
      <View style={styles.photoGrid}>
        {images.map(index=>(
          <Pressable key={index} accessibilityRole="button"
            accessibilityLabel={'Просмотреть фотографию '+(index-start+1)}
            onPress={()=>setSelected(index)}>
            <Image source={{uri:sharedPhotoUrl(token,index)}}
              style={styles.photoThumb} resizeMode="cover"/>
          </Pressable>
        ))}
      </View>
      <Modal visible={selected!==null} transparent animationType="fade"
        onRequestClose={()=>setSelected(null)}>
        <View style={styles.photoModal}>
          <Pressable accessibilityRole="button"
            onPress={()=>setSelected(null)}
            style={styles.photoClose}>
            <Text style={styles.photoCloseLabel}>Закрыть ×</Text>
          </Pressable>
          {selected!==null&&(
            <Image source={{uri:sharedPhotoUrl(token,selected)}}
              style={styles.photoFull} resizeMode="contain"/>
          )}
        </View>
      </Modal>
    </View>
  );
};

// Read-only view of the exact invitation snapshot. Nothing is added until
// the recipient explicitly chooses "Добавить себе".
const SharedSnapshotPreview = ({info,token}) => {
  const content=info?.content||{};
  if(info?.kind==='quote'){
    return <Text style={styles.body}>{String(content.text||'')}</Text>;
  }
  if(info?.kind==='memorial'){
    const sections=[
      {key:'health',label:'О здравии',names:content.health_names||[]},
      {key:'repose',label:'Об упокоении',names:content.repose_names||[]},
    ];
    return (
      <View style={styles.preview}>
        {sections.map(section=>(
          <View key={section.key} style={styles.previewSection}>
            <Text style={styles.sectionHeading}>{section.label}</Text>
            {section.names.length ? section.names.map((name,index)=>(
              <Text key={section.key+'-'+index} style={styles.nameRow}>
                {String(name)}
              </Text>
            )) : <Text style={styles.emptyHint}>Нет имён</Text>}
          </View>
        ))}
        <SharedPhotoStrip token={token} count={content.photo_count||0} start={0}/>
      </View>
    );
  }
  if(info?.kind==='prayerbook'){
    const prayers=Array.isArray(content.prayers)?content.prayers:[];
    return (
      <View style={styles.preview}>
        {!!content.description&&(
          <Text style={styles.description}>{String(content.description)}</Text>
        )}
        <Text style={styles.sectionHeading}>Молитвы ({prayers.length})</Text>
        {prayers.length ? prayers.map((prayer,index)=>(
          <View key={'prayer-'+index} style={styles.prayerPreview}>
            <Text style={styles.prayerHeading}>{index+1}. {String(prayer.title||'Молитва')}</Text>
            {!!prayer.text&&(
              <Text style={styles.body}>{String(prayer.text)}</Text>
            )}
            <SharedPhotoStrip token={token}
              count={prayer.photo_count||0}
              start={prayers.slice(0,index).reduce(
                (total,item)=>total+Number(item.photo_count||0),0)}/>
          </View>
        )) : <Text style={styles.emptyHint}>В этом молитвослове пока нет молитв</Text>}
      </View>
    );
  }
  return null;
};

export const SharedImportScreen = ({route,navigation}) => {
  const token=route?.params?.token||'';
  const insets=useSafeAreaInsets();
  const [headerHeight,setHeaderHeight]=useState(insets.top+56);
  const [loading,setLoading]=useState(true);
  const [signedOut,setSignedOut]=useState(false);
  const [info,setInfo]=useState(null);
  const [error,setError]=useState('');
  const [importing,setImporting]=useState(false);
  const [imported,setImported]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    setError('');
    try{
      // Preview is public for anyone with a link; only adding to an
      // account requires authentication.
      setSignedOut(!(await getApiToken()));
      const response=await fetchSharedInvitation(token);
      setInfo(response);
      setImported(!!response.imported);
    }catch(reason){
      setError(reason?.message||'Не удалось открыть ссылку');
    }finally{
      setLoading(false);
    }
  },[token]);
  useFocusEffect(useCallback(()=>{load();},[load]));

  const addToMe=async()=>{
    if(importing)return;
    try{
      setImporting(true);
      setError('');
      const result=await importSharedInvitation(token);
      setImported(true);
      const target={
        quote:['Favorites',{tab:'saved'}],
        memorial:[result.localPending?'Memorial':'MemorialBook',
          result.localPending?{}:{bookSyncId:result.sync_id}],
        prayerbook:[result.localPending?'PrayerBooks':'PrayerBook',
          result.localPending?{}:{bookSyncId:result.sync_id}],
      }[result.kind];
      if(target)navigation.replace(target[0],target[1]);
    }catch(reason){
      setError(reason?.message||'Не удалось добавить');
    }finally{
      setImporting(false);
    }
  };

  return (
    <AppBackground imageOpacity={0.72}>
      <StatusBar style="light" translucent backgroundColor="transparent"/>
      <View style={styles.page}>
        <ScrollView contentContainerStyle={[
          styles.content,{paddingTop:headerHeight+24,paddingBottom:90+insets.bottom},
        ]}>
          <Text style={styles.symbol}>☦</Text>
          <Text style={styles.hint}>Вам отправили из Молитвослова</Text>
          {loading ? (
            <ActivityIndicator color={colors.accent} size="large"/>
          ) : info ? (
            <View style={styles.card}>
              <Text style={styles.label}>{TITLES[info.kind]||'Текст'}</Text>
              <Text style={styles.name}>{info.title}</Text>
              <SharedSnapshotPreview info={info} token={token}/>
              {(info.kind==='memorial'||info.kind==='prayerbook')&&(
                <Text style={styles.notice}>Вы можете просмотреть содержимое и фотографии до добавления. При сохранении фотографии будут скопированы в ваш аккаунт (не более 12). Оригинал отправителя не изменится.</Text>
              )}
              {signedOut&&(
                <Text style={styles.notice}>
                  Материал можно просматривать без входа. Чтобы сохранить свою копию, войдите через Google, затем вернитесь на эту страницу.
                </Text>
              )}
              <Pressable
                onPress={signedOut?()=>navigation.navigate('Account'):addToMe}
                disabled={importing}
                accessibilityRole="button"
                style={[styles.action,(importing||imported)&&styles.disabled]}
              >
                {importing?<ActivityIndicator color="#FFF4DE"/>:
                  <Text style={styles.actionText}>
                    {signedOut?'Войти и добавить себе':
                      imported?'Открыть добавленное':'Добавить себе'}
                  </Text>}
              </Pressable>
              <Text style={styles.notice}>После добавления текст появится в вашем избранном, помянниках или личных молитвословах и будет доступен для редактирования независимо от отправителя.</Text>
            </View>
          ) : null}
          {!!error&&<View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={load} style={styles.secondary}>
              <Text style={styles.secondaryText}>Повторить</Text>
            </Pressable>
          </View>}
        </ScrollView>
        <FixedSectionHeader title="Полученное" navigation={navigation}
          topInset={insets.top} showTitle
          onHeaderHeightChange={setHeaderHeight}/>
      </View>
    </AppBackground>
  );
};

const styles=StyleSheet.create({
  page:{flex:1},content:{paddingHorizontal:18,alignItems:'center'},
  symbol:{fontSize:36,color:'#805339',marginBottom:9},
  hint:{color:'#80644C',fontSize:13,marginBottom:17},
  card:{width:'100%',backgroundColor:'rgba(255,248,236,0.96)',
    borderRadius:18,borderWidth:1,borderColor:'#D9B992',padding:19,gap:12},
  label:{color:'#A15740',fontSize:12,fontWeight:'700'},
  name:{fontSize:21,fontWeight:'700',fontFamily:'serif',color:'#4A2D20'},
  body:{fontSize:15,lineHeight:24,color:'#503829'},
  preview:{gap:14,marginTop:3},
  previewSection:{gap:5,paddingTop:9,borderTopWidth:1,borderTopColor:'#E4D1B8'},
  sectionHeading:{fontSize:16,fontWeight:'700',color:'#68432E'},
  nameRow:{fontSize:16,lineHeight:26,color:'#503829'},
  emptyHint:{fontSize:13,color:'#8A725F',fontStyle:'italic'},
  prayerPreview:{gap:7,paddingTop:11,borderTopWidth:1,borderTopColor:'#E4D1B8'},
  prayerHeading:{fontSize:16,fontWeight:'700',color:'#68432E'},
  description:{fontSize:14,lineHeight:22,color:'#785641'},
  photoInfo:{fontSize:12,lineHeight:18,color:'#856D55'},
  photoGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8},
  photoThumb:{width:94,height:94,borderRadius:9,backgroundColor:'#E9D8C3'},
  photoModal:{flex:1,backgroundColor:'rgba(30,19,14,0.96)',padding:18,
    paddingTop:55,paddingBottom:40},
  photoClose:{alignSelf:'flex-end',padding:12},
  photoCloseLabel:{color:'#FFF0DD',fontSize:16,fontWeight:'600'},
  photoFull:{flex:1,width:'100%'},
  notice:{fontSize:12,lineHeight:18,color:'#806550'},
  action:{padding:14,alignItems:'center',borderRadius:12,
    backgroundColor:'#6D442E',marginTop:8},
  actionText:{fontSize:15,fontWeight:'700',color:'#FFF4DE'},
  disabled:{opacity:0.6},
  secondary:{padding:9,alignItems:'center'},
  secondaryText:{color:'#80523B',fontWeight:'600'},
  error:{color:'#9B3B32',lineHeight:21},
});
