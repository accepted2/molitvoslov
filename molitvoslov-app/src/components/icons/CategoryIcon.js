import React from 'react';
import {Image, StyleSheet} from 'react-native';

const ICONS = {
  morning: require('../../../assets/icons/sun_icon.png'),
  evening: require('../../../assets/icons/moon_icon.png'),
  akathists: require('../../../assets/icons/angel_icon.png'),
  canons: require('../../../assets/icons/book_icon.png'),
  communion: require('../../../assets/icons/chalice_icon.png'),
  psalter: require('../../../assets/icons/psaltir_icon.png'),
  bible: require('../../../assets/icons/bible_icon.png'),
};

export const CategoryIcon = ({type}) => {
  const source = ICONS[type] || ICONS.canons;

  return <Image source={source} style={styles.icon} resizeMode="contain" />;
};

const styles = StyleSheet.create({
  icon: {
    width: 54,
    height: 54,
  },
});
