import React, {
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from '../services/localAuth';

import {
  colors,
  radius,
  spacing,
} from '../theme';

import {
  BottomNav,
} from '../components/navigation/BottomNav';


export const AccountScreen = ({
                                navigation,
                              }) => {
  const [
    user,
    setUser,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    mode,
    setMode,
  ] = useState('login');

  const [
    username,
    setUsername,
  ] = useState('');

  const [
    password,
    setPassword,
  ] = useState('');

  const [
    error,
    setError,
  ] = useState('');


  useEffect(() => {
    const loadUser =
      async () => {
        const currentUser =
          await getCurrentUser();

        setUser(
          currentUser
        );

        setLoading(
          false
        );
      };

    loadUser();
  }, []);


  const submit =
    async () => {
      try {
        setError('');

        const result =
          mode === 'register'
            ? await registerUser(
              username,
              password
            )
            : await loginUser(
              username,
              password
            );

        setUser(
          result
        );

        setUsername('');
        setPassword('');
      } catch (err) {
        setError(
          err.message
        );
      }
    };


  const logout =
    async () => {
      await logoutUser();

      setUser(null);
    };


  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.center}
        >
          <ActivityIndicator
            size="large"
            color={colors.accent}
          />
        </View>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top']}
    >
      <View
        style={styles.screen}
      >
        <View
          style={styles.content}
        >
          <Text
            style={styles.title}
          >
            Аккаунт
          </Text>

          {user ? (
            <View
              style={styles.card}
            >
              <Text
                style={styles.label}
              >
                Вы вошли как
              </Text>

              <Text
                style={styles.username}
              >
                {user.username}
              </Text>

              <Pressable
                onPress={logout}
                style={({pressed}) => [
                  styles.button,
                  pressed &&
                  styles.pressed,
                ]}
              >
                <Text
                  style={styles.buttonText}
                >
                  Выйти
                </Text>
              </Pressable>
            </View>
          ) : (
            <View
              style={styles.card}
            >
              <View
                style={styles.modeRow}
              >
                <Pressable
                  onPress={() =>
                    setMode(
                      'login'
                    )
                  }
                >
                  <Text
                    style={[
                      styles.modeText,
                      mode ===
                      'login' &&
                      styles.modeActive,
                    ]}
                  >
                    Вход
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    setMode(
                      'register'
                    )
                  }
                >
                  <Text
                    style={[
                      styles.modeText,
                      mode ===
                      'register' &&
                      styles.modeActive,
                    ]}
                  >
                    Регистрация
                  </Text>
                </Pressable>
              </View>

              <TextInput
                value={username}
                onChangeText={
                  setUsername
                }
                placeholder="Имя пользователя"
                placeholderTextColor={
                  colors.textMuted
                }
                autoCapitalize="none"
                style={styles.input}
              />

              <TextInput
                value={password}
                onChangeText={
                  setPassword
                }
                placeholder="Пароль"
                placeholderTextColor={
                  colors.textMuted
                }
                secureTextEntry
                style={styles.input}
              />

              {!!error && (
                <Text
                  style={styles.error}
                >
                  {error}
                </Text>
              )}

              <Pressable
                onPress={submit}
                style={({pressed}) => [
                  styles.button,
                  pressed &&
                  styles.pressed,
                ]}
              >
                <Text
                  style={styles.buttonText}
                >
                  {
                    mode ===
                    'register'
                      ? 'Создать аккаунт'
                      : 'Войти'
                  }
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <BottomNav
          navigation={navigation}
          active="account"
        />
      </View>
    </SafeAreaView>
  );
};


const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
      colors.background,
    },

    screen: {
      flex: 1,
    },

    content: {
      flex: 1,
      padding:
      spacing.lg,
    },

    center: {
      flex: 1,
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    title: {
      fontSize: 28,
      fontWeight: '700',
      color:
      colors.text,
      marginBottom:
      spacing.lg,
    },

    card: {
      padding:
      spacing.lg,
      borderRadius:
      radius.lg,
      backgroundColor:
      colors.surface,
      borderWidth: 1,
      borderColor:
      colors.border,
    },

    label: {
      color:
      colors.textSecondary,
      fontSize: 14,
    },

    username: {
      marginTop:
      spacing.xs,
      marginBottom:
      spacing.lg,
      fontSize: 22,
      fontWeight: '700',
      color:
      colors.text,
    },

    modeRow: {
      flexDirection: 'row',
      gap: 20,
      marginBottom:
      spacing.lg,
    },

    modeText: {
      fontSize: 16,
      color:
      colors.textMuted,
    },

    modeActive: {
      color:
      colors.accent,
      fontWeight: '700',
    },

    input: {
      height: 48,
      paddingHorizontal:
      spacing.md,
      marginBottom:
      spacing.md,
      borderWidth: 1,
      borderColor:
      colors.borderStrong,
      borderRadius:
      radius.md,
      backgroundColor:
      colors.background,
      color:
      colors.text,
      fontSize: 16,
    },

    error: {
      marginBottom:
      spacing.md,
      color:
      colors.liturgical,
      fontSize: 14,
    },

    button: {
      height: 48,
      alignItems:
        'center',
      justifyContent:
        'center',
      borderRadius:
      radius.md,
      backgroundColor:
      colors.accent,
    },

    buttonText: {
      color:
      colors.white,
      fontSize: 16,
      fontWeight: '700',
    },

    pressed: {
      opacity: 0.7,
    },
  });