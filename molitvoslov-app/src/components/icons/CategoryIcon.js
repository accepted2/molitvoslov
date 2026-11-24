import React from 'react';
import {Image, StyleSheet} from 'react-native';

const ICONS = {
  morning: require('../../../assets/icons/sun_icon.png'),
  evening: require('../../../assets/icons/moon_icon.png'),
  akathists: require('../../../assets/icons/angel_icon.png'),
  canons: require('../../../assets/icons/book_icon.png'),
  communion: require('../../../assets/icons/chalice_icon.png'),
  psalter: require('../../../assets/icons/catalog_psalter_v2.webp'),
  bible: require('../../../assets/icons/catalog_bible_v2.webp'),
  hours: require('../../../assets/icons/catalog_hours_v2.webp'),
  learning: require('../../../assets/icons/catalog_learning_v2.webp'),
  various: require('../../../assets/icons/catalog_various_v2.webp'),
};

export const CategoryIcon = ({type, size = 54}) => {
  const source = ICONS[type] || ICONS.canons;

  return (
    <Image
      source={source}
      style={[styles.icon, {width: size, height: size}]}
      resizeMode="contain"
    />
  );
};

const styles = StyleSheet.create({
  icon: {
    width: 54,
    height: 54,
  },
});
