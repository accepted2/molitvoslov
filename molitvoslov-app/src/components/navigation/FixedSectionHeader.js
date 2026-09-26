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
                                   }) => {
  const headerHeight =
    topInset +
    (minimal ? 46 : 56);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.fixedHeader,
        {
          height:
            minimal
              ? headerHeight
              : headerHeight + 26,
        },
      ]}
    >
      {!minimal && (
        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(239, 211, 160, 0.94)',
            'rgba(239, 211, 160, 0.90)',
            'rgba(239, 211, 160, 0.72)',
            'rgba(239, 211, 160, 0.34)',
            'rgba(239, 211, 160, 0)',
          ]}
          locations={[0, 0.50, 0.68, 0.86, 1]}
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
              minimal &&
                styles.backButtonMinimal,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
        )}

        {showTitle && (
          <View style={[
            styles.titleWrap,
            !showBack && styles.titleWrapRoot,
          ]}>
            <Text
              style={styles.title}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>

            <View style={styles.ornament}>
              <View style={styles.line} />
              <Text style={styles.mark}>✦</Text>
              <View style={styles.line} />
            </View>
          </View>
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
    lineHeight: 36,
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

  pressed: {
    opacity: 0.6,
  },
});