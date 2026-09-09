import { useEffect, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import catalog from '../cellar/bottle-catalog-seed.json';
import { createPhotoRegistryCache, type PhotoMetadataStorage } from './cache';
import { photoIdentityConflicts, photoUrl, resolveBottlePhoto, type PhotoIdentity, type PhotoRegistry } from './registry';

// This lane has no AsyncStorage. Reuse its existing File API instead of adding a
// native dependency. The small getItem/setItem adapter also fits AsyncStorage in
// installed-compatible lanes. Public metadata only; never a member/account cache.
const storage: PhotoMetadataStorage = {
  async getItem(key) {
    const file = new File(Paths.document, `${key}.json`);
    return file.exists ? file.text() : null;
  },
  async setItem(key, value) {
    new File(Paths.document, `${key}.json`).write(value);
  },
};
const cache = createPhotoRegistryCache({ storage, fetcher: (url, options) => fetch(url, options) });

export function useBottlePhoto(identity: PhotoIdentity) {
  const [registry, setRegistry] = useState<PhotoRegistry>();
  useEffect(() => {
    let mounted = true;
    void cache.load().then(value => { if (mounted) setRegistry(value); });
    return () => { mounted = false; };
  }, []);
  const photo = resolveBottlePhoto(registry, identity, catalog);
  return { uri: photo && photoUrl(photo), blocked: photoIdentityConflicts(registry, identity, catalog) };
}
