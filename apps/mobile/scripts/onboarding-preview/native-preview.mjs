export * from 'react-native-web';
import { Keyboard as WebKeyboard } from 'react-native-web';
export const Keyboard = {
  ...WebKeyboard,
  dismiss() { window.dispatchEvent(new CustomEvent('preview-keyboard', { detail: false })); },
  addListener(name, callback) {
    const listener = event => { if ((name === 'keyboardDidShow') === Boolean(event.detail)) callback(); };
    window.addEventListener('preview-keyboard', listener);
    return { remove() { window.removeEventListener('preview-keyboard', listener); } };
  },
};
