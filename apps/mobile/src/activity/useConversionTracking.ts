import { useCallback } from 'react';
import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { ConversionContext, MobileConversionEvent } from '../../../../shared/mobile-conversion';
import { useMobileApi } from '../hooks/useMobileApi';

const storageKey = 'bourbonsignal.conversion.installation.v1';
let installation: Promise<string> | null = null;
let collection: { until: number; enabled: Promise<boolean> } | null = null;
function installationId() {
  installation ||= (async () => {
    const existing = await SecureStore.getItemAsync(storageKey);
    if (existing) return existing;
    const created = randomUUID();
    await SecureStore.setItemAsync(storageKey, created);
    return created;
  })().catch(error => { installation = null; throw error; });
  return installation;
}
export function useConversionTracking() {
  const api = useMobileApi();
  return useCallback((event: MobileConversionEvent, context: ConversionContext = {}) => {
    const platform = Platform.OS;
    if (platform !== 'android' && platform !== 'ios') return;
    if (!collection || collection.until <= Date.now()) {
      collection = { until: Date.now() + 60_000, enabled: api.getConversionConfig(platform).then(value => value.enabled).catch(() => false) };
    }
    void collection.enabled.then(async enabled => {
      if (enabled) await api.recordConversion({ ...context, event, installation: await installationId(), platform });
    }).catch(() => {});
  }, [api]);
}
