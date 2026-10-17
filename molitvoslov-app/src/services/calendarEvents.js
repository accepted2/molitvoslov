// Shared calendar change notifications for the app screens and Android widget updates.
const listeners = new Set();
let revision = 0;

export const subscribeCalendarUpdates = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const publishCalendarUpdate = (change) => {
  revision += 1;
  listeners.forEach((listener) => {
    try {
      listener({...change, revision});
    } catch (error) {
      console.log('Calendar update listener failed:', error?.message || error);
    }
  });
};

export const getCalendarRevision = () => revision;
