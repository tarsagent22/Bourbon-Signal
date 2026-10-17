// Simulate only native camera events. Matching, temporal evidence and UI are actual source.
import { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import type { LabelFrame } from '../../src/scanner/live-label-session';
declare global { interface Window { scannerText?: string; scannerTexts?: string[]; scannerReads?: number; scannerMounts?: number; scannerScene?: number[]; scannerLastFrame?: LabelFrame; scannerStaleFrame?: LabelFrame; scannerDeliverFrame?: (frame: LabelFrame) => void } }
export function requireOptionalNativeModule(name: string) { return name === 'BottleLabelReader' ? { liveFramesVersion: 1 } : {}; }
export function useCameraPermissions() { return [{ granted: true }, async () => ({ granted: true })] as const; }
export function requireNativeView() { return FixtureCamera; }
function FixtureCamera({ style, active, scanning, onFrame, onStatus, scanToken }: any) {
  const current = useRef({ onFrame, onStatus, scanToken }); current.current = { onFrame, onStatus, scanToken };
  window.scannerDeliverFrame = frame => current.current.onFrame({ nativeEvent: frame });
  const sequence = useRef(0);
  useEffect(() => { window.scannerMounts = (window.scannerMounts || 0) + 1; }, []);
  useEffect(() => {
    if (!active || !scanning) return;
    const read = () => {
      window.scannerReads = (window.scannerReads || 0) + 1; sequence.current += 1;
      const text = window.scannerTexts?.length ? window.scannerTexts.shift()! : window.scannerText || '';
      const frame = {
        scanToken: current.current.scanToken, sequence: sequence.current, timestamp: Date.now(), processingMs: 40, width: 1080, height: 1440,
        scene: window.scannerScene || Array.from({ length: 36 }, (_, i) => 70 + i * 2),
        blocks: text ? text.split('\n').map((text, i) => ({ text, confidence: 0.95, x: 0.2, y: 0.28 + i * 0.065, width: 0.6, height: 0.05 })) : [],
      };
      window.scannerLastFrame = frame;
      current.current.onFrame({ nativeEvent: frame });
    };
    current.current.onStatus({ nativeEvent: { state: 'ready', scanToken: current.current.scanToken } });
    const initial = setTimeout(read, 80), interval = setInterval(read, 300);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [active, scanning]);
  return <View style={[style, { backgroundColor: '#39332B', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#D6CAB8', fontSize: 10 }}>SIMULATED LIVE CAMERA / OCR</Text></View>;
}
