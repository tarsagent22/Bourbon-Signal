import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, typography } from "../theme";
import type { NativeDiagnostic } from "../../../../shared/native-diagnostics";

type Tone = "good" | "watch" | "bad" | "neutral";
type Status = { label: string; tone: Tone };
const tones = {
  good: { ink: "#A6CDA7", fill: "#223226" },
  watch: { ink: "#F0BB7C", fill: "#38291C" },
  bad: { ink: "#F8A99B", fill: "#42261F" },
  neutral: { ink: "#CEC0AE", fill: "#302820" },
} as const;

const statuses: Record<string, Status> = {
  healthy: { label: "Healthy", tone: "good" },
  degraded: { label: "Degraded", tone: "watch" },
  stale: { label: "Delayed", tone: "watch" },
  stale_useful: { label: "Last known data", tone: "watch" },
  monitoring: { label: "Monitor only", tone: "neutral" },
  dry_run: { label: "Test run", tone: "watch" },
  wrong_deployment: { label: "Wrong release", tone: "bad" },
  blocked: { label: "Blocked", tone: "bad" },
  critical: { label: "Mismatch", tone: "bad" },
  failed: { label: "Failed", tone: "bad" },
};

type TimedCheck = {
  status?: string;
  ageMinutes?: number | null;
  staleAfterMinutes?: number;
};
type Health = {
  checkedAt?: string;
  engine?: TimedCheck & {
    generatedAt?: string | null;
    freshnessStage?: string | null;
    dataSource?: string | null;
  };
  cron?: TimedCheck & {
    lastRunAt?: string | null;
    expectedCadenceMinutes?: number;
    lastRunOk?: boolean | null;
  };
  release?: { status?: string; commit?: string | null };
  delivery?: {
    alertAudit?: {
      status?: string;
      windowStart?: string;
      deliveredRows?: number;
      uniqueRecipients?: number;
      repeatedUnderlyingBottleGroups?: number;
    };
  };
};
type StateHealth = {
  state: string;
  health?: string;
  lastPublicationAt?: string;
  customerVisibleDropCount?: number;
  collection?: { lastSuccessAt?: string | null };
  fallback?: { reason?: string | null };
  anomalyCodes?: string[];
  recoveryAction?: string;
};

export type Setup = {
  complete?: boolean;
  windowDays?: number;
  accounts: number;
  appOpened: number;
  areaSaved: number;
  watchlistSaved: number;
  alertMembers: number;
  setupComplete: number;
  missingArea: number;
  missingWatchlist: number;
  missingPush: number;
  eligibleForLaterActivity: number;
  activityAfter24Hours: number;
};

type Diagnostic = {
  metadata: NativeDiagnostic;
  occurrences: number;
  lastSeenAt: string;
};

const stages: Record<string, string> = {
  collector_delay: "Collection is behind",
  exporter_delay: "The feed export is behind",
  publisher_delay: "The snapshot upload is behind",
  activation_delay: "The snapshot hasn’t gone live",
  production_reader_delay: "Production hasn’t confirmed the snapshot",
};
const sourceNames: Record<string, string> = {
  "remote-snapshot": "Published snapshot",
  "local-export": "Bundled export",
  "cache-fallback": "Fallback export",
};

function statusFor(status?: string): Status {
  return (status && statuses[status]) || { label: "Unknown", tone: "neutral" };
}
function age(minutes?: number | null) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return Math.floor(minutes) + " min";
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const rest = Math.floor(minutes % 60);
    return hours + "h" + (rest ? " " + rest + "m" : "");
  }
  return Math.floor(minutes / 1440) + "d " + Math.floor((minutes % 1440) / 60) + "h";
}
function percent(value: number): `${number}%` {
  return `${value}%`;
}
function time(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}
function number(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "—";
}

function Pill({ status }: { status: Status }) {
  const palette = tones[status.tone];
  return (
    <View style={[s.pill, { backgroundColor: palette.fill }]}>
      <View style={[s.dot, { backgroundColor: palette.ink }]} />
      <Text style={[s.pillText, { color: palette.ink }]}>{status.label}</Text>
    </View>
  );
}

function Section({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text>
      {detail ? <Text style={s.copy}>{detail}</Text> : null}
    </View>
  );
}

function EmptyCard({ copy }: { copy: string }) {
  return <View style={s.panel}><Text style={s.copy}>{copy}</Text></View>;
}

