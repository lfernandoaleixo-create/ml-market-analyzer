import { useState, useCallback } from "react";

const STORAGE_KEY = "project_guest_name";

export function useGuestName() {
  const [guestName, setGuestNameState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const setGuestName = useCallback((name: string) => {
    const trimmed = name.trim();
    setGuestNameState(trimmed);
    try {
      if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, []);

  const clearGuestName = useCallback(() => {
    setGuestNameState("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { guestName, setGuestName, clearGuestName };
}
