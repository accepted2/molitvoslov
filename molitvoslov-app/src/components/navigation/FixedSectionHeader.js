import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';

export const FixedSectionHeader = ({
  title,
  navigation,
  topInset = 0,
  showBack = true,
  showTitle = true,
  minimal = false,
  showMenu = false,
  onMenuPress,
  dark = false,
}) => {
  const headerHeight = topInset + (minimal ? 46 : 56);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.fixedHeader,
        {
          height: minimal ? headerHeight : headerHeight + 10,
        },
      ]}
    >
      {!minimal && (
        <LinearGradient
          pointerEvents="none"
          colors={
            dark
              ? ['#171310', 'rgba(23, 19, 16, 0.82)', 'rgba(23, 19, 16, 0)']
              : ['#FFF4DE', 'rgba(255, 244, 222, 0.72)', 'rgba(255, 244, 222, 0)']
          }
          locations={[0, 0.42, 1]}
          start={{x: 0.5, y: 0}}
          end={{x: 0.5, y: 1}}
          style={StyleSheet.absoluteFill}
        />
      )}

      <View
        style={[
          styles.headerContent,
          {
            height: headerHeight,
            paddingTop: topInset,
          },
        ]}
      >
        {showBack && (
          <Pressable
            hitSlop={12}
            onPress={() => navigation.goBack()}
            style={({pressed}) => [
              styles.backButton,
              minimal && styles.backButtonMinimal,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.backArrow, dark && styles.backArrowDark]}>‹</Text>
          </Pressable>
        )}

        {showTitle && (
          <View style={[styles.titleWrap, !showBack && styles.titleWrapRoot]}>
            <Text
              style={[styles.title, dark && styles.titleDark]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>

            <View style={styles.ornament}>
              <View style={[styles.line, dark && styles.lineDark]} />
              <Text style={[styles.mark, dark && styles.markDark]}>✦</Text>
              <View style={[styles.line, dark && styles.lineDark]} />
            </View>
          </View>
        )}

        {showMenu && (
          <Pressable
            hitSlop={12}
            onPress={onMenuPress}
            style={({pressed}) => [
              styles.menuButton,
              !showTitle && styles.menuButtonWithoutTitle,
              minimal && styles.menuButtonMinimal,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.menuText, dark && styles.menuTextDark]}>⋮</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },

  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  titleWrapRoot: {
    marginLeft: 8,
  },

  backButton: {
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backButtonMinimal: {
    marginTop: -5,
  },

  backArrow: {
    marginTop: -2,
    color: '#6F4727',
    fontFamily: 'serif',
    fontSize: 34,
    lineHeight: 46,
  },

  titleWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 2,
    paddingTop: 1,
    paddingRight: 10,
  },

  title: {
    color: '#432A19',
    fontFamily: 'serif',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '700',
  },

  ornament: {
    width: 118,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },

  line: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(139, 88, 40, 0.38)',
  },

  mark: {
    marginHorizontal: 6,
    color: '#98622E',
    fontSize: 7,
  },

  menuButton: {
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuButtonWithoutTitle: {
    marginLeft: 'auto',
  },

  menuButtonMinimal: {
    marginTop: -5,
  },

  menuText: {
    marginTop: -3,
    color: '#6F4727',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },

  backArrowDark: {
    color: '#D7B88C',
  },

  titleDark: {
    color: '#EADBC7',
  },

  lineDark: {
    backgroundColor: 'rgba(205, 163, 108, 0.30)',
  },

  markDark: {
    color: '#C59762',
  },

  menuTextDark: {
    color: '#D7B88C',
  },

  pressed: {
    opacity: 0.6,
  },
});
