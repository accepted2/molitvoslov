import React from 'react';
import {Image} from 'react-native';

const HEARTS = {
  outline: require('../../../assets/icons/save-heart-outline.png'),
  filled: require('../../../assets/icons/save-heart-filled.png'),
};

export const SaveHeartIcon = ({active = false, size = 19}) => (
  <Image
    accessible={false}
    source={active ? HEARTS.filled : HEARTS.outline}
    style={{
      width: size,
      height: size,
    }}
    resizeMode="contain"
  />
);
