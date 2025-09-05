// src/utils/usePersistedState.js
import { useState, useEffect } from 'react';

const usePersistedState = (key, defaultValue) => {
  const [state, setState] = useState(() => {
    // Retrieve stored value from localStorage
    const persistedState = localStorage.getItem(key);
    return persistedState ? JSON.parse(persistedState) : defaultValue;
  });

  useEffect(() => {
    // Save state to localStorage whenever it changes
    localStorage.setItem(key, JSON.stringify(state));
  }, [state, key]);

  return [state, setState];
};

export default usePersistedState;