export * from 'react-native-web';
export { Alert } from '../cohesion-preview/native.jsx';

import { Platform as WebPlatform } from 'react-native-web';
const previewPlatform = new URLSearchParams(location.search).get('platform') || 'web';
export const Platform = { ...WebPlatform, OS: previewPlatform, select: values => values[previewPlatform] ?? values.default };
