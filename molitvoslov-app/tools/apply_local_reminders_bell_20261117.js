(function applyLocalReminders() {
  'use strict';
  const fs = require('fs');
  const path = require('path');
  const root = process.cwd();
  const MARK = 'MOLITVOSLOV_LOCAL_REMINDERS_BELL_20261117';
  const paths = [
    'src/navigation/AppNavigator.js',
    'src/screens/MenuScreen.js',
    'app.json',
  ];
  const files = paths.map(name => {
    const filename = path.join(root, ...name.split('/'));
    if (!fs.existsSync(filename)) throw Error('Не найден файл: ' + filename);
    const original = fs.readFileSync(filename, 'utf8');
    return {name, filename, original, eol: original.includes('\r\n') ? '\r\n' : '\n',
      value: original.replace(/\r\n/g, '\n')};
  });
  if (!fs.existsSync(path.join(root, 'src/services/localPrayerReminders.js')) ||
      !fs.existsSync(path.join(root, 'src/screens/NotificationsScreen.js'))) {
    throw Error('Сначала скопируйте два новых файла из ветки GitHub.');
  }
  if (files[0].value.includes(MARK) && files[1].value.includes(MARK)) {
    console.log('OK: колокольчик уже подключён.');
    return;
  }
  if (files[0].value.includes(MARK) || files[1].value.includes(MARK)) {
    throw Error('Найден частично применённый патч; файлы не изменены.');
  }
  const once = (file, needle, replacement, label) => {
    const i = file.value.indexOf(needle);
    if (i < 0 || i !== file.value.lastIndexOf(needle)) {
      throw Error(file.name + ': не найден уникальный участок ' + label + '; файлы не изменены.');
    }
    file.value = file.value.replace(needle, replacement);
  };
  const [nav, menu, app] = files;

  once(nav, "import React from 'react';",
    "import React from 'react';\n" +
    "import * as Notifications from 'expo-notifications';\n" +
    "import {routeForNotificationResponse} from '../services/localPrayerReminders';\n" +
    "import {NotificationsScreen} from '../screens/NotificationsScreen';",
    'импортов');

  const navImplementation = [
    'export const AppNavigator = () => {',
    '  // ' + MARK,
    '  const navigationRef = React.useRef(null);',
    '  const pendingReminderRoute = React.useRef(null);',
    '  React.useEffect(() => {',
    '    let active = true;',
    '    const processed = new Set();',
    '    const handleResponse = async response => {',
    '      if (!response) return;',
    '      const identifier = response.notification?.request?.identifier;',
    "      const deliveryKey = identifier ? identifier + ':' + String(response.notification?.date || '') : null;",
    '      if (deliveryKey && processed.has(deliveryKey)) return;',
    '      if (deliveryKey) processed.add(deliveryKey);',
    '      try {',
    '        const destination = await routeForNotificationResponse(response);',
    '        if (!active || !destination) return;',
    '        if (navigationRef.current?.isReady()) {',
    '          navigationRef.current.navigate(destination.name, destination.params);',
    '        } else {',
    '          pendingReminderRoute.current = destination;',
    '        }',
    '        await Notifications.clearLastNotificationResponseAsync();',
    '      } catch (error) {',
    "        console.warn('[reminders] open notification:', error?.message || error);",
    '      }',
    '    };',
    '    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);',
    '    Notifications.getLastNotificationResponseAsync()',
    '      .then(handleResponse)',
    "      .catch(error => console.warn('[reminders] initial response:', error?.message || error));",
    '    return () => {active = false; subscription.remove();};',
    '  }, []);',
    '',
    '  const onNavigationReady = () => {',
    '    const destination = pendingReminderRoute.current;',
    '    pendingReminderRoute.current = null;',
    '    if (destination && navigationRef.current?.isReady()) {',
    '      navigationRef.current.navigate(destination.name, destination.params);',
    '    }',
    '  };',
    '',
    '  return (',
  ].join('\n');

  once(nav, 'export const AppNavigator = () => {\n  return (',
    navImplementation, 'обработчика нажатий');
  once(nav, '<NavigationContainer linking={linking}>',
    '<NavigationContainer linking={linking} ref={navigationRef} onReady={onNavigationReady}>',
    'навигации');
  once(nav, '        <Stack.Screen name="SharedImport"',
    '        <Stack.Screen name="Notifications" component={NotificationsScreen}\n' +
    '          options={{headerShown: false}} />\n\n' +
    '        <Stack.Screen name="SharedImport"',
    'экрана уведомлений');

  once(menu, "onPress={() => showPlaceholder(t('menu.notifications'))}",
    "onPress={() => navigation.navigate('Notifications')} /* " + MARK + " */",
    'колокольчика');
  // Do not show a permanent "unread" dot when nothing is unread.
  menu.value = menu.value.replace('<View style={styles.notificationDot} />',
    '{/* Уведомления не отмечаются непрочитанными заранее. */}');

  const config = JSON.parse(app.value);
  if (!Array.isArray(config.expo?.plugins)) throw Error('В app.json отсутствует список Expo plugins.');
  if (!config.expo.plugins.some(plugin => plugin === 'expo-notifications' ||
      (Array.isArray(plugin) && plugin[0] === 'expo-notifications'))) {
    config.expo.plugins.push(['expo-notifications',
      {color: '#80502F', defaultChannel: 'prayer-reminders'}]);
  }
  app.value = JSON.stringify(config, null, 2) + '\n';

  const stamp = '.backup-local-reminders-' +
    new Date().toISOString().replace(/[:.]/g, '-');
  const written = [];
  try {
    for (const f of files) fs.writeFileSync(f.filename + stamp, f.original, 'utf8');
    for (const f of files) {
      fs.writeFileSync(f.filename, f.value.replace(/\n/g, f.eol), 'utf8');
      written.push(f);
    }
  } catch (error) {
    for (const f of written) fs.writeFileSync(f.filename, f.original, 'utf8');
    throw error;
  }
  console.log('OK: колокольчик открывает экран "Уведомления".');
  console.log('OK: системные уведомления открывают нужный раздел.');
  console.log('Резервные копии:', stamp);
  console.log('Далее установите нативную библиотеку: npx expo install expo-notifications');
})();