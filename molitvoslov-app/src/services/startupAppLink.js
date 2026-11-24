import {Linking} from 'react-native';
import {normalizeIncomingAppLink} from './appLinks';

// Capture external links as soon as the JS application starts, BEFORE the
// offline database/font/onboarding gate mounts NavigationContainer.
// Linking events can arrive while the splash screen is still visible.
let startupLink = null;
let initialPromise = null;
let earlySubscription = null;
let navigationAttached = false;

const normalized = url => normalizeIncomingAppLink(url);

export const beginStartupAppLinkCapture = () => {
  if (!navigationAttached && !earlySubscription) {
    earlySubscription = Linking.addEventListener('url', ({url}) => {
      const link = normalized(url);
      if (link) startupLink = link;
    });
  }
  if (!initialPromise) {
    initialPromise = Promise.resolve()
      .then(() => Linking.getInitialURL())
      .then(url => {
        const link = normalized(url);
        // Prefer a later, explicitly delivered link if Android supplied one
        // while the JS root was starting.
        if (link && !startupLink) startupLink = link;
        return startupLink;
      })
      .catch(error => {
        console.warn('[links] early initial URL:', error?.message || error);
        return startupLink;
      });
  }
  return initialPromise;
};

export const readStartupAppLink = async () => {
  await beginStartupAppLinkCapture();
  if (startupLink) return startupLink;
  // Some Android builds expose the intent URL only after JS startup. Retry
  // once when React Navigation mounts, without relying on a fixed timer.
  try {
    const link = normalized(await Linking.getInitialURL());
    if (link) startupLink = link;
  } catch (error) {
    console.warn('[links] deferred initial URL:', error?.message || error);
  }
  return startupLink;
};

export const completeStartupAppLinkCapture = () => {
  navigationAttached = true;
  earlySubscription?.remove();
  earlySubscription = null;
};
