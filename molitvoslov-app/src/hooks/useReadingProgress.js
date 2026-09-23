import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  getReadingProgress,
  saveReadingProgress,
} from '../services/readingProgress';


export const useReadingProgress = ({
                                     sourceType,
                                     sourceId,
                                   }) => {
  const [savedProgress, setSavedProgress] =
    useState(null);

  const [progressLoading, setProgressLoading] =
    useState(true);

  const saveTimerRef = useRef(null);
  const pendingProgressRef = useRef(null);


  const loadProgress = useCallback(async () => {
    if (!sourceType || !sourceId) {
      setProgressLoading(false);
      return;
    }

    try {
      setProgressLoading(true);

      const progressList =
        await getReadingProgress();

      const progress =
        progressList.find(
          item =>
            item.source_type === sourceType &&
            Number(item.source_id) ===
            Number(sourceId)
        );

      setSavedProgress(
        progress || null
      );

    } catch (error) {
      console.log(
        'Ошибка загрузки прогресса:',
        error.response?.status,
        error.response?.data,
        error.message
      );

    } finally {
      setProgressLoading(false);
    }
  }, [
    sourceType,
    sourceId,
  ]);


  const persistProgress =
    useCallback(
      async progress => {
        if (!progress) {
          return;
        }

        try {
          const saved =
            await saveReadingProgress(
              progress
            );

          setSavedProgress(saved);

          if (
            pendingProgressRef.current
              ?.anchorId ===
            progress.anchorId
          ) {
            pendingProgressRef.current =
              null;
          }

        } catch (error) {
          console.log(
            'Ошибка сохранения прогресса:',
            error.response?.status,
            error.response?.data,
            error.message
          );
        }
      },
      []
    );


  const scheduleSave =
    useCallback(
      ({
         anchorType,
         anchorId,
         offset = 0,
       }) => {
        if (
          !sourceType ||
          !sourceId ||
          !anchorType ||
          !anchorId
        ) {
          return;
        }

        const progress = {
          sourceType,
          sourceId,
          anchorType,
          anchorId,
          offset,
        };

        pendingProgressRef.current =
          progress;

        if (saveTimerRef.current) {
          clearTimeout(
            saveTimerRef.current
          );
        }

        saveTimerRef.current =
          setTimeout(() => {
            persistProgress(
              progress
            );
          }, 800);
      },
      [
        sourceType,
        sourceId,
        persistProgress,
      ]
    );


  useEffect(() => {
    loadProgress();
  }, [loadProgress]);


  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(
          saveTimerRef.current
        );
      }

      if (
        pendingProgressRef.current
      ) {
        persistProgress(
          pendingProgressRef.current
        );
      }
    };
  }, [persistProgress]);


  return {
    savedProgress,
    progressLoading,
    scheduleSave,
    reloadProgress: loadProgress,
  };
};