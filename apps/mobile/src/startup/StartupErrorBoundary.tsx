import { Component, Fragment, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

const STARTUP_DIAGNOSTIC_RELEASE = "startup-diag-stack-v1";
const MAX_DIAGNOSTIC_LENGTH = 2400;

type State = { error: Error | null; componentStack: string; resetKey: number };

function bounded(value: string | undefined | null) {
  return value?.trim().slice(0, MAX_DIAGNOSTIC_LENGTH) || "Unavailable";
}

export class StartupErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null, componentStack: "", resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Bourbon Signal] startup render error:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack || "" });
    // Keep startup failures inside the app instead of handing an uncaught
    // render error to Expo Updates' launch rollback/crash pipeline.
  }

  render(): ReactNode {
    if (this.state.error) {
      const error = this.state.error;
      const detail = bounded(`${error.name || "Error"}: ${error.message || "Unknown startup error."}`);
      const javascriptStack = bounded(error.stack);
      const componentStack = bounded(this.state.componentStack);
      return (
        <View accessibilityRole="alert" style={styles.center}>
          <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
            <Text style={styles.eyebrow}>BOURBON SIGNAL</Text>
            <Text style={styles.title}>The app hit a startup error.</Text>
            <Text style={styles.message}>This diagnostic identifies the exact component that failed so the next update can fix it.</Text>
            <Text selectable style={styles.release}>{STARTUP_DIAGNOSTIC_RELEASE}</Text>
            <Text selectable style={styles.detail}>{detail}</Text>
            <Text style={styles.stackLabel}>JAVASCRIPT STACK</Text>
            <Text selectable style={styles.stack}>{javascriptStack}</Text>
            <Text style={styles.stackLabel}>REACT COMPONENT STACK</Text>
            <Text selectable style={styles.stack}>{componentStack}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => this.setState(({ resetKey }) => ({ error: null, componentStack: "", resetKey: resetKey + 1 }))}
              style={styles.retry}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </ScrollView>
        </View>
      );
    }
    return <>{this.state.resetKey ? <Fragment key={this.state.resetKey}>{this.props.children}</Fragment> : this.props.children}</>;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingHorizontal: 24, paddingVertical: 36 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: colors.text, fontSize: 25, fontWeight: "900", textAlign: "center" },
  message: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 340 },
  release: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: "center" },
  detail: { color: colors.danger, fontSize: 12, lineHeight: 18, textAlign: "center", maxWidth: 340 },
  stackLabel: { alignSelf: "stretch", color: colors.accent, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  stack: { alignSelf: "stretch", color: colors.text, fontFamily: "Courier", fontSize: 9, lineHeight: 13 },
  retry: { minHeight: 48, minWidth: 140, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.accent, paddingHorizontal: 18, marginTop: 4 },
  retryText: { color: colors.background, fontSize: 15, fontWeight: "900" },
});
