import React from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {normalizeSearchText} from '../../services/search/normalize';

export const matchesLocalQuery = (query, ...fields) => {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const text = normalizeSearchText(fields.filter(Boolean).join(' '));
  return words.every(word => text.includes(word));
};

export const filterByTitle = (rows, query, titleFor) =>
  !normalizeSearchText(query)
    ? rows
    : rows.filter(row => matchesLocalQuery(query, titleFor(row)));

export const filterSavedOnly = (items, query) =>
  !normalizeSearchText(query)
    ? items
    : items.filter(item => matchesLocalQuery(query,
        item.item_title, item.source_title, item.text,
        item.save_type_display, item.metadata?.feast_title,
        item.metadata?.book_title, item.metadata?.source_title
      ));

export const LocalSearchField = ({
  value, onChangeText, placeholder = 'Поиск по названию', style,
  accessibilityLabel, compact = false,
}) => (
  <View style={[styles.box, compact && styles.boxCompact, style]}>
    <Text style={[styles.glyph, compact && styles.glyphCompact]}>⌕</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#8F725B"
      accessibilityLabel={accessibilityLabel || placeholder}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
      clearButtonMode="never"
      style={[styles.input, compact && styles.inputCompact]}
    />
    {!!value && <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Очистить поиск">
      <Text style={styles.clear}>×</Text>
    </Pressable>}
  </View>
);
const styles=StyleSheet.create({
  box:{height:46,flexDirection:'row',alignItems:'center',
    paddingHorizontal:13,borderWidth:1,borderColor:'rgba(123,79,36,.23)',
    borderRadius:14,backgroundColor:'#F8E9CF'},
  boxCompact:{height:36,paddingHorizontal:8,borderRadius:11},
  glyph:{fontSize:23,color:'#765238',width:26},
  glyphCompact:{fontSize:19,width:21},
  input:{flex:1,height:44,minWidth:0,fontSize:15,color:'#3E2A1D',fontFamily:'serif',paddingVertical:0},
  inputCompact:{height:34,fontSize:13},
  clear:{fontSize:24,lineHeight:29,color:'#765238',width:30,textAlign:'center'},
});
