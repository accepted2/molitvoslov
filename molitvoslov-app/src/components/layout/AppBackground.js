import React from 'react';
import {ImageBackground, StyleSheet, View} from 'react-native';

import {homeArtwork} from '../../data/homeArtwork';

export const AppBackground = ({children, style, imageOpacity = 0.72}) => {
  return (
    <View style={[styles.container, style]}>
      <ImageBackground
        source={homeArtwork.page_bg}
        resizeMode="cover"
        style={styles.background}
        imageStyle={[styles.backgroundImage, {opacity: imageOpacity}]}
      >
        {children}
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#B78A58',
  },

  background: {
    flex: 1,
  },

});