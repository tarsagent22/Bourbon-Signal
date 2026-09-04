import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useAccessibleStatus(message: string) {
  useEffect(() => {
    if (message.trim()) AccessibilityInfo.announceForAccessibility(message.slice(0, 240));
  }, [message]);
}
