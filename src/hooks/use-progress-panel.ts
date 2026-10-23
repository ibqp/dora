"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "dora.progressPanel";
const CHANGE_EVENT = "dora:progress-panel";
const WIDE_SCREEN = "(min-width: 1280px)";

type Preference = "open" | "closed";

/** Used when localStorage is unavailable (e.g. blocked storage), so toggling still works. */
let memoryPreference: Preference | null = null;

function readPreference(): Preference | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "open" || value === "closed") return value;
  } catch {
    // Fall back to the in-memory preference.
  }
  return memoryPreference;
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(WIDE_SCREEN);
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): boolean {
  const preference = readPreference();
  return preference ? preference === "open" : window.matchMedia(WIDE_SCREEN).matches;
}

/**
 * Whether the progress panel is shown. Defaults to open on wide screens; an explicit toggle is
 * remembered in localStorage (a per-browser convenience only, never application data).
 */
export function useProgressPanel() {
  const open = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const toggle = useCallback(() => {
    const next: Preference = getSnapshot() ? "closed" : "open";
    memoryPreference = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the in-memory preference applies for this page view.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return { open, toggle };
}
