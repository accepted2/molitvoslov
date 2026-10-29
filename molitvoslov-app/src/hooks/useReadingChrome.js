import {useCallback, useEffect, useRef, useState} from 'react';

// Controls reading chrome independently from progress/bookmark updates.
// Hide after two seconds without scrolling, including after upward movement.
export const useReadingChrome = () => {
  const [hidden, setHidden] = useState(false);
  const hideTimer = useRef(null);
  const hiddenRef = useRef(false);
  const lastDirection = useRef(null);

  const setVisibility = useCallback((nextHidden) => {
    if (hiddenRef.current === nextHidden) return;
    hiddenRef.current = nextHidden;
    setHidden(nextHidden);
  }, []);

  const onScroll = useCallback((direction) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    if (direction === 'activity') {
      if (lastDirection.current === 'up') setVisibility(false);
      if (!hiddenRef.current) hideTimer.current = setTimeout(() => setVisibility(true), 2000);
      return;
    }
    lastDirection.current = direction;
    if (direction === 'down') {
      setVisibility(true);
      return;
    }
    if (direction === 'up') setVisibility(false);
    // Activity messages keep the panel visible while the reader is moving up.
    if (!hiddenRef.current) {
      hideTimer.current = setTimeout(() => setVisibility(true), 2000);
    }
  }, [setVisibility]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  return {readingChromeHidden: hidden, handleReadingScroll: onScroll};
};
