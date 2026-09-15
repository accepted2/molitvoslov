import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';


export default function GloryDivider() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Слава Отцу и Сыну и Святому Духу.
        {'\n'}
        И ныне и присно и во веки веков. Аминь.
        {'\n\n'}

        Аллилуиа, аллилуиа, аллилуиа, слава Тебе, Боже.{' '}
        <Text style={styles.hint}>×3</Text>

        {'\n'}

        Господи, помилуй.{' '}
        <Text style={styles.hint}>×3</Text>

        {'\n\n'}

        Слава Отцу и Сыну и Святому Духу.

        {'\n\n'}

        <Text style={styles.hint}>
          [Здесь можно прочитать прошение о здравии / об упокоении и помянуть имена.]
        </Text>

        {'\n\n'}

        И ныне и присно и во веки веков. Аминь.
      </Text>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    marginVertical: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,

    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,

    borderColor: 'rgba(0, 0, 0, 0.2)',
  },

  title: {
    marginBottom: 8,

    textAlign: 'center',

    fontSize: 16,
    fontWeight: '700',
  },

  text: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    opacity: 0.75,
  },
  hint: {
    fontSize: 14,
    fontStyle: 'italic',
    opacity: 0.6,
  },
});