import { useAuth } from '@clerk/expo';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useMobileApi } from '../hooks/useMobileApi';
import { createActivityReporter } from './mobile-activity';

export function useMobileActivity() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const api = useMobileApi();
  useEffect(() => {
    const platform = Platform.OS;
    if (!isLoaded || !isSignedIn || !userId || !sessionId || (platform !== 'ios' && platform !== 'android')) return;
    const reporter = createActivityReporter(() => api.recordMobileActivity({ platform, appVersion: Constants.expoConfig?.version || '0', updateId: Updates.updateId || null }));
    const report = () => { if (AppState.currentState === 'active') void reporter.report(); };
    report();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void reporter.report(); });
    // The reporter throttles successful writes; a shorter tick allows retries
    // and avoids skipping a whole interval because the last request took time.
    const timer = setInterval(report, 60_000);
    return () => { reporter.stop(); listener.remove(); clearInterval(timer); };
  }, [api, isLoaded, isSignedIn, userId, sessionId]);
}
