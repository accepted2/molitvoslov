import {useSyncExternalStore} from 'react';

import {
  getBibleContentGeneration,
  subscribeToBibleContentUpdates,
} from '../services/bibleStore';

export const useBibleContentGeneration = () =>
  useSyncExternalStore(
    subscribeToBibleContentUpdates,
    getBibleContentGeneration,
    getBibleContentGeneration
  );
