import {useCallback, useEffect, useRef, useState} from 'react';

// The reading controls hide while reading, but must remain available at
// the very top of a document (including after the idle timeout).
export const useReadingChrome = () => {
  const [hidden, setHidden] = useState(false);
  const hideTimer = useRef(null);
  const hiddenRef = useRef(false);
  const atTopRef = useRef(true);
  const lastDirection = useRef(null);

  const setVisibility = useCallback((nextHidden) => {
    if (hiddenRef.current === nextHidden) return;
    hiddenRef.current = nextHidden;
    setHidden(nextHidden);
  }, []);

  const onScroll = useCallback((direction) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;

    // Emitted by both HTML readers when scroll position reaches the top.
    // Never start the idle-hide timer until the reader leaves this area.
    if (direction === 'top') {
      atTopRef.current = true;
      lastDirection.current = 'up';
      setVisibility(false);
      return;
    }

    if (direction === 'activity') {
      if (atTopRef.current) {
        setVisibility(false);
        return;
      }
      if (lastDirection.current === 'up') setVisibility(false);
      if (!hiddenRef.current) hideTimer.current = setTimeout(() => setVisibility(true), 2000);
      return;
    }

    atTopRef.current = false;
    lastDirection.current = direction;
    if (direction === 'down') {
      setVisibility(true);
      return;
    }
    if (direction === 'up') setVisibility(false);
    if (!hiddenRef.current) {
      hideTimer.current = setTimeout(() => setVisibility(true), 2000);
    }
  }, [setVisibility]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  return {readingChromeHidden: hidden, handleReadingScroll: onScroll};
};
