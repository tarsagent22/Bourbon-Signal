import React, { useMemo } from 'react';
import { BaseNavigationContainer, createNavigatorFactory, createNavigationContainerRef, useNavigationBuilder, useNavigation, useRoute, useFocusEffect, ThemeProvider } from 'expo-router/build/react-navigation/core/index';
import { StackActions, StackRouter } from 'expo-router/build/react-navigation/routers/index';
import { Screen as ExpoScreen } from 'expo-router/build/views/Screen';
import Home from '../../app/(app)/(tabs)/index';
import { HomeHeaderActions } from '../../app/(app)/(tabs)/_layout';
import Check from '../../app/(app)/bottle-check';
import ScanPost from '../../app/(app)/scan-post';
import ScanShelf from '../../app/(app)/scan-shelf';
import Post from '../../app/(app)/(tabs)/post';
import Shelf from '../../app/(app)/cellar/add';
export { useFocusEffect };
const ref = createNavigationContainerRef<any>();
const to = (input: any) => { const path = typeof input === 'string' ? input : input.pathname; const params = typeof input === 'string' ? {} : input.params || {}; return path === '/(app)/(tabs)/post' ? { name: '(tabs)', params: { ...params, tab: 'post' } } : { name: ['/bottle-check', '/scan-post', '/scan-shelf', '/cellar/add'].some(suffix => path.endsWith(suffix)) ? path.slice('/(app)/'.length) : '(tabs)', params }; };
export const router = { push(input: any) { ref.dispatch(StackActions.push(to(input).name, to(input).params)); }, back() { ref.goBack(); }, dismissTo(input: any) { const target = to(input); ref.dispatch(StackActions.popTo(target.name, target.params)); }, setParams(params: any) { ref.setParams(params); }, replace(input: any) { const target = to(input); ref.dispatch(StackActions.replace(target.name, target.params)); }, canGoBack: () => ref.canGoBack() };
(window as any).navigationPreview = { push: router.push };
export function useRouter() { return router; }
export function useLocalSearchParams() { return useRoute().params || {}; }
function HomeRoute() { return (useRoute().params as any)?.tab === 'post' ? <Post /> : <><HomeHeaderActions /><Home /></>; }
// Native chrome consumes descriptor options and can rerender page descendants.
// Model that host boundary while retaining Expo Screen and the real navigation core.
const ChromeOptionsContext = React.createContext<any>(null);
function CheckRoute() { React.use(ChromeOptionsContext); return <Check />; }
const components: any = { '(tabs)': HomeRoute, 'bottle-check': CheckRoute, 'scan-post': ScanPost, 'scan-shelf': ScanShelf, 'cellar/add': Shelf };
function NativeBoundaryNavigator(props: any) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, props);
  (window as any).navigationRenders = ((window as any).navigationRenders || 0) + 1;
  (window as any).currentNavigationOptions = descriptors[state.routes[state.index].key].options;
  (window as any).navigationRoutes = state.routes.map(route => route.name);
  // Native stacks keep the previous form mounted beneath a scanner modal.
  return <NavigationContent><ChromeOptionsContext value={descriptors[state.routes[state.index].key].options}>{state.routes.map((route, index) => <div key={route.key} aria-hidden={index !== state.index} style={{ display: index === state.index ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>{descriptors[route.key].render()}</div>)}</ChromeOptionsContext></NavigationContent>;
}
const factory = createNavigatorFactory(NativeBoundaryNavigator)();
export const Stack = Object.assign(function LayoutStack({ children, ...props }: any) {
  return <factory.Navigator {...props}>{React.Children.map(children, (child: any) => child?.props?.name ? <factory.Screen {...child.props} component={components[child.props.name] || (() => null)} /> : child)}</factory.Navigator>;
}, { Screen: ExpoScreen });
export const Tabs = { Screen: () => null };
const theme = { dark: true, colors: { primary: '#d99d4c', background: '#0b0a09', card: '#17130e', text: '#fff', border: '#332a21', notification: '#d99d4c' }, fonts: { regular: { fontFamily: 'sans-serif', fontWeight: '400' }, medium: { fontFamily: 'sans-serif', fontWeight: '500' }, bold: { fontFamily: 'sans-serif', fontWeight: '700' }, heavy: { fontFamily: 'sans-serif', fontWeight: '800' } } };
export function NavigationRoot({ children }: any) { const query = new URLSearchParams(location.search); const initialState = useMemo(() => ({ index: 0, routes: [{ name: query.get('screen') === 'shelf' ? 'cellar/add' : '(tabs)', params: query.get('screen') === 'post' ? { tab: 'post' } : {} }] }), []); return <ThemeProvider value={theme as any}><BaseNavigationContainer ref={ref} initialState={initialState}>{children}</BaseNavigationContainer></ThemeProvider>; }
