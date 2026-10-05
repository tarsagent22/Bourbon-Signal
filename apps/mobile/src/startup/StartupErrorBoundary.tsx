import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Component, Fragment, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";
import { Pressable, Share, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, typeScale, fonts } from "../theme";

const STARTUP_DIAGNOSTIC_RELEASE = "startup-diag-stack-v1";
const MAX_DIAGNOSTIC_LENGTH = 2400;

type Props = PropsWithChildren<{ resetOn?: string }>;
type State = { error: Error | null; componentStack: string; resetKey: number; showDetails: boolean; shareError: string; identity?: string };

function bounded(value: string | undefined | null) {
  return value?.trim().slice(0, MAX_DIAGNOSTIC_LENGTH) || "Unavailable";
}

export class StartupErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: "", resetKey: 0, showDetails: false, shareError: "", identity: this.props.resetOn };

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetOn === state.identity) return null;
    // A failed member screen must not strand the next signed-out or signed-in
    // session. Clear only on identity change, preserving diagnostics otherwise.
    return { identity: props.resetOn, error: null, componentStack: "", showDetails: false, shareError: "" };
  }

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
      const diagnostics = `Bourbon Signal ${Constants.nativeAppVersion || Constants.expoConfig?.version || "unknown"} · Build ${Constants.nativeBuildVersion || "unknown"}\nRuntime ${Updates.runtimeVersion || "embedded"} · Update ${Updates.updateId || "embedded"}\n${STARTUP_DIAGNOSTIC_RELEASE}\n${detail}\n${javascriptStack}\n${componentStack}`;
      return (
        <View accessibilityRole="alert" style={styles.center}>
          <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
            <Text style={styles.eyebrow}>BOURBON SIGNAL</Text>
            <Text style={styles.title}>Let’s get you back in.</Text>
            <Text style={styles.message}>Something went wrong while opening this screen. Try again, or share diagnostics with support if it keeps happening.</Text>
            {this.state.showDetails ? <>
            <Text selectable style={styles.release}>{STARTUP_DIAGNOSTIC_RELEASE}</Text>
            <Text selectable style={styles.detail}>{detail}</Text>
            <Text style={styles.stackLabel}>JAVASCRIPT STACK</Text>
            <Text selectable style={styles.stack}>{javascriptStack}</Text>
            <Text style={styles.stackLabel}>REACT COMPONENT STACK</Text>
            <Text selectable style={styles.stack}>{componentStack}</Text>
            </> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => this.setState(({ resetKey }) => ({ error: null, componentStack: "", resetKey: resetKey + 1, showDetails: false, shareError: "" }))}
              style={styles.retry}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => { void Share.share({ message: diagnostics }).catch(() => this.setState({ shareError: "Sharing couldn’t open. View diagnostics and copy them instead.", showDetails: true })); }} style={styles.secondary}>
              <Text style={styles.secondaryText}>Share diagnostics</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: this.state.showDetails }} onPress={() => this.setState(state => ({ showDetails: !state.showDetails }))} style={styles.secondary}>
              <Text style={styles.secondaryText}>{this.state.showDetails ? "Hide diagnostics" : "View diagnostics"}</Text>
            </Pressable>
            {this.state.shareError ? <Text accessibilityRole="alert" style={styles.detail}>{this.state.shareError}</Text> : null}
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
  eyebrow: { color: colors.accent, fontSize: typeScale.caption, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: colors.text, fontSize: typeScale.title, fontFamily: fonts.heading, fontWeight: "900", textAlign: "center" },
  message: { color: colors.muted, fontSize: typeScale.body, lineHeight: 20, textAlign: "center", maxWidth: 340 },
  release: { color: colors.muted, fontSize: typeScale.caption, lineHeight: 15, textAlign: "center" },
  detail: { color: colors.danger, fontSize: typeScale.small, lineHeight: 18, textAlign: "center", maxWidth: 340 },
  stackLabel: { alignSelf: "stretch", color: colors.accent, fontSize: typeScale.micro, fontWeight: "900", letterSpacing: 1 },
  stack: { alignSelf: "stretch", color: colors.text, fontFamily: "Courier", fontSize: typeScale.micro, lineHeight: 13 },
  retry: { minHeight: 48, minWidth: 140, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.accent, paddingHorizontal: 18, marginTop: 4 },
  secondary: { minHeight: 44, justifyContent: "center", paddingHorizontal: 18 },
  secondaryText: { color: colors.accent, fontSize: typeScale.body, fontWeight: "700" },
  retryText: { color: colors.background, fontSize: typeScale.input, fontWeight: "900" },
});
