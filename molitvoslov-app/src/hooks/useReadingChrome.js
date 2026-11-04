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

  // Some Android WebViews do not deliver the first injected page scroll
  // event until their HTML is reloaded (e.g. after switching language).
  // Native WebView scroll is a secondary, independent source of direction.
  const nativeY = useRef(null);
  const nativePending = useRef(0);
  const nativeDirection = useRef(null);
  const handleNativeReadingScroll = useCallback((event) => {
    const raw = event?.nativeEvent?.contentOffset?.y;
    if (!Number.isFinite(raw)) return;
    const y = Math.max(0, raw);
    const previous = nativeY.current;
    nativeY.current = y;

    if (y <= 35) {
      nativePending.current = 0;
      nativeDirection.current = 'top';
      onScroll('top');
      return;
    }
    if (previous == null) {
      // A restored deep link may start away from the top.
      atTopRef.current = false;
      return;
    }
    const delta = y - previous;
    if (!delta) return;
    const next = delta > 0 ? 'down' : 'up';
    if (next !== nativeDirection.current) {
      nativePending.current += Math.abs(delta);
      if (nativePending.current < 5) return;
      nativeDirection.current = next;
      nativePending.current = 0;
    } else {
      nativePending.current = 0;
    }
    onScroll(next);
  }, [onScroll]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  return {readingChromeHidden: hidden, handleReadingScroll: onScroll, handleNativeReadingScroll};
};
