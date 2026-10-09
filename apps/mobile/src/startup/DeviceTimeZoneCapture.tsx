import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@clerk/expo';
import { useMobileApi } from '../hooks/useMobileApi';
import { createDeviceTimeZoneSync } from './device-time-zone';

export function DeviceTimeZoneCapture() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const api = useMobileApi();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const sync = createDeviceTimeZoneSync(zone => api.saveDeviceTimeZone(zone));
    const refresh = () => { if (AppState.currentState === 'active') void sync.refresh(); };
    refresh();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(refresh, 15_000);
    return () => { sync.stop(); clearInterval(timer); listener.remove(); };
  }, [isLoaded, isSignedIn, userId, sessionId, api]);
  return null;
}
