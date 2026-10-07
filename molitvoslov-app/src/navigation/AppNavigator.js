import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';

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
import {FavoritesScreen} from '../screens/FavoritesScreen';
import {MiscPrayersScreen} from '../screens/MiscPrayersScreen';
import {MiscPrayerPlaceholderScreen} from '../screens/MiscPrayerPlaceholderScreen';
import {ContinueReadingScreen} from '../screens/ContinueReadingScreen';
import {AccountScreen} from '../screens/AccountScreen';
import {MemorialScreen} from '../screens/MemorialScreen';
import {MemorialBookScreen} from '../screens/MemorialBookScreen';
import {PrayerBooksScreen} from '../screens/PrayerBooksScreen';
import {PrayerBookScreen} from '../screens/PrayerBookScreen';
import {PersonalPrayerEditorScreen} from '../screens/PersonalPrayerEditorScreen';
import {PrayerBookReaderScreen} from '../screens/PrayerBookReaderScreen';
import {ChurchCalendarScreen} from '../screens/ChurchCalendarScreen';

import {colors} from '../theme';

const Stack = createStackNavigator();

const linking = {
  prefixes: ['molitvoslov://'],

  config: {
    screens: {
      ChurchCalendar: {
        path: 'calendar/:date',
      },
    },
  },
};

/*
 * Короткий непрозрачный переход между экранами.
 *
 * Карточка остаётся полностью непрозрачной, поэтому предыдущий
 * экран не просвечивает под новым во время навигации.
 */
const solidTransition = ({current}) => ({
  cardStyle: {
    opacity: 1,
    transform: [
      {
        scale: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [1.008, 1],
        }),
      },
    ],
  },
});

const transitionTiming = {
  animation: 'timing',
  config: {
    duration: 90,
  },
};

export const AppNavigator = () => {
  return (
    <NavigationContainer linking={linking}>
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

          gestureEnabled: false,

          animationEnabled: true,

          cardStyleInterpolator: solidTransition,

          transitionSpec: {
            open: transitionTiming,
            close: transitionTiming,
          },
        }}
      >
        <Stack.Screen
          name="Menu"
          component={MenuScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="Favorites"
          component={FavoritesScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="MiscPrayers"
          component={MiscPrayersScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="MiscPrayerPlaceholder"
          component={MiscPrayerPlaceholderScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="ContinueReading"
          component={ContinueReadingScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="CategoryMenu"
          component={CategoryMenuScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="TextsList"
          component={TextsListScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="Book"
          component={BookScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="Reader"
          component={ReaderScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="PrayerRule"
          component={PrayerRuleScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="Psalter"
          component={PsalterScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="Kathisma"
          component={KathismaScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="AkathistList"
          component={AkathistListScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="Akathist"
          component={AkathistScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="CanonList"
          component={CanonListScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="Canon"
          component={CanonScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="CommunionPreparation"
          component={CommunionPreparationScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="Bible"
          component={BibleScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="ChurchCalendar"
          component={ChurchCalendarScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="BibleBooks"
          component={BibleBooksScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="BibleBook"
          component={BibleBookScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="BibleChapter"
          component={BibleChapterScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="Memorial"
          component={MemorialScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="MemorialBook"
          component={MemorialBookScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="PrayerBooks"
          component={PrayerBooksScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="PrayerBook"
          component={PrayerBookScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="PersonalPrayerEditor"
          component={PersonalPrayerEditorScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="PrayerBookReader"
          component={PrayerBookReaderScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="Account"
          component={AccountScreen}
          options={{
            headerShown: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
