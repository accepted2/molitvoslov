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
  const [
    savedProgress,
    setSavedProgress,
  ] = useState(null);

  const [
    progressLoading,
    setProgressLoading,
  ] = useState(true);

  const saveTimerRef =
    useRef(null);

  const pendingProgressRef =
    useRef(null);

  const sourceKeyRef =
    useRef(null);


  const loadProgress =
    useCallback(async () => {
      const sourceKey =
        sourceType &&
        sourceId
          ? `${sourceType}:${sourceId}`
          : null;

      sourceKeyRef.current =
        sourceKey;

      setSavedProgress(
        null
      );

      if (
        !sourceType ||
        !sourceId
      ) {
        setProgressLoading(
          false
        );

        return;
      }

      try {
        setProgressLoading(
          true
        );

        const progressList =
          await getReadingProgress();

        if (
          sourceKeyRef.current !==
          sourceKey
        ) {
          return;
        }

        const progress =
          progressList.find(
            item =>
              item.source_type ===
                sourceType &&
              Number(
                item.source_id
              ) ===
                Number(
                  sourceId
                )
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
        if (
          sourceKeyRef.current ===
          sourceKey
        ) {
          setProgressLoading(
            false
          );
        }
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
          await saveReadingProgress(
            progress
          );

          /*
           * ВАЖНО:
           * здесь специально НЕ обновляем savedProgress.
           *
           * savedProgress нужен для восстановления позиции
           * при входе на экран. Если обновлять его после
           * каждого автосохранения во время прокрутки,
           * экран воспринимает свежее сохранение как команду
           * снова восстановить позицию и появляется рывок.
           */
          if (
            pendingProgressRef
              .current
              ?.anchorId ===
              progress.anchorId &&
            pendingProgressRef
              .current
              ?.offset ===
              progress.offset
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
          offset:
            Math.max(
              0,
              Math.round(
                offset
              )
            ),
        };

        pendingProgressRef.current =
          progress;

        if (
          saveTimerRef.current
        ) {
          clearTimeout(
            saveTimerRef.current
          );
        }

        saveTimerRef.current =
          setTimeout(() => {
            persistProgress(
              progress
            );
          }, 700);
      },
      [
        sourceType,
        sourceId,
        persistProgress,
      ]
    );


  useEffect(() => {
    loadProgress();
  }, [
    loadProgress,
  ]);


  useEffect(() => {
    return () => {
      if (
        saveTimerRef.current
      ) {
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
  }, [
    persistProgress,
  ]);


  return {
    savedProgress,
    progressLoading,
    scheduleSave,
    reloadProgress:
      loadProgress,
  };
};
