import React, {useCallback, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {getApiToken} from '../services/backendAuth';
import {fetchSharedInvitation, importSharedInvitation} from '../services/shareInvitations';
import {AppBackground} from '../components/layout/AppBackground';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';
import {colors} from '../theme';

const TITLES = {
  quote:'Цитата',memorial:'Помянник',prayerbook:'Личный молитвослов',
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
    if(signedOut){
      navigation.navigate('Account');
      return;
    }
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

  const content=info?.content||{};
  const preview=info?.kind==='quote'
    ? String(content.text||'').slice(0,1600)
    : info?.kind==='memorial'
      ? ['О здравии: '+(content.health_names||[]).length,
        'О упокоении: '+(content.repose_names||[]).length,
        'Фотографий: '+(content.photo_count||0)].join('\n')
      : ['Молитв: '+(content.prayers||[]).length,
         'Фотографий: '+(content.prayers||[]).reduce((count,p)=>
           count+Number(p.photo_count||0),0),
         ...(content.prayers||[]).slice(0,100).map((p,index)=>
           (index+1)+'. '+String(p.title||'Молитва'))].join('\n');
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
              {!!preview && <Text style={styles.body} numberOfLines={13}>{preview}</Text>}
              {(info.kind==='memorial'||info.kind==='prayerbook')&&(
                <Text style={styles.notice}>Это отдельная копия. Фотографии из облака будут скопированы в ваш аккаунт (до 12 файлов). Оригиналы отправителя не изменяются. Остальные вложения не передаются.</Text>
              )}
              <Pressable
                onPress={addToMe}
                disabled={importing}
                accessibilityRole="button"
                style={[styles.action,(importing||imported)&&styles.disabled]}
              >
                {importing?<ActivityIndicator color="#FFF4DE"/>:
                  <Text style={styles.actionText}>
                    {signedOut?'Войти, чтобы добавить себе':
                      imported?'Открыть добавленное':'Добавить себе'}
                  </Text>}
              </Pressable>
              {signedOut&&(
                <Text style={styles.notice}>
                  Просмотр доступен по ссылке без входа. Для сохранения копии
                  войдите в аккаунт и вернитесь сюда.
                </Text>
              )}
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
  notice:{fontSize:12,lineHeight:18,color:'#806550'},
  action:{padding:14,alignItems:'center',borderRadius:12,
    backgroundColor:'#6D442E',marginTop:8},
  actionText:{fontSize:15,fontWeight:'700',color:'#FFF4DE'},
  disabled:{opacity:0.6},
  secondary:{padding:9,alignItems:'center'},
  secondaryText:{color:'#80523B',fontWeight:'600'},
  error:{color:'#9B3B32',lineHeight:21},
});