export const monitoringTabs = ["Service health", "Member setup", "App errors"] as const;
export type MonitoringView = (typeof monitoringTabs)[number];

export function MonitoringTabs({ value, onChange }: { value: MonitoringView; onChange: (value: MonitoringView) => void }) {
  return (
    <View style={s.segments}>
      {monitoringTabs.map((tab) => {
        const selected = tab === value;
        return (
          <Pressable
            key={tab}
            accessibilityRole="button"
            aria-selected={selected}
            onPress={() => onChange(tab)}
            style={({ pressed }) => [s.segment, selected && s.segmentActive, pressed && s.pressed]}
          >
            <Text style={[s.segmentText, selected && { color: tones.watch.ink }]}>{tab}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MonitoringRefresh({ onPress, loading }: { onPress: () => void; loading: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [s.refresh, (pressed || loading) && s.pressed]}
    >
      <Text style={s.refreshText}>{loading ? "Refreshing…" : "↻  Refresh"}</Text>
    </Pressable>
  );
}

export function MonitoringLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Monitoring"
      accessibilityHint="View service health, member setup, and app errors"
      onPress={onPress}
      style={({ pressed }) => [s.hero, pressed && s.pressed]}
    >
      <View style={s.heroTop}>
        <Text style={s.kicker}>OPERATIONS</Text>
        <Text style={s.heroArrow} accessibilityElementsHidden importantForAccessibility="no">↗</Text>
      </View>
      <Text style={s.heroTitle}>Monitoring</Text>
      <Text style={s.copy}>Engine freshness, alerts, member setup, and app errors.</Text>
    </Pressable>
  );
}

function AgeCard({
  title, check, status, label,
}: {
  title: string;
  check?: TimedCheck;
  status: Status;
  label: string;
}) {
  const value = age(check?.ageMinutes);
  const threshold = check?.staleAfterMinutes;
  const ratio = value === "—" || !(threshold && threshold > 0)
    ? null : Math.min(1, (check?.ageMinutes ?? 0) / threshold);
  return (
    <View style={s.tile}>
      <Text style={s.label}>{title}</Text>
      <Pill status={status} />
      <View style={s.reading}>
        <Text style={s.measure}>{value}</Text>
        <Text style={s.copy}>{value === "—" ? "No reading" : label}</Text>
      </View>
      {ratio !== null && (
        <View style={s.rail} accessibilityElementsHidden importantForAccessibility="no">
          <View style={[s.fill, { width: percent(ratio * 100), backgroundColor: tones[status.tone].ink }]} />
        </View>
      )}
      {threshold ? <Text style={s.meta}>Late after {threshold} min</Text> : null}
    </View>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.keyValue}>
      <Text style={s.copy}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

export function ServiceMonitoring({ health, states }: { health?: Health | null; states?: StateHealth[] | null }) {
  if (!health) return <EmptyCard copy="Service health is unavailable." />;
  const engine = health.engine;
  const cron = health.cron;
  const engineStatus = !engine?.generatedAt && engine?.status === "stale"
    ? statusFor() : statusFor(engine?.status);
  const cronStatus: Status = cron?.lastRunOk === false && cron.status !== "wrong_deployment"
    ? statuses.failed
    : ["monitoring", "dry_run"].includes(cron?.status ?? "") && (cron?.ageMinutes == null ||
      (cron.staleAfterMinutes != null && cron.ageMinutes > cron.staleAfterMinutes))
      ? { label: "Heartbeat late", tone: "watch" } : statusFor(cron?.status);
  const releaseStatus = statusFor(health.release?.status);
  const checks = [engineStatus, cronStatus, releaseStatus];
  const flaggedState = states?.some((item) => item?.health && ["blocked", "degraded", "stale_useful"].includes(item.health));
  const headline = flaggedState || checks.some((check) => check.tone === "bad" || check.tone === "watch")
    ? { label: "Needs attention", tone: "watch" as const }
    : !states || checks.some((check) => check.label === "Unknown")
      ? { label: "Some checks unavailable", tone: "neutral" as const }
      : { label: "Checks current", tone: "good" as const };
  const audit = health.delivery?.alertAudit;
  const auditStart = audit?.windowStart;
  const heartbeatDay = cron?.lastRunAt && new Date(cron.lastRunAt);
  const sameAuditDay = auditStart && heartbeatDay && Number.isFinite(heartbeatDay.getTime())
    && heartbeatDay.toISOString().slice(0, 10) === auditStart.slice(0, 10);
  const stage = engine?.generatedAt && engine.freshnessStage ? stages[engine.freshnessStage] : null;
  const source = engine?.dataSource ? sourceNames[engine.dataSource] : null;
  return (
    <>
      <View style={s.hero}>
        <Text style={s.kicker}>LATEST SERVICE CHECK</Text>
        <Text accessibilityRole="header" style={s.heroTitle}>{headline.label}</Text>
        <Text style={[s.copy, { color: tones[headline.tone].ink }]}>
          {time(health.checkedAt) ? "Checked " + time(health.checkedAt) : "Check time unavailable"}
        </Text>
      </View>
      <View style={s.tiles}>
        <AgeCard title="Engine snapshot" check={engine} status={engineStatus} label="since collection" />
        <AgeCard title="Alert job" check={cron} status={cronStatus} label="since last run" />
      </View>
      {stage || source ? <Text style={s.copy}>{[stage, source].filter(Boolean).join(" · ")}</Text> : null}
      <View style={s.panel}>
        <View style={s.headingRow}>
          <Text style={s.label}>Server release</Text>
          <Pill status={releaseStatus} />
        </View>
        <Text style={s.copy}>{health.release?.commit ? "Revision " + health.release.commit.slice(0, 8) : "Revision unavailable"}</Text>
      </View>
      <StateMonitoring states={states} />
      <Section title="Alert queue audit" detail="Recorded sends and repeats from the latest job. Phone receipt isn’t measured." />
      {audit?.status === "ok" && sameAuditDay ? (
        <View style={s.panel}>
          <Text style={s.kicker}>{auditStart.slice(0, 10)} UTC</Text>
          <KeyValue label="Alerts marked delivered" value={number(audit.deliveredRows)} />
          <KeyValue label="Unique recipients" value={number(audit.uniqueRecipients)} />
          <KeyValue label="Repeat bottle and location groups" value={number(audit.repeatedUnderlyingBottleGroups)} />
        </View>
      ) : <EmptyCard copy="No queue audit is available for the latest run." />}
    </>
  );
}

const rank: Record<string, number> = { blocked: 0, failed: 0, degraded: 1, stale_useful: 2, healthy: 4 };

function StateMonitoring({ states }: { states?: StateHealth[] | null }) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [limit, setLimit] = useState(6);
  const all = Array.isArray(states) ? states.filter((item) => !!item?.state) : [];
  all.sort((a, b) => (rank[a.health ?? ""] ?? 3) - (rank[b.health ?? ""] ?? 3) || a.state.localeCompare(b.state));
  const healthy = all.filter((item) => item.health === "healthy").length;
  const knownIssues = all.filter((item) => (rank[item.health ?? ""] ?? 3) < 3).length;
  const unknown = all.length - healthy - knownIssues;
  const filtered = onlyIssues ? all.filter((item) => item.health !== "healthy") : all;
  return (
    <>
      <Section title="State coverage health" detail="States in the published health report. Open a state for collection and publication details." />
      {!all.length ? <EmptyCard copy={Array.isArray(states) ? "No states were reported." : "The state health report is unavailable."} /> : (
        <View style={s.panel}>
          <View style={s.coverageRail} accessibilityElementsHidden importantForAccessibility="no">
            {[[healthy, tones.good.ink], [knownIssues, tones.watch.ink], [unknown, tones.neutral.ink]].map(([count, color]) =>
              Number(count) > 0 && <View key={color} style={{ flex: Number(count), backgroundColor: String(color) }} />
            )}
          </View>
          <Text style={s.meta}>{healthy} healthy · {knownIssues} flagged{unknown ? " · " + unknown + " unknown" : ""}</Text>
          <View style={s.tiles}>
            <Toggle label={"All (" + all.length + ")"} selected={!onlyIssues} onPress={() => { setOnlyIssues(false); setLimit(6); }} />
            <Toggle label={"Review (" + (knownIssues + unknown) + ")"} selected={onlyIssues} onPress={() => { setOnlyIssues(true); setLimit(6); }} />
          </View>
          {!filtered.length ? <Text style={s.copy}>No states flagged for review.</Text> : null}
          {filtered.slice(0, limit).map((item) => {
            const open = expanded.has(item.state);
            return (
              <View key={item.state} style={s.stateRow}>
                <Pressable
                  accessibilityRole="button" aria-expanded={open}
                  onPress={() => setExpanded((previous) => {
                    const next = new Set(previous);
                    if (next.has(item.state)) next.delete(item.state); else next.add(item.state);
                    return next;
                  })}
                  style={({ pressed }) => [s.stateButton, pressed && s.pressed]}
                >
                  <Text style={s.label}>{item.state}</Text>
                  <Pill status={statusFor(item.health)} />
                  <Text style={s.arrow} accessibilityElementsHidden importantForAccessibility="no">{open ? "−" : "+"}</Text>
                </Pressable>
                {open ? (
                  <View style={s.stateDetail}>
                    <KeyValue label="Last successful collection" value={time(item.collection?.lastSuccessAt) ?? "Unknown"} />
                    <KeyValue label="Last publication" value={time(item.lastPublicationAt) ?? "Unknown"} />
                    <KeyValue label="Cards visible to members" value={number(item.customerVisibleDropCount)} />
                    {item.fallback?.reason ? <Text style={s.copy}>{item.fallback.reason}</Text> : null}
                    {item.anomalyCodes?.length ? <Text style={s.copy}>Flags: {item.anomalyCodes.join(", ").replaceAll("_", " ")}</Text> : null}
                    {item.recoveryAction && item.recoveryAction !== "none" ? (
                      <Text style={s.copy}>Suggested next step: {item.recoveryAction.replaceAll("_", " ")}.</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
          {filtered.length > limit ? <Toggle label={"Show more states (" + (filtered.length - limit) + " left)"} onPress={() => setLimit(limit + 8)} /> : null}
        </View>
      )}
    </>
  );
}

function Toggle({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={selected === undefined ? undefined : { selected }} onPress={onPress}
      style={({ pressed }) => [s.toggle, selected && s.selected, pressed && s.pressed]}>
      <Text style={[s.toggleText, selected && { color: tones.watch.ink }]}>{label}</Text>
    </Pressable>
  );
}

function Progress({ label, count, total }: { label: string; count: number; total: number }) {
  return (
    <View style={s.progress}>
      <KeyValue label={label} value={number(count) + " / " + number(total)} />
      {total > 0 ? (
        <View style={s.rail} accessibilityElementsHidden importantForAccessibility="no">
          <View style={[s.fill, { width: percent(100 * Math.max(0, Math.min(1, count / total))), backgroundColor: colors.accent }]} />
        </View>
      ) : null}
    </View>
  );
}

export function MemberSetupMonitoring({ setup }: { setup?: Setup | null }) {
  if (!setup) return <EmptyCard copy="Member setup counts are unavailable." />;
  const windowDays = setup.windowDays ?? 30;
  return (
    <>
      <View style={s.hero}>
        <Text style={s.kicker}>NEW MEMBER COHORT · {windowDays} DAYS</Text>
        <Text accessibilityRole="header" style={s.heroTitle}>{number(setup.accounts)} new accounts</Text>
        <Text style={s.copy}>{setup.complete === false
          ? "Partial cohort. Counts and ratios reflect the accounts that could be read."
          : "Accounts created in the last " + windowDays + " days."}</Text>
      </View>
      <Section title="Getting started" detail="Area and watchlist counts are measured among members who opened the app." />
      <View style={s.panel}>
        <Progress label="Opened the app" count={setup.appOpened} total={setup.accounts} />
        <Progress label="Saved an area" count={setup.areaSaved} total={setup.appOpened} />
        <Progress label="Picked bottles or notable finds" count={setup.watchlistSaved} total={setup.appOpened} />
        <Progress label="Finished alert setup" count={setup.setupComplete} total={setup.alertMembers} />
        <Text style={s.meta}>Alert setup is measured among app users with alert access. Push settings don’t confirm delivery.</Text>
      </View>
      <Section title="Where setup stops" detail="First missing step for app users with alert access." />
      <View style={s.panel}>
        <KeyValue label="Need an area" value={number(setup.missingArea)} />
        <KeyValue label="Need a watchlist" value={number(setup.missingWatchlist)} />
        <KeyValue label="Need phone alerts enabled" value={number(setup.missingPush)} />
      </View>
      <Section title="Later app activity" detail="Only accounts whose first recorded visit was at least 24 hours ago." />
      <View style={s.panel}>
        <Progress label="Active again after 24 hours" count={setup.activityAfter24Hours} total={setup.eligibleForLaterActivity} />
      </View>
    </>
  );
}

export function AppErrorMonitoring({ diagnostics }: { diagnostics?: Diagnostic[] | null }) {
  const [limit, setLimit] = useState(6);
  return (
    <>
      <Section title="App render errors" detail="Up to 100 recent error groups reported by signed-in devices in the last 30 days." />
      {!diagnostics?.length ? (
        <EmptyCard copy={diagnostics ? "No render errors were reported in this window." : "App diagnostics are unavailable."} />
      ) : (
        <View style={s.panel}>
          {diagnostics.slice(0, limit).map(({ metadata, occurrences, lastSeenAt }, i) => (
            <View key={metadata.fingerprint + ":" + i} style={s.diagnostic}>
              <View style={s.headingRow}>
                <Text style={s.label}>{metadata.platform === "ios" ? "iOS" : "Android"} · {metadata.errorKind}</Text>
                <Text style={s.value}>{number(occurrences)} recorded</Text>
              </View>
              <Text style={s.copy}>Build {metadata.build} · last seen {time(lastSeenAt) ?? "unknown"}</Text>
              <Text style={s.meta} selectable>Runtime {metadata.runtime} · update {metadata.update}</Text>
            </View>
          ))}
          {diagnostics.length > limit ? <Toggle label="Show more error groups" onPress={() => setLimit(limit + 8)} /> : null}
        </View>
      )}
      <Text style={s.meta}>These reports cover caught render errors. Other crashes and total sessions aren’t measured here.</Text>
    </>
  );
}

const s = StyleSheet.create({
  segments: { flexDirection: "row", gap: 3, padding: 4, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  segment: { flex: 1, minHeight: 44, borderRadius: 9, justifyContent: "center", paddingHorizontal: 4, paddingVertical: 5 },
  segmentActive: { backgroundColor: tones.watch.fill },
  segmentText: { fontSize: 12, lineHeight: 16, textAlign: "center", fontWeight: "700", color: colors.muted },
  refresh: { alignSelf: "flex-end", minHeight: 44, paddingHorizontal: 9, justifyContent: "center" },
  refreshText: { fontSize: 13, fontWeight: "700", color: tones.watch.ink },
  hero: {
    borderRadius: 18, borderWidth: 1, borderColor: "#654827", borderTopWidth: 2,
    backgroundColor: "#241A12", padding: 17, gap: 6,
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroTitle: { ...typography.section, fontSize: 25, lineHeight: 32, color: colors.text },
  heroArrow: { fontSize: 18, color: tones.watch.ink },
  kicker: { ...typography.eyebrow, color: tones.watch.ink },
  section: { gap: 4, paddingTop: 8 },
  sectionTitle: { ...typography.section, color: colors.text },
  headingRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" },
  panel: { padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexBasis: 132, flexGrow: 1, padding: 12, gap: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.text },
  copy: { fontSize: 13, lineHeight: 19, color: colors.muted },
  meta: { ...typography.caption, color: colors.muted },
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontSize: 11, lineHeight: 15, fontWeight: "700", flexShrink: 1 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  reading: { gap: 1 },
  measure: { color: colors.text, fontSize: 25, lineHeight: 31, fontWeight: "700", fontVariant: ["tabular-nums"] },
  rail: { height: 4, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  coverageRail: { height: 7, flexDirection: "row", gap: 2, borderRadius: 5, overflow: "hidden" },
  toggle: { minHeight: 44, paddingVertical: 9, paddingHorizontal: 12, justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: colors.border },
  selected: { backgroundColor: tones.watch.fill, borderColor: "#6B4A29" },
  toggleText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  keyValue: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", columnGap: 12, rowGap: 4 },
  value: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: "700", fontVariant: ["tabular-nums"] },
  progress: { gap: 6, paddingVertical: 4 },
  stateRow: { borderTopWidth: 1, borderTopColor: colors.border },
  stateButton: { minHeight: 48, paddingVertical: 8, flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" },
  arrow: { color: tones.watch.ink, fontSize: 16 },
  stateDetail: { gap: 8, paddingBottom: 12 },
  diagnostic: { gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  pressed: { opacity: 0.7 },
});

