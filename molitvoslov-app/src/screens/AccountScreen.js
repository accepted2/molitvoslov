import React, {useEffect, useState} from 'react';

import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';

import {SafeAreaView} from 'react-native-safe-area-context';

import {getCurrentBackendUser} from '../services/backendAuth';

import {signInWithGoogle, signOutFromGoogle} from '../services/googleAuth';

import {syncSavedItems} from '../services/savedItems';

import {syncReadingProgress} from '../services/readingProgress';

import {syncMemorials} from '../services/memorials';
import {syncPrayerBooks} from '../services/prayerBooks';

import {colors, radius, spacing} from '../theme';

import {adoptAnonymousLocalData} from '../services/localDataOwnership';

import {BottomNav} from '../components/navigation/BottomNav';

export const AccountScreen = ({navigation}) => {
  const [googleUser, setGoogleUser] = useState(null);

  const [loading, setLoading] = useState(true);

  const [googleLoading, setGoogleLoading] = useState(false);

  const [googleError, setGoogleError] = useState('');

  useEffect(() => {
    const loadUser = async () => {
      try {
        const backendUser = await getCurrentBackendUser();

        if (backendUser) {
          setGoogleUser({
            id: backendUser.id,

            email: backendUser.email,

            name: backendUser.name || backendUser.first_name || backendUser.username,

            photo: backendUser.picture_url || backendUser.picture || null,
          });
        }
      } catch (err) {
        console.error('LOAD ACCOUNT ERROR', err);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const googleLogin = async () => {
    try {
      setGoogleError('');

      setGoogleLoading(true);

      const googleResult = await signInWithGoogle();

      if (!googleResult) {
        return;
      }

      setGoogleUser(googleResult.user);
      await adoptAnonymousLocalData(googleResult.user.id);
      /*
       * После успешного Google/Django
       * входа сразу восстанавливаем
       * облачные данные пользователя.
       */
      const [
        savedItemsSyncResult,
        readingProgressSyncResult,
        memorialsSyncResult,
        prayerBooksSyncResult,
      ] = await Promise.all([
        syncSavedItems(),
        syncReadingProgress(),
        syncMemorials(),
        syncPrayerBooks(),
      ]);

      if (
        savedItemsSyncResult?.success &&
        readingProgressSyncResult?.success &&
        memorialsSyncResult?.success &&
        prayerBooksSyncResult?.success
      ) {
        console.log('Cloud sync OK: google-login');
      } else {
        const error =
          savedItemsSyncResult?.error ||
          readingProgressSyncResult?.error ||
          memorialsSyncResult?.error ||
          prayerBooksSyncResult?.error;

        const reason =
          savedItemsSyncResult?.reason ||
          readingProgressSyncResult?.reason ||
          memorialsSyncResult?.reason ||
          prayerBooksSyncResult?.reason;

        console.log('Cloud sync после Google-входа отложен', error?.message || reason || 'unknown');
      }

      console.log('GOOGLE LOGIN OK', {
        email: googleResult.user?.email,

        name: googleResult.user?.name,

        hasIdToken: Boolean(googleResult.idToken),
      });
    } catch (err) {
      console.error('GOOGLE LOGIN ERROR', err);

      setGoogleError(err?.message || 'Не удалось выполнить вход через Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const googleLogout = async () => {
    try {
      /*
       * signOutFromGoogle()
       * уже вызывает logoutFromBackend()
       * внутри googleAuth.js.
       */
      await signOutFromGoogle();
    } finally {
      setGoogleUser(null);
    }
  };

  // if (loading) {
  //   return (
  //     <SafeAreaView style={styles.safeArea}>
  //       <View style={styles.center}>
  //         <ActivityIndicator size="large" color={colors.accent} />
  //       </View>
  //     </SafeAreaView>
  //   );
  // }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.title}>Аккаунт</Text>

          {loading ? (
            <View style={styles.card}>
              <View style={styles.accountLoading}>
                <ActivityIndicator
                  size="small"
                  color={colors.accent}
                />

                <Text style={styles.accountLoadingText}>
                  Проверка аккаунта...
                </Text>
              </View>
            </View>
          ) : googleUser ? (

            <View style={styles.card}>
              <Text style={styles.label}>Вы вошли через Google</Text>

              {!!googleUser.name && <Text style={styles.username}>{googleUser.name}</Text>}

              {!!googleUser.email && <Text style={styles.googleEmail}>{googleUser.email}</Text>}

              <Pressable
                onPress={googleLogout}
                style={({pressed}) => [styles.button, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>Выйти</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.loginDescription}>
                Войдите через Google, чтобы синхронизировать избранное, прогресс чтения, помянник,
                личные молитвословы и другие данные между устройствами.
              </Text>

              <Text style={styles.loginHint}>
                При первом входе аккаунт будет создан автоматически.
              </Text>

              {!!googleError && <Text style={styles.error}>{googleError}</Text>}

              <Pressable
                onPress={googleLogin}
                disabled={googleLoading}
                style={({pressed}) => [
                  styles.googleButton,

                  pressed && styles.pressed,

                  googleLoading && styles.disabled,
                ]}
              >
                {googleLoading ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.googleButtonText}>Продолжить с Google</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>

        <BottomNav navigation={navigation} active="account" />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,

    backgroundColor: colors.background,
  },

  screen: {
    flex: 1,
  },

  content: {
    flex: 1,

    padding: spacing.lg,
  },

  center: {
    flex: 1,

    alignItems: 'center',

    justifyContent: 'center',
  },

  title: {
    fontSize: 28,

    fontWeight: '700',

    color: colors.text,

    marginBottom: spacing.lg,
  },

  card: {
    padding: spacing.lg,

    borderRadius: radius.lg,

    backgroundColor: colors.surface,

    borderWidth: 1,

    borderColor: colors.border,
  },
  accountLoading: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  accountLoadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },

  label: {
    color: colors.textSecondary,

    fontSize: 14,
  },

  username: {
    marginTop: spacing.xs,

    marginBottom: spacing.md,

    fontSize: 22,

    fontWeight: '700',

    color: colors.text,
  },

  googleEmail: {
    marginBottom: spacing.lg,

    color: colors.textSecondary,

    fontSize: 15,
  },

  loginDescription: {
    marginBottom: spacing.sm,

    color: colors.textSecondary,

    fontSize: 15,

    lineHeight: 22,
  },

  loginHint: {
    marginBottom: spacing.lg,

    color: colors.textMuted,

    fontSize: 13,

    lineHeight: 19,
  },

  error: {
    marginBottom: spacing.md,

    color: colors.liturgical,

    fontSize: 14,
  },

  button: {
    height: 48,

    alignItems: 'center',

    justifyContent: 'center',

    borderRadius: radius.md,

    backgroundColor: colors.accent,
  },

  buttonText: {
    color: colors.white,

    fontSize: 16,

    fontWeight: '700',
  },

  googleButton: {
    height: 48,

    alignItems: 'center',

    justifyContent: 'center',

    borderRadius: radius.md,

    borderWidth: 1,

    borderColor: colors.borderStrong,

    backgroundColor: colors.background,
  },

  googleButtonText: {
    color: colors.text,

    fontSize: 16,

    fontWeight: '600',
  },

  disabled: {
    opacity: 0.6,
  },

  pressed: {
    opacity: 0.7,
  },
});
