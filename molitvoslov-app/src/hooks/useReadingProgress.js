import {useCallback, useEffect, useRef, useState} from 'react';

import {getReadingProgress, saveReadingProgress} from '../services/readingProgress';

const PROGRESS_SETTLE_MS = 4000;

const normalizeStoredProgress = (item) => {
  if (!item) {
    return null;
  }

  return {
    sourceType: item.source_type,
    sourceId: item.source_id,
    anchorType: item.anchor_type,
    anchorId: item.anchor_id,
    offset: Math.max(0, Number(item.offset || 0)),
    progressPercent: Math.max(0, Math.min(100, Math.round(Number(item.progress_percent || 0)))),
    metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : null,
  };
};

export const useReadingProgress = ({sourceType, sourceId}) => {
  const [savedProgress, setSavedProgress] = useState(null);
  const [progressLoading, setProgressLoading] = useState(true);
  const [loadedSourceKey, setLoadedSourceKey] = useState(null);

  const currentSourceKey = sourceType && sourceId ? `${sourceType}:${sourceId}` : null;

  const saveTimerRef = useRef(null);
  const pendingProgressRef = useRef(null);
  const pendingStartedAtRef = useRef(0);
  const currentProgressRef = useRef(null);
  const stableProgressRef = useRef(null);
  const sourceKeyRef = useRef(null);

  const loadProgress = useCallback(async () => {
    const sourceKey = sourceType && sourceId ? `${sourceType}:${sourceId}` : null;

    sourceKeyRef.current = sourceKey;
    setLoadedSourceKey(null);
    setSavedProgress(null);
    currentProgressRef.current = null;
    stableProgressRef.current = null;

    if (!sourceType || !sourceId) {
      setLoadedSourceKey(null);
      setProgressLoading(false);
      return;
    }

    try {
      setProgressLoading(true);

      const progressList = await getReadingProgress();

      if (sourceKeyRef.current !== sourceKey) {
        return;
      }

      const progress = progressList.find(
        (item) => item.source_type === sourceType && Number(item.source_id) === Number(sourceId)
      );

      const normalizedProgress = normalizeStoredProgress(progress);

      setSavedProgress(progress || null);
      currentProgressRef.current = normalizedProgress;
      stableProgressRef.current = normalizedProgress;
      setLoadedSourceKey(sourceKey);
    } catch (error) {
      console.log(
        'Ошибка загрузки прогресса:',
        error.response?.status,
        error.response?.data,
        error.message
      );

      if (sourceKeyRef.current === sourceKey) {
        setLoadedSourceKey(sourceKey);
      }
    } finally {
      if (sourceKeyRef.current === sourceKey) {
        setProgressLoading(false);
      }
    }
  }, [sourceType, sourceId]);

  const persistProgress = useCallback(async (progress) => {
    if (!progress) {
      return;
    }

    try {
      await saveReadingProgress(progress);
      stableProgressRef.current = progress;

      if (
        pendingProgressRef.current?.sourceType === progress.sourceType &&
        Number(pendingProgressRef.current?.sourceId) === Number(progress.sourceId) &&
        pendingProgressRef.current?.anchorType === progress.anchorType &&
        Number(pendingProgressRef.current?.anchorId) === Number(progress.anchorId) &&
        pendingProgressRef.current?.offset === progress.offset &&
        pendingProgressRef.current?.progressPercent === progress.progressPercent
      ) {
        pendingProgressRef.current = null;
        pendingStartedAtRef.current = 0;
      }
    } catch (error) {
      console.log(
        'Ошибка сохранения прогресса:',
        error.response?.status,
        error.response?.data,
        error.message
      );
    }
  }, []);

  const scheduleSave = useCallback(
    ({anchorType, anchorId, offset = 0, progressPercent = 0, metadata = null}) => {
      if (!sourceType || !sourceId || !anchorType || !anchorId) {
        return;
      }

      const progress = {
        sourceType,
        sourceId,
        anchorType,
        anchorId,
        offset: Math.max(0, Math.round(Number(offset || 0))),
        progressPercent: Math.max(0, Math.min(Math.round(Number(progressPercent || 0)), 100)),
        metadata: metadata && typeof metadata === 'object' ? metadata : null,
      };

      currentProgressRef.current = progress;
      pendingProgressRef.current = progress;
      pendingStartedAtRef.current = Date.now();

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        persistProgress(progress);
      }, PROGRESS_SETTLE_MS);
    },
    [sourceType, sourceId, persistProgress]
  );

  const getCurrentProgress = useCallback(() => currentProgressRef.current, []);
  const getStableProgress = useCallback(() => stableProgressRef.current, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      const pending = pendingProgressRef.current;
      const pendingAge = Date.now() - Number(pendingStartedAtRef.current || 0);

      /*
       * Быстрый просмотр другого места не должен
       * перезаписывать реальную позицию чтения.
       * При закрытии сохраняем только уже "устоявшуюся"
       * позицию.
       */
      if (pending && pendingAge >= PROGRESS_SETTLE_MS) {
        persistProgress(pending);
      }
    };
  }, [persistProgress]);

  return {
    savedProgress,
    progressLoading,

    progressReady: !!currentSourceKey && loadedSourceKey === currentSourceKey,

    scheduleSave,
    getCurrentProgress,
    getStableProgress,

    reloadProgress: loadProgress,
  };
};
