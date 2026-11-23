// Temporary in-app preview control. Enabled only by explicit build environment flag.
import React from 'react';
import {Pressable, Text, View} from 'react-native';

export const CalendarCleanupPreviewPanel = ({language, active, onChange, stats}) => {
  const uk = language === 'uk';
  const items = [
    {value:false, title:uk ? 'До очищення' : 'До очистки'},
    {value:true, title:uk ? 'Після очищення' : 'После очистки'},
  ];
  return (
    <View style={{backgroundColor:'#F5E6CB', padding:12, borderRadius:14,
      borderWidth:1, borderColor:'#C8A97C', gap:9}}>
      <Text style={{fontWeight:'700', color:'#624221'}}>
        {uk ? 'Перегляд очищення житій' : 'Просмотр очистки житий'}
      </Text>
      <View style={{flexDirection:'row', gap:8}}>
        {items.map(item => (
          <Pressable key={String(item.value)} onPress={() => onChange(item.value)}
            accessibilityRole="button"
            accessibilityState={{selected:active === item.value}}
            style={{flex:1, alignItems:'center', padding:10, borderRadius:10,
              backgroundColor:active === item.value ? '#70441F' : '#FFF9ED'}}>
            <Text style={{fontWeight:'700',
              color:active === item.value ? '#FFFFFF' : '#70441F'}}>
              {item.title}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{fontSize:12, color:'#624221'}}>
        {stats?.fields
          ? (uk
            ? 'Змінено полів: ' + stats.fields + '; прибрано символів: ' + stats.removed
            : 'Изменено полей: ' + stats.fields + '; удалено символов: ' + stats.removed)
          : (uk
            ? 'Видимих змін для цієї картки немає.'
            : 'Видимых изменений для этой карточки нет.')}
      </Text>
      <Text style={{fontSize:11, color:'#80684D'}}>
        {uk
          ? 'Лише попередній перегляд. База й календар не змінюються.'
          : 'Только предварительный просмотр. База и календарь не изменяются.'}
      </Text>
    </View>
  );
};
