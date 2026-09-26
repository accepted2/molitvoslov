import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {StyleSheet, Text, View} from 'react-native';

import {MenuScreen} from '../screens/MenuScreen';
import {CategoryMenuScreen} from '../screens/CategoryMenuScreen';
import {TextsListScreen} from '../screens/TextsListScreen';
import {ReaderScreen} from '../screens/ReaderScreen';
import {BookScreen} from '../screens/BookScreen';
import {PrayerRuleScreen} from '../screens/PrayerRuleScreen';
import PsalterScreen from '../screens/PsalterScreen';
import KathismaScreen from '../screens/KathismaScreen';
import {AkathistListScreen} from '../screens/AkathistListScreen';
import {AkathistScreen} from '../screens/AkathistScreen';
import {CanonListScreen} from '../screens/CanonListScreen';
import {CanonScreen} from '../screens/CanonScreen';
import {CommunionPreparationScreen} from '../screens/CommunionPreparationScreen';
import {BibleScreen} from '../screens/BibleScreen';
import {BibleBooksScreen} from '../screens/BibleBooksScreen';
import {BibleBookScreen} from '../screens/BibleBookScreen';
import {BibleChapterScreen} from '../screens/BibleChapterScreen';
import {BookmarksScreen} from '../screens/BookmarksScreen';
import {FavoritesScreen} from '../screens/FavoritesScreen';
import {ContinueReadingScreen} from '../screens/ContinueReadingScreen';
import {AccountScreen} from '../screens/AccountScreen';
import {colors} from '../theme';
import {LinearGradient} from 'expo-linear-gradient';
const Stack = createStackNavigator();

const SectionHeaderTitle = ({title}) => (
  <View style={styles.sectionHeaderTitle}>
    <Text style={styles.sectionHeaderText}>{title}</Text>

    <View style={styles.sectionHeaderOrnament}>
      <View style={styles.sectionHeaderLine} />
      <Text style={styles.sectionHeaderMark}>✦</Text>
      <View style={styles.sectionHeaderLine} />
    </View>
  </View>
);

export const AppNavigator = () => (
  <NavigationContainer>
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTitleStyle: {
          fontWeight: '700',
          color: colors.text,
        },
        headerTintColor: colors.accent,
        headerBackTitleVisible: false,
        cardStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen name="Menu" component={MenuScreen} options={{headerShown: false}} />
      <Stack.Screen name="Bookmarks" component={BookmarksScreen} options={{headerShown: false}} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} options={{headerShown: false}} />
      <Stack.Screen
        name="ContinueReading"
        component={ContinueReadingScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="CategoryMenu"
        component={CategoryMenuScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen name="TextsList" component={TextsListScreen} options={{headerShown: false}} />
      <Stack.Screen name="Book" component={BookScreen} options={{headerShown: false}} />
      <Stack.Screen name="Reader" component={ReaderScreen} options={{headerShown: false}} />
      <Stack.Screen
        name="PrayerRule"
        component={PrayerRuleScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="Psalter"
        component={PsalterScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen name="Kathisma" component={KathismaScreen} options={{headerShown: false}} />
      <Stack.Screen
        name="AkathistList"
        component={AkathistListScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="Akathist"
        component={AkathistScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="CanonList"
        component={CanonListScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="Canon"
        component={CanonScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="CommunionPreparation"
        component={CommunionPreparationScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen name="Bible" component={BibleScreen} options={{headerShown: false}} />
      <Stack.Screen name="BibleBooks" component={BibleBooksScreen} options={{headerShown: false}} />
      <Stack.Screen name="BibleBook" component={BibleBookScreen} options={{headerShown: false}} />
      <Stack.Screen name="BibleChapter" component={BibleChapterScreen} options={{headerShown: false}} />
      <Stack.Screen name="Account" component={AccountScreen} options={{headerShown: false}} />
    </Stack.Navigator>
  </NavigationContainer>
);
const styles = StyleSheet.create({
  sectionHeaderTitle: {
    minWidth: 150,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },

  sectionHeaderText: {
    color: '#3D281A',
    fontFamily: 'serif',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
  },

  sectionHeaderOrnament: {
    width: 125,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },

  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(145, 94, 43, 0.42)',
  },

  sectionHeaderMark: {
    marginHorizontal: 5,
    color: '#A16B34',
    fontSize: 7,
  },
});