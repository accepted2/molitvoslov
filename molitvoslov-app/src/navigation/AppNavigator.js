import React from 'react';

import {
  NavigationContainer,
} from '@react-navigation/native';

import {
  createStackNavigator,
} from '@react-navigation/stack';

import {
  MenuScreen,
} from '../screens/MenuScreen';

import {
  CategoryMenuScreen,
} from '../screens/CategoryMenuScreen';

import {
  TextsListScreen,
} from '../screens/TextsListScreen';

import {
  ReaderScreen,
} from '../screens/ReaderScreen';

import {
  BookScreen,
} from '../screens/BookScreen';

import {
  PrayerRuleScreen,
} from '../screens/PrayerRuleScreen';

import PsalterScreen
  from '../screens/PsalterScreen';

import KathismaScreen
  from '../screens/KathismaScreen';

import {
  AkathistListScreen,
} from '../screens/AkathistListScreen';

import {
  AkathistScreen,
} from '../screens/AkathistScreen';

import {
  colors,
} from '../theme';


const Stack =
  createStackNavigator();


export const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor:
              colors.background,

            shadowColor:
              'transparent',

            elevation: 0,
          },

          headerTitleStyle: {
            fontWeight: '700',
            color:
              colors.text,
          },

          headerTintColor:
            colors.accent,

          headerBackTitleVisible:
            false,

          cardStyle: {
            backgroundColor:
              colors.background,
          },
        }}
      >
        <Stack.Screen
          name="Menu"
          component={
            MenuScreen
          }
          options={{
            headerShown:
              false,
          }}
        />

        <Stack.Screen
          name="CategoryMenu"
          component={
            CategoryMenuScreen
          }
          options={{
            title:
              'Категории',
          }}
        />

        <Stack.Screen
          name="TextsList"
          component={
            TextsListScreen
          }
          options={{
            title:
              'Молитвы',
          }}
        />

        <Stack.Screen
          name="Book"
          component={
            BookScreen
          }
          options={{
            title:
              'Чтение',
          }}
        />

        <Stack.Screen
          name="Reader"
          component={
            ReaderScreen
          }
          options={{
            title:
              'Чтение',
          }}
        />

        <Stack.Screen
          name="PrayerRule"
          component={
            PrayerRuleScreen
          }
          options={{
            title:
              'Молитвенное правило',
          }}
        />

        <Stack.Screen
          name="Psalter"
          component={
            PsalterScreen
          }
          options={{
            title:
              'Псалтирь',
          }}
        />

        <Stack.Screen
          name="Kathisma"
          component={
            KathismaScreen
          }
          options={{
            title:
              'Кафизма',
          }}
        />

        <Stack.Screen
          name="AkathistList"
          component={
            AkathistListScreen
          }
          options={{
            title:
              'Акафисты',
          }}
        />

        <Stack.Screen
          name="Akathist"
          component={
            AkathistScreen
          }
          options={({
            route,
          }) => ({
            title:
              route.params
                ?.title ||
              'Акафист',
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
