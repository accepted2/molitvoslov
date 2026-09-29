import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isSuccessResponse,
} from 'react-native-nitro-google-signin';

import {
  loginToBackendWithGoogle,
  logoutFromBackend,
} from './backendAuth';

const GOOGLE_WEB_CLIENT_ID =
  '451725030385-me2s7pa7ejshhoe7fmet5m0p0bv3eho1.apps.googleusercontent.com';

GoogleOneTapSignIn.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
});

export const signInWithGoogle = async () => {
  await GoogleOneTapSignIn.checkPlayServices();

  /*
   * Пользователь сам нажал "Войти через Google".
   *
   * Поэтому запускаем явный Sign in with Google flow,
   * а не One Tap bottom sheet.
   *
   * На Android этот вариант позволяет:
   * - выбрать другой Google-аккаунт;
   * - добавить новый Google-аккаунт;
   * - повторно авторизовать аккаунт при необходимости.
   */
  const response =
    await GoogleOneTapSignIn.presentExplicitSignIn();

  if (isCancelledResponse(response)) {
    return null;
  }

  if (!isSuccessResponse(response)) {
    throw new Error(
      'Не удалось выполнить вход через Google'
    );
  }

  const {
    user: googleUser,
    idToken,
  } = response.data;

  if (!idToken) {
    throw new Error(
      'Google не вернул ID token'
    );
  }

  const backendData =
    await loginToBackendWithGoogle(idToken);

  const backendUser =
    backendData.user ?? backendData;

  return {
    idToken,

    user: {
      ...googleUser,
      ...backendUser,
    },

    googleUser,
    backendUser,
  };
};

export const signOutFromGoogle = async () => {
  await logoutFromBackend();

  await GoogleOneTapSignIn.signOut();
};