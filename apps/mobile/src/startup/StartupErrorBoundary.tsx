import { Component, Fragment, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

type State = { error: Error | null; resetKey: number };

export class StartupErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): State {
    return { error, resetKey: 0 };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Keep startup failures inside the app instead of handing an uncaught
    // render error to Expo Updates' launch rollback/crash pipeline.
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <View accessibilityRole="alert" style={styles.center}>
          <Text style={styles.eyebrow}>BOURBON SIGNAL</Text>
          <Text style={styles.title}>The app hit a startup error.</Text>
          <Text style={styles.message}>Try again. If the problem continues, the app will keep this recovery screen instead of closing.</Text>
          <Pressable accessibilityRole="button" onPress={() => this.setState(({ resetKey }) => ({ error: null, resetKey: resetKey + 1 }))} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return <>{this.state.resetKey ? <Fragment key={this.state.resetKey}>{this.props.children}</Fragment> : this.props.children}</>;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, gap: 14, padding: 28 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: colors.text, fontSize: 25, fontWeight: "900", textAlign: "center" },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: "center" },
  retry: { minHeight: 48, minWidth: 140, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.accent, paddingHorizontal: 18 },
  retryText: { color: colors.background, fontSize: 15, fontWeight: "900" },
});
