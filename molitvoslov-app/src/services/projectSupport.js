// Voluntary donations are handled only by an external provider.
// The app never accepts card details, stores payments or asserts success.
// Configure the project's own trusted HTTPS donation page at build time via
// EXPO_PUBLIC_SUPPORT_URL. Without it, the payment button is not shown.
const HTTPS_PUBLIC_DOMAIN = /^https:\/\/(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#][^\s]*)?$/i;
export const isSecureProjectSupportUrl = value =>
  typeof value === 'string' &&
  HTTPS_PUBLIC_DOMAIN.test(value.trim()) &&
  !value.includes('@');

export const getProjectSupportUrl = () => {
  const url = process.env.EXPO_PUBLIC_SUPPORT_URL;
  return isSecureProjectSupportUrl(url) ? url.trim() : null;
};
