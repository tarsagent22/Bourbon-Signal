import React, { useMemo } from 'react';
import { BaseNavigationContainer, createNavigatorFactory, createNavigationContainerRef, useNavigationBuilder, useNavigation, useRoute, useFocusEffect, ThemeProvider } from 'expo-router/build/react-navigation/core/index';
import { StackRouter } from 'expo-router/build/react-navigation/routers/index';
import { Screen as ExpoScreen } from 'expo-router/build/views/Screen';
import Home from '../../app/(app)/(tabs)/index';
import { HomeHeaderActions } from '../../app/(app)/(tabs)/_layout';
import Check from '../../app/(app)/bottle-check';
export { useFocusEffect };
const ref = createNavigationContainerRef<any>();
const to = (input: any) => { const path = typeof input === 'string' ? input : input.pathname; return { name: path === '/(app)/bottle-check' ? 'bottle-check' : '(tabs)', params: typeof input === 'string' ? undefined : input.params }; };
export const router = { push(input: any) { ref.navigate(to(input)); }, back() { ref.goBack(); }, dismissTo(input: any) { ref.navigate(to(input)); }, setParams(params: any) { ref.setParams(params); }, replace(input: any) { ref.navigate(to(input)); }, canGoBack: () => ref.canGoBack() };
export function useRouter() { return router; }
export function useLocalSearchParams() { return useRoute().params || {}; }
function HomeRoute() { return <><HomeHeaderActions /><Home /></>; }
// Native chrome consumes descriptor options and can rerender page descendants.
// Model that host boundary while retaining Expo Screen and the real navigation core.
const ChromeOptionsContext = React.createContext<any>(null);
function CheckRoute() { React.use(ChromeOptionsContext); return <Check />; }
const components: any = { '(tabs)': HomeRoute, 'bottle-check': CheckRoute };
function NativeBoundaryNavigator(props: any) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, props);
  (window as any).navigationRenders = ((window as any).navigationRenders || 0) + 1;
  (window as any).currentNavigationOptions = descriptors[state.routes[state.index].key].options;
  return <NavigationContent><ChromeOptionsContext value={descriptors[state.routes[state.index].key].options}>{descriptors[state.routes[state.index].key].render()}</ChromeOptionsContext></NavigationContent>;
}
const factory = createNavigatorFactory(NativeBoundaryNavigator)();
export const Stack = Object.assign(function LayoutStack({ children, ...props }: any) {
  return <factory.Navigator {...props}>{React.Children.map(children, (child: any) => child?.props?.name ? <factory.Screen {...child.props} component={components[child.props.name] || (() => null)} /> : child)}</factory.Navigator>;
}, { Screen: ExpoScreen });
export const Tabs = { Screen: () => null };
const theme = { dark: true, colors: { primary: '#d99d4c', background: '#0b0a09', card: '#17130e', text: '#fff', border: '#332a21', notification: '#d99d4c' }, fonts: { regular: { fontFamily: 'sans-serif', fontWeight: '400' }, medium: { fontFamily: 'sans-serif', fontWeight: '500' }, bold: { fontFamily: 'sans-serif', fontWeight: '700' }, heavy: { fontFamily: 'sans-serif', fontWeight: '800' } } };
export function NavigationRoot({ children }: any) { return <ThemeProvider value={theme as any}><BaseNavigationContainer ref={ref}>{children}</BaseNavigationContainer></ThemeProvider>; }
