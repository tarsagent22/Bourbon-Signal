import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';

// Keep changing loader closures (pagination/cursor state) out of focus dependencies.
export function useScreenRevalidation(load: () => void | Promise<unknown>) {
  const latest = useRef(load);
  latest.current = load;
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    void latest.current();
    return () => { focused.current = false; };
  }, []));
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && previous !== 'active' && focused.current) void latest.current();
      previous = state;
    });
    return () => subscription.remove();
  }, []);
}
