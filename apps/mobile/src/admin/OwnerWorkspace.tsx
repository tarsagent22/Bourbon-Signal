import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as Crypto from "expo-crypto";

import { useMobileApi } from "../hooks/useMobileApi";

import { Action, workspaceStyles as s } from "../components/WorkspaceUI";

import { LoadingState } from "../components/MemberScreen";

import { rewardNextStates } from "../../../../shared/owner-workspace";

import {
  coverageStatusLabels,
  type CoverageStatus,
} from "../../../../shared/coverage-requests";

type Row = Record<string, any>;

type Api = ReturnType<typeof useMobileApi>;

type Part = Parameters<Api["getAdminData"]>[0];

type Write = Parameters<Api["saveAdminReview"]>[0];

const destinations = [
  "Inbox",
  "Feedback",
  "Community",
  "Bottle Library",
  "Members",
  "Rewards & Shipping",
  "Coverage & Operations",
] as const;

type Destination = (typeof destinations)[number];

export const ownerStyles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  title: { ...s.title, fontSize: 28, lineHeight: 34 },
  nav: { gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#44352a",
  },
  active: { backgroundColor: "#382211", borderColor: "#ed7b25" },
  tabText: { color: "#c8b9a5", fontWeight: "700", fontSize: 14 },
  activeText: { color: "#ffae6b" },
  body: { padding: 16, paddingBottom: 64, gap: 14 },
  small: { ...s.copy, fontSize: 13, lineHeight: 19 },
  error: { ...s.copy, color: "#ffb5a0" },
  notice: { ...s.copy, color: "#b9dbb9" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mini: { color: "#c8b9a5", fontSize: 12 },
  divider: { height: 1, backgroundColor: "#352c24" },
  badge: { color: "#ffae6b", fontSize: 13, fontWeight: "700" },
  metric: { flex: 1, minWidth: 140 },
  choice: {
    borderWidth: 1,
    borderColor: "#44352a",
    padding: 12,
    borderRadius: 10,
    gap: 5,
  },
  confirm: {
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "#ae673a",
    borderRadius: 12,
    backgroundColor: "#25170f",
  },
  photo: { width: "100%", height: 230, borderRadius: 12 },
  empty: {
    padding: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: "#352c24",
    borderRadius: 14,
  },
  history: {
    paddingTop: 10,
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: "#352c24",
  },
});

const ui = ownerStyles;
const AdminRevoke = createContext<() => void>(() => {});

function human(value: unknown) {
  const text = String(value ?? "");
  return (
    (
      {
        "bottled-in-bond": "Founder",
        barrel: "Barrel Proof",
        standard: "Standard",
        free: "Free",
      } as Record<string, string>
    )[text] || text.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")
  );
}

function date(value: unknown) {
  if (!value) return "Unknown";
  const d = new Date(value as string);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(value);
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
  keyboardType = "default",
}: {
  label: string;
  value: unknown;
  onChange: (text: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={ui.mini}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={String(value ?? "")}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={multiline ? 1000 : 220}
        placeholderTextColor="#a99e8e"
      />
    </View>
  );
}

function Tabs({
  choices,
  value,
  onChange,
  disabled = false,
}: {
  disabled?: boolean;
  choices: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={ui.row}>
      {choices.map((v) => (
        <Pressable
          key={v}
          accessibilityRole="button"
          accessibilityState={{ selected: v === value, disabled }}
          disabled={disabled}
          onPress={() => onChange(v)}
          style={[ui.tab, v === value && ui.active]}
        >
          <Text style={[ui.tabText, v === value && ui.activeText]}>
            {human(v)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Search({
  label,
  onSearch,
}: {
  label: string;
  onSearch: (q: string) => void;
}) {
  const [q, setQ] = useState("");
  return (
    <View style={{ gap: 8 }}>
      <TextInput
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor="#a99e8e"
        style={s.input}
        value={q}
        onChangeText={setQ}
        returnKeyType="search"
        onSubmitEditing={() => onSearch(q.trim())}
      />
      <Action label="Search" onPress={() => onSearch(q.trim())} />
    </View>
  );
}

function Empty({ title, copy }: { title: string; copy: string }) {
  return (
    <View style={ui.empty}>
      <Text style={s.label}>{title}</Text>
      <Text style={ui.small}>{copy}</Text>
    </View>
  );
}

function Confirm({
  label,
  explanation,
  onApply,
  busy = false,
}: {
  label: string;
  explanation: string;
  onApply: () => Promise<unknown>;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return open ? (
    <View style={ui.confirm}>
      <Text style={s.label}>{label}</Text>
      <Text style={ui.small}>{explanation}</Text>
      <Action
        label={busy ? "Saving…" : `Confirm: ${label}`}
        disabled={busy}
        onPress={() => {
          void onApply()
            .then(() => setOpen(false))
            .catch(() => {});
        }}
      />
      <Action
        label="Keep current record"
        disabled={busy}
        onPress={() => setOpen(false)}
      />
    </View>
  ) : (
    <Action label={label} disabled={busy} onPress={() => setOpen(true)} />
  );
}

function useData(api: Api, part: Part, query = "") {
  const revoke = useContext(AdminRevoke);

  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const next = await api.getAdminData<Row>(part, query);
      if (ticket === seq.current) setData(next);
    } catch (e) {
      if (ticket === seq.current) {
        setData(null);
        setError(e instanceof Error ? e.message : "Could not load.");
        if ([401, 403].includes((e as { status?: number }).status || 0))
          revoke();
      }
    } finally {
      if (ticket === seq.current) setLoading(false);
    }
  }, [api, part, query, revoke]);

  useEffect(() => {
    setData(null);
    void load();
    return () => {
      seq.current++;
    };
  }, [load]);

  return { data, loading, error, load };
}

function Status({ state }: { state: ReturnType<typeof useData> }) {
  return (
    <>
      {state.loading ? <Text style={ui.small}>Refreshing…</Text> : null}
      {state.error ? (
        <View style={{ gap: 8 }}>
          <Text style={ui.error}>{state.error}</Text>
          <Action label="Retry" onPress={() => void state.load()} />
        </View>
      ) : null}
    </>
  );
}

function useSave(api: Api, refresh: () => Promise<unknown>) {
  const revoke = useContext(AdminRevoke);

  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);

  async function run(part: Write | "pricing", body: Row, message = "Saved.") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result: Row =
        part === "pricing"
          ? await api.saveAdminPrice(body)
          : body.sendShipmentEmail
            ? await api.sendAdminShipmentEmail(body)
            : await api.saveAdminReview(part, body);
      setNotice(message);
      await refresh();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      if ([401, 403].includes((e as { status?: number }).status || 0)) revoke();
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return { busy, error, notice, run };
}

function Saved({ save }: { save: ReturnType<typeof useSave> }) {
  return (
    <>
      {save.error ? <Text style={ui.error}>{save.error}</Text> : null}
      {save.notice ? <Text style={ui.notice}>{save.notice}</Text> : null}
    </>
  );
}

function Paged({
  data,
  offset,
  onPage,
}: {
  data: Row | null;
  offset: number;
  onPage: (n: number) => void;
}) {
  return (
    <View style={ui.row}>
      {offset > 0 ? (
        <Action
          label="Previous page"
          onPress={() =>
            onPage(Math.max(0, offset - (data?.sightings ? 25 : 40)))
          }
        />
      ) : null}
      {data?.nextOffset != null ? (
        <Action label="Next page" onPress={() => onPage(data.nextOffset)} />
      ) : null}
      <Text style={ui.small}>
        {data ? `${data.total} matching records` : ""}
      </Text>
    </View>
  );
}

function History({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map((r) => (
        <View key={r.id || `${r.action}-${r.created_at}`} style={ui.history}>
          <Text style={ui.badge}>{human(r.action)}</Text>
          <Text style={ui.small}>
            {r.details?.reason || r.details?.reviewNote || ""}
          </Text>
          <Text style={ui.mini}>
            {date(r.created_at)}
            {r.details?.points
              ? ` · ${r.details.points > 0 ? "+" : ""}${r.details.points} points`
              : ""}
          </Text>
        </View>
      ))}
    </>
  );
}

export default function OwnerWorkspace() {
  const api = useMobileApi(),
    [access, setAccess] = useState<{ api: Api; allowed: boolean } | null>(null),
    [section, setSection] = useState<Destination>("Inbox"),
    [member, setMember] = useState<string | null>(null),
    [communityUser, setCommunityUser] = useState<string | null>(null),
    [rewardUser, setRewardUser] = useState<string | null>(null);
  const navRef = useRef<ScrollView>(null),
    navPositions = useRef<Record<string, number>>({});
  useEffect(() => {
    navRef.current?.scrollTo({
      x: Math.max(0, (navPositions.current[section] || 0) - 16),
      animated: true,
    });
  }, [section, access]);

  const revoke = useCallback(() => setAccess({ api, allowed: false }), [api]);
  useEffect(() => {
    let live = true;
    setAccess(null);
    setMember(null);
    api
      .getAdminAccess()
      .then((r) => {
        if (live) setAccess({ api, allowed: r.allowed });
      })
      .catch(() => {
        if (live) setAccess({ api, allowed: false });
      });
    return () => {
      live = false;
    };
  }, [api]);

  if (!access || access.api !== api)
    return <LoadingState label="Checking admin access…" />;

  if (!access.allowed)
    return (
      <View style={s.content}>
        <Text style={s.heading}>Admin access unavailable</Text>
        <Text style={s.copy}>
          This workspace is restricted to the owner account.
        </Text>
      </View>
    );

  const openMember = (id: string) => {
    setMember(id);
    setSection("Members");
  };

  return (
    <AdminRevoke.Provider value={revoke}>
      <View style={s.screen}>
        <View style={ui.top}>
          <Text style={ui.title}>Admin workspace</Text>
          <Text style={ui.small}>
            Find records, make corrections and manage fulfillment.
          </Text>
        </View>
        <ScrollView
          ref={navRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0, height: 62 }}
          contentContainerStyle={ui.nav}
        >
          {destinations.map((v) => (
            <Pressable
              key={v}
              onLayout={(event) => {
                navPositions.current[v] = event.nativeEvent.layout.x;
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: section === v }}
              onPress={() => {
                setSection(v);
                if (v !== "Members") setMember(null);
              }}
              style={[ui.tab, section === v && ui.active]}
            >
              <Text style={[ui.tabText, section === v && ui.activeText]}>
                {v}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView
          key={`${section}-${member || ""}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={ui.body}
        >
          {section === "Inbox" ? (
            <Inbox api={api} onOpen={setSection} />
          ) : section === "Feedback" ? (
            <Feedback api={api} onMember={openMember}/>
          ) : section === "Community" ? (
            <Community
              api={api}
              onMember={openMember}
              userId={communityUser}
              onClear={() => setCommunityUser(null)}
            />
          ) : section === "Bottle Library" ? (
            <Bottles api={api} />
          ) : section === "Members" ? (
            <Members
              api={api}
              selected={member}
              onSelect={setMember}
              onCommunity={() => {
                setCommunityUser(member);
                setSection("Community");
              }}
              onRewards={() => {
                setRewardUser(member);
                setSection("Rewards & Shipping");
              }}
            />
          ) : section === "Rewards & Shipping" ? (
            <Rewards
              api={api}
              onMember={openMember}
              userId={rewardUser}
              onClear={() => setRewardUser(null)}
            />
          ) : (
            <CoverageOperations api={api} />
          )}
        </ScrollView>
      </View>
    </AdminRevoke.Provider>
  );
}

function Inbox({
  api,
  onOpen,
}: {
  api: Api;
  onOpen: (s: Destination) => void;
}) {
  const state = useData(api, "overview");
  const rows: [string, string, Destination][] = [
    ["feedback", "New member feedback", "Feedback"],
    ["coverage", "Coverage requests", "Coverage & Operations"],
    ["community", "Posts needing review", "Community"],
    ["bottles", "Missing bottle submissions", "Bottle Library"],
    ["rewards", "Open reward redemptions", "Rewards & Shipping"],
    ["founderShipping", "Founder shipments", "Rewards & Shipping"],
  ];

  return (
    <>
      <Text style={s.heading}>Needs attention</Text>
      <Status state={state} />
      <View style={ui.row}>
        {rows.map(([key, label, section]) => (
          <View key={key} style={[s.card, ui.metric]}>
            <Text style={s.heading}>{state.data?.[key] ?? "—"}</Text>
            <Text style={ui.small}>{label}</Text>
            <Action label="Open" onPress={() => onOpen(section)} />
          </View>
        ))}
      </View>
      {state.data?.unavailable.length ? (
        <Text style={ui.error}>
          Some queues are unavailable. A dash means they could not refresh.
        </Text>
      ) : null}
      <Text style={s.heading}>Find and manage</Text>
      <Action
        label="Search the bottle library"
        onPress={() => onOpen("Bottle Library")}
      />
      <Action label="Find a member" onPress={() => onOpen("Members")} />
      <Action
        label="Open community controls"
        onPress={() => onOpen("Community")}
      />
      <Action
        label="Pricing, service health and change history"
        onPress={() => onOpen("Coverage & Operations")}
      />
      <Text style={ui.mini}>Checked {date(state.data?.checkedAt)}</Text>
      <Action label="Refresh inbox" onPress={() => void state.load()} />
    </>
  );
}

function BottlePicker({
  api,
  onChoose,
  chosen,
}: {
  api: Api;
  onChoose: (b: Row) => void;
  chosen?: Row | null;
}) {
  const [query, setQuery] = useState("");
  const state = useData(api, "catalog", `?q=${encodeURIComponent(query)}`);

  return (
    <View style={{ gap: 10 }}>
      <Text style={s.label}>Choose the exact library bottle</Text>
      {chosen ? (
        <Text style={ui.badge}>Selected: {chosen.canonicalName}</Text>
      ) : null}
      <Search label="Search bottle name, brand or alias" onSearch={setQuery} />
      <Status state={state} />
      {state.data?.bottles.slice(0, 8).map((b: Row) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Select ${b.canonicalName}`}
          key={b.id}
          onPress={() => onChoose(b)}
          style={ui.choice}
        >
          <Text style={s.label}>{b.canonicalName}</Text>
          <Text style={ui.small}>
            {b.brand} · {human(b.category)}
            {b.proof ? ` · ${b.proof} proof` : ""}
            {b.ageStatement ? ` · ${b.ageStatement}` : ""}
          </Text>
        </Pressable>
      ))}
      {state.data?.bottles.length === 0 ? (
        <Text style={ui.small}>
          No match. Create the exact entry in Bottle Library, then select it
          here.
        </Text>
      ) : null}
    </View>
  );
}

function Community({
  api,
  onMember,
  userId,
  onClear,
}: {
  api: Api;
  onMember: (id: string) => void;
  userId: string | null;
  onClear: () => void;
}) {
  const [view, setView] = useState(userId ? "All posts" : "Needs review"),
    [q, setQ] = useState(""),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<Row | null>(null);

  const state = useData(
    api,
    "posts",
    `?view=${view === "All posts" ? "all" : view === "Removed / rejected" ? "hidden" : "review"}&q=${encodeURIComponent(q)}&offset=${offset}&userId=${encodeURIComponent(userId || "")}`,
  );

  return (
    <>
      {userId ? (
        <Action
          label="Showing this member’s posts · Show all members"
          onPress={onClear}
        />
      ) : null}
      <Text style={s.heading}>Community posts</Text>
      <Tabs
        choices={["Needs review", "All posts", "Removed / rejected"]}
        value={view}
        onChange={(v) => {
          setView(v);
          setOffset(0);
          setSelected(null);
        }}
      />
      <Search
        label="Bottle, store, city, contributor or post ID"
        onSearch={(v) => {
          setQ(v);
          setOffset(0);
          setSelected(null);
        }}
      />
      <Status state={state} />
      {selected ? (
        <PostEditor
          key={JSON.stringify(selected.expected)}
          api={api}
          row={selected}
          onMember={onMember}
          onClose={() => setSelected(null)}
          onRefresh={async () => {
            setSelected(null);
            await state.load();
          }}
        />
      ) : (
        state.data?.sightings.map((r: Row) => (
          <View key={r.id} style={s.card}>
            <Text style={s.heading}>{r.bottleName}</Text>
            <Text style={ui.small}>
              {r.storeName} · {r.storeCity}, {r.storeState}
            </Text>
            <Text style={ui.small}>
              {r.reporterName} · {date(r.createdAt)}
            </Text>
            <Text style={ui.badge}>
              {r.rewardState?.removedAt || r.rewardState?.rejectedAt
                ? "Removed / rejected"
                : r.needsReview
                  ? "Needs review"
                  : "Live post"}
            </Text>
            <Action
              label="Open post and controls"
              onPress={() => setSelected(r)}
            />
          </View>
        ))
      )}
      {state.data?.sightings.length === 0 ? (
        <Empty
          title={
            view === "Needs review"
              ? "No posts waiting for review"
              : "No matching posts"
          }
          copy="Use All posts to find and correct existing community sightings."
        />
      ) : null}
      <Paged
        data={state.data}
        offset={offset}
        onPage={(n) => {
          setOffset(n);
          setSelected(null);
        }}
      />
      <Action
        label="Refresh posts"
        onPress={() => {
          setSelected(null);
          void state.load();
        }}
      />
    </>
  );
}

function PostEditor({
  api,
  row,
  onMember,
  onClose,
  onRefresh,
}: {
  api: Api;
  row: Row;
  onMember: (id: string) => void;
  onClose: () => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false),
    [changes, setChanges] = useState<Row>({ ...row }),
    [bottle, setBottle] = useState<Row | null>(
      row.bottleId && !row.reviewState?.needsBottleReview
        ? { id: row.bottleId, canonicalName: row.bottleName }
        : null,
    ),
    [reason, setReason] = useState(""),
    [photoLoaded, setPhotoLoaded] = useState(false),[photoFailed,setPhotoFailed]=useState(false);
  const save = useSave(api, onRefresh);
  const proof = row.rewardState?.photoProof;

  const act = (action: string) =>
    save.run(
      "posts",
      {
        id: row.id,
        expected: row.expected,
        action,
        reason,
        changes: { ...changes, bottleId: bottle?.id },
      },
      "Post updated; reward accounting refreshed.",
    );

  const photo = (action: string) =>
    save.run(
      "sightings",
      {
        sightingId: row.id,
        reporterUserId: row.reporterUserId,
        action,
        reason,
        expectedPhotoUrl: proof?.url,
        expected: row.expected,
      },
      "Photo review saved.",
    );

  return (
    <View style={s.card}>
      <Action label="Back to posts" onPress={onClose} />
      <Text style={s.heading}>{row.bottleName}</Text>
      <Text style={ui.small}>
        {row.storeName} · {row.storeAddress} · {row.storeCity}, {row.storeState}
      </Text>
      <Text style={ui.small}>
        {row.price != null ? `$${row.price} · ` : ""}
        {row.quantityEstimate || ""}
      </Text>
      {row.notes ? <Text style={ui.small}>{row.notes}</Text> : null}
      <Text style={ui.small}>
        {row.reviewReasons?.join(" · ") ||
          "No unresolved bottle or store review."}
      </Text>
      <Text selectable style={ui.mini}>
        Post ID: {row.id} · {date(row.createdAt)}
      </Text>
      {row.reporterUserId ? (
        <Action
          label="Open contributor’s member record"
          onPress={() => onMember(row.reporterUserId)}
        />
      ) : null}

      {proof?.url?.startsWith("https://") ? (
        <>
          <Image
            source={{ uri: proof.url }}
            accessibilityLabel="Post photo evidence"
            style={ui.photo}
            resizeMode="contain"
            onLoad={() => {setPhotoLoaded(true);setPhotoFailed(false);}}
            onError={() => {setPhotoLoaded(false);setPhotoFailed(true);}}
          />
          <Text style={ui.small}>
            Photo: {human(proof.status || "pending")}
            {photoFailed?" · Photo could not load. Reopen the post to retry.":!photoLoaded ? " · Waiting for photo to load" : ""}
          </Text>
        </>
      ) : null}

      <TextField
        label="Review reason (photo rejection reason is member-visible)"
        value={reason}
        onChange={setReason}
        multiline
      />
      <Saved save={save} />
      <Action
        label={
          editing
            ? "Close correction editor"
            : "Correct bottle, store and post details"
        }
        onPress={() => setEditing(!editing)}
      />

      {editing ? (
        <>
          <BottlePicker api={api} chosen={bottle} onChoose={setBottle} />
          {[
            ["storeName", "Store name"],
            ["storeAddress", "Street address"],
            ["storeCity", "City"],
            ["storeState", "State code"],
            ["storeZip", "ZIP"],
            ["price", "Shelf price"],
            ["quantityEstimate", "Quantity"],
            ["notes", "Post notes"],
          ].map(([key, label]) => (
            <TextField
              key={key}
              label={label}
              value={changes[key]}
              multiline={key === "notes"}
              onChange={(v) => setChanges({ ...changes, [key]: v })}
            />
          ))}
          <Text style={ui.small}>
            Saving replaces the post’s bottle/store mapping. Member notes and
            the original post date stay attached.
          </Text>
          <Confirm
            label="Save post corrections"
            explanation="The corrected details appear on the community post. Points are recalculated from the corrected evidence."
            busy={save.busy || !bottle || reason.trim().length < 3}
            onApply={() => act("correct")}
          />
        </>
      ) : null}

      {proof && photoLoaded ? (
        <>
          <Confirm
            label="Approve photo for public display"
            explanation="This publishes the photo and verifies its evidence. It does not create a bottle entry."
            busy={save.busy || reason.trim().length < 3}
            onApply={() => photo("verify_public")}
          />
          <Confirm
            label="Approve evidence; keep photo private"
            explanation="The photo remains private while its evidence is verified."
            busy={save.busy || reason.trim().length < 3}
            onApply={() => photo("verify_private")}
          />
        </>
      ) : null}

      {proof?<Confirm label="Reject photo evidence" explanation="Photo verification is removed and related rewards are recalculated." busy={save.busy||reason.trim().length<3} onApply={()=>photo('reject_photo')}/>:null}
      {row.rewardState?.removedAt || row.rewardState?.rejectedAt ? (
        <Confirm
          label="Restore post"
          explanation="The post returns to its normal visibility rules. Pending photo and catalog reviews still apply."
          busy={save.busy || reason.trim().length < 3}
          onApply={() => act("restore")}
        />
      ) : (
        <Confirm
          label="Remove post"
          explanation="Removes this sighting from public results and recalculates its rewards. The record remains available here for review and restoration."
          busy={save.busy || reason.trim().length < 3}
          onApply={() => act("remove")}
        />
      )}
    </View>
  );
}

function Bottles({ api }: { api: Api }) {
  const [view, setView] = useState("Library"),
    [q, setQ] = useState(""),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<Row | null>(null);

  const state = useData(
    api,
    "catalog",
    `?q=${encodeURIComponent(q)}&offset=${offset}`,
  );

  return (
    <>
      <Text style={s.heading}>Bottle Library</Text>
      <Tabs
        choices={["Library", "Missing bottles", "Submission history"]}
        value={view}
        onChange={(v) => {
          setView(v);
          setSelected(null);
        }}
      />
      {view === "Library" ? (
        <>
          <Search
            label="Bottle name, brand or alias"
            onSearch={(v) => {
              setQ(v);
              setOffset(0);
              setSelected(null);
            }}
          />
          <Action
            label="Create a library entry"
            onPress={() =>
              setSelected({
                version: 0,
                canonicalName: "",
                brand: "",
                category: "bourbon",
                availability: "common",
                aliases: [],
              })
            }
          />
          <Status state={state} />
          {selected ? (
            <BottleEditor
              key={selected.id || "new"}
              api={api}
              row={selected}
              onClose={() => setSelected(null)}
              onSaved={async () => {
                setSelected(null);
                await state.load();
              }}
            />
          ) : (
            state.data?.bottles.map((b: Row) => (
              <View key={b.id} style={s.card}>
                <Text style={s.label}>{b.canonicalName}</Text>
                <Text style={ui.small}>
                  {b.brand} · {human(b.category)} · {human(b.availability)}
                  {b.proof ? ` · ${b.proof} proof` : ""}
                </Text>
                <Action
                  label="Edit bottle entry"
                  onPress={() => setSelected(b)}
                />
              </View>
            ))
          )}
          <Paged data={state.data} offset={offset} onPage={setOffset} />
        </>
      ) : (
        <Submissions api={api} history={view === "Submission history"} />
      )}
    </>
  );
}

function BottleEditor({
  api,
  row,
  onClose,
  onSaved,
}: {
  api: Api;
  row: Row;
  onClose: () => void;
  onSaved: (b?: Row) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<Row>({ ...row }),
    [reason, setReason] = useState(""),
    [merging, setMerging] = useState(false),
    [target, setTarget] = useState<Row | null>(null);
  const save = useSave(api, async () => {});

  const patch = (key: string, v: unknown) => setDraft({ ...draft, [key]: v });

  async function apply(merge = false) {
    const result = await save.run(
      "catalog",
      {
        id: row.id,
        version: row.version || 0,
        bottle: { ...draft, proof: draft.proof === "" ? null : draft.proof },
        reason,
        ...(merge
          ? { redirectId: target?.id, targetVersion: target?.version }
          : {}),
      },
      "Library entry saved.",
    );
    if (result) await onSaved(result.bottle as Row);
  }

  return (
    <View style={s.card}>
      <Action label="Back to library" onPress={onClose} />
      <Text style={s.heading}>
        {row.id ? "Edit bottle" : "New whiskey entry"}
      </Text>
      {[
        ["canonicalName", "Exact name, release / batch and size"],
        ["brand", "Brand"],
        ["producer", "Producer"],
        ["proof", "Proof"],
        ["ageStatement", "Age statement"],
        ["summary", "Description"],
        ["guidance", "Buying guidance"],
      ].map(([key, label]) => (
        <TextField
          key={key}
          label={label}
          value={draft[key]}
          onChange={(v) => patch(key, v)}
          multiline={key === "summary" || key === "guidance"}
        />
      ))}
      <Text style={ui.mini}>Category</Text>
      <Tabs
        choices={["bourbon", "rye", "american_whiskey"]}
        value={draft.category}
        onChange={(v) => patch("category", v)}
      />
      <Text style={ui.mini}>Availability</Text>
      <Tabs
        choices={[
          "common",
          "regional",
          "seasonal",
          "limited",
          "allocated",
          "highly_allocated",
          "unicorn",
        ]}
        value={draft.availability}
        onChange={(v) => patch("availability", v)}
      />
      <TextField
        label="Aliases (one per line)"
        value={(draft.aliases || []).join("\n")}
        onChange={(v) => patch("aliases", v.split("\n"))}
        multiline
      />
      <TextField
        label="Reason for library change"
        value={reason}
        onChange={setReason}
        multiline
      />
      <Text style={ui.small}>
        Existing entry IDs stay stable. Linked shelf entries retain their
        quantities, ratings, purchase information and notes.
      </Text>
      <Saved save={save} />
      <Confirm
        label={row.id ? "Save library corrections" : "Create library entry"}
        explanation="These details become available to members in the bottle library."
        busy={save.busy || reason.trim().length < 3}
        onApply={() => apply()}
      />
      {row.id ? (
        <Action
          label={
            merging
              ? "Close duplicate merge"
              : "Merge duplicate into another bottle"
          }
          onPress={() => setMerging(!merging)}
        />
      ) : null}
      {merging ? (
        <>
          <BottlePicker api={api} chosen={target} onChoose={setTarget} />
          <Confirm
            label="Merge duplicate entry"
            explanation={`Move this bottle’s linked records to ${target?.canonicalName || "the selected target"}. Separate member shelf entries, ratings and notes are retained. The old bottle ID redirects to the target.`}
            busy={
              save.busy ||
              !target ||
              target.id === row.id ||
              reason.trim().length < 3
            }
            onApply={() => apply(true)}
          />
        </>
      ) : null}
    </View>
  );
}

function Submissions({ api, history }: { api: Api; history: boolean }) {
  const state = useData(api, "bottle-contributions"),
    [selected, setSelected] = useState<Row | null>(null);

  const items = (state.data?.contributions || []).filter(
    (r: Row) => history || ["new", "needs_human"].includes(r.status),
  );

  return (
    <>
      <Status state={state} />
      {selected ? (
        <SubmissionEditor
          api={api}
          row={selected}
          onClose={() => setSelected(null)}
          onRefresh={async () => {
            setSelected(null);
            await state.load();
          }}
        />
      ) : (
        items.map((r: Row) => (
          <View key={r.id} style={s.card}>
            <Text style={s.heading}>{r.rawName}</Text>
            <Text style={ui.small}>
              {human(r.source)} · {human(r.status)} · {date(r.createdAt)}
            </Text>
            <Text style={ui.small}>
              {r.duplicateCount || 1} submissions
              {r.candidateBottleName
                ? ` · Suggested: ${r.candidateBottleName}`
                : ""}
            </Text>
            <Action
              label="Review bottle submission"
              onPress={() => setSelected(r)}
            />
          </View>
        ))
      )}
      {state.data && !items.length ? (
        <Empty
          title="No bottle submissions in this view"
          copy="The library editor remains available for corrections and new entries."
        />
      ) : null}
      <Action
        label="Refresh submissions"
        onPress={() => {
          setSelected(null);
          void state.load();
        }}
      />
    </>
  );
}

function SubmissionEditor({
  api,
  row,
  onClose,
  onRefresh,
}: {
  api: Api;
  row: Row;
  onClose: () => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [chosen, setChosen] = useState<Row | null>(null),
    [reason, setReason] = useState(""),
    [creating, setCreating] = useState(false);
  const save = useSave(api, onRefresh);

  const act = (action: string) =>
    save.run(
      "bottle-contributions",
      {
        id: row.id,
        expectedUpdatedAt: row.updatedAt,
        action,
        candidateBottleId: chosen?.id,
        reason,
      },
      "Submission resolved and linked shelf entries updated.",
    );

  return (
    <View style={s.card}>
      <Action label="Back to submissions" onPress={onClose} />
      <Text style={s.heading}>{row.rawName}</Text>
      <Text style={ui.small}>
        From {human(row.source)} · {row.userEmail || "Member submission"} ·{" "}
        {human(row.status)}
      </Text>
      {row.notes ? (
        <Text style={ui.small}>Previous review: {row.notes}</Text>
      ) : null}
      <BottlePicker api={api} chosen={chosen} onChoose={setChosen} />
      <Action
        label={
          creating
            ? "Close new entry"
            : "No exact match? Create a library entry"
        }
        onPress={() => setCreating(!creating)}
      />
      {creating ? (
        <BottleEditor
          api={api}
          row={{
            version: 0,
            canonicalName: row.rawName,
            brand: "",
            category: "bourbon",
            availability: "common",
            aliases: [],
          }}
          onClose={() => setCreating(false)}
          onSaved={async (b) => {
            if (b) setChosen(b);
            setCreating(false);
          }}
        />
      ) : null}
      <TextField
        label="Match / dismissal reason"
        value={reason}
        onChange={setReason}
        multiline
      />
      <Saved save={save} />
      <Confirm
        label="Link submission to selected bottle"
        explanation="The selected identity is applied to shelf entries carrying this submission receipt. Member ratings, notes, purchase details and quantities are preserved."
        busy={save.busy || !chosen || reason.trim().length < 3}
        onApply={() => act("use_match")}
      />
      <Confirm
        label="Dismiss invalid submission"
        explanation="Closes the submission. The member’s personal shelf record stays available."
        busy={save.busy || reason.trim().length < 3}
        onApply={() => act("dismiss")}
      />
      {!["new", "needs_human"].includes(row.status) ? (
        <Confirm
          label="Reopen submission"
          explanation="Returns this submission to the missing-bottle review queue."
          busy={save.busy || reason.trim().length < 3}
          onApply={() => act("reopen")}
        />
      ) : null}
    </View>
  );
}

function Members({
  api,
  selected,
  onSelect,
  onCommunity,
  onRewards,
}: {
  api: Api;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onCommunity: () => void;
  onRewards: () => void;
}) {
  const [q, setQ] = useState("");
  const state = useData(api, "members", `?q=${encodeURIComponent(q)}`);

  if (selected)
    return (
      <MemberDetail
        api={api}
        id={selected}
        onClose={() => onSelect(null)}
        onCommunity={onCommunity}
        onRewards={onRewards}
      />
    );

  return (
    <>
      <Text style={s.heading}>Find a member</Text>
      <Search label="Name, email or member number" onSearch={setQ} />
      <Status state={state} />
      {state.data?.members.map((r: Row) => (
        <View key={r.id} style={s.card}>
          <Text style={s.heading}>{r.name || r.email}</Text>
          <Text selectable style={ui.small}>
            {r.email}
          </Text>
          <Text style={ui.badge}>
            {r.numberLabel} #{r.number || "Unassigned"} · {human(r.tier)} ·{" "}
            {human(r.status)}
          </Text>
          <Action label="Open member details" onPress={() => onSelect(r.id)} />
        </View>
      ))}
      {q && state.data?.members.length === 0 ? (
        <Empty
          title="No matching members"
          copy="Try their email address or member number."
        />
      ) : null}
    </>
  );
}

function MemberDetail({
  api,
  id,
  onClose,
  onCommunity,
  onRewards,
}: {
  api: Api;
  id: string;
  onClose: () => void;
  onCommunity: () => void;
  onRewards: () => void;
}) {
  const state = useData(api, "member-detail", `?id=${encodeURIComponent(id)}`),
    [reason, setReason] = useState(""),
    [points, setPoints] = useState(""),
    key = useRef(Crypto.randomUUID());
  const save = useSave(api, state.load);
  const d = state.data,
    m = d?.member;

  async function act(action: string) {
    await save.run(
      "member-detail",
      {
        userId: id,
        action,
        reason,
        points: Number(points),
        requestId: key.current,
      },
      "Member record updated.",
    );
    key.current = Crypto.randomUUID();
  }

  return (
    <>
      <Action label="Back to member search" onPress={onClose} />
      <Status state={state} />
      {m ? (
        <>
          <View style={s.card}>
            <Text style={s.heading}>{m.name || m.email}</Text>
            <Text selectable style={s.copy}>
              {m.email}
            </Text>
            <Text style={ui.badge}>
              {m.numberLabel} #{m.number || "Unassigned"} · {human(m.tier)} ·{" "}
              {human(m.status)}
            </Text>
            <Text style={ui.small}>
              Joined {date(m.createdAt)}
              {m.lastSignInAt ? ` · Last sign-in ${date(m.lastSignInAt)}` : ""}
            </Text>
            <Text style={ui.small}>
              Billing provider: {human(m.billingProvider)}
            </Text>
            <Text style={ui.small}>
              {d?.posts?.[0]?.count ?? "—"} community posts
            </Text>
            <Action label="Open community posts" onPress={onCommunity} />
          </View>
          {d?.unavailable.length ? (
            <Text style={ui.error}>
              Unavailable: {d.unavailable.join(", ")}. These are not empty
              records.
            </Text>
          ) : null}
          <View style={s.card}>
            <Text style={s.heading}>Signal Points</Text>
            <Text style={ui.badge}>
              {d?.points?.balance ?? "Unavailable"} spendable ·{" "}
              {d?.points?.debt ?? "—"} debt
            </Text>
            {d?.points?.activity?.slice(0, 20).map((a: Row) => (
              <View key={a.id} style={ui.history}>
                <Text style={s.label}>
                  {a.points > 0 ? "+" : ""}
                  {a.points} · {human(a.sourceType)}
                </Text>
                <Text style={ui.small}>{a.reason}</Text>
                <Text style={ui.mini}>{date(a.createdAt)}</Text>
              </View>
            ))}
          </View>
          <Text style={s.heading}>Reward history</Text>
          <Action label="Manage this member’s rewards" onPress={onRewards} />
          {d?.points?.redemptions.map((r: Row) => (
            <View key={r.id} style={s.card}>
              <Text style={s.label}>
                {r.itemSnapshot?.name || human(r.itemKey)}
              </Text>
              <Text style={ui.small}>
                {r.pointsSpent} points · {human(r.status)} · {date(r.createdAt)}
              </Text>
              <Details values={r.details} />
              {r.trackingNumber ? (
                <Text selectable style={ui.small}>
                  {r.carrier} · {r.trackingNumber}
                </Text>
              ) : null}
            </View>
          ))}
          {d?.shipping ? (
            <View style={s.card}>
              <Text style={s.label}>Founder shipment</Text>
              <Address value={d.shipping} />
              <Text style={ui.small}>
                {human(d.shipping.status)} · {d.shipping.carrier}{" "}
                {d.shipping.trackingNumber}
              </Text>
            </View>
          ) : null}
          <View style={s.card}>
            <Text style={s.heading}>Support actions</Text>
            <TextField
              label="Private note / reason"
              value={reason}
              onChange={(v) => {
                setReason(v);
                key.current = Crypto.randomUUID();
              }}
              multiline
            />
            <Saved save={save} />
            <Action
              label="Save private member note"
              disabled={save.busy || reason.trim().length < 3}
              onPress={() => void act("note").catch(() => {})}
            />
            <TextField
              label="Point correction (+ to add, − to subtract)"
              value={points}
              onChange={(v) => {
                setPoints(v);
                key.current = Crypto.randomUUID();
              }}
            />
            <Confirm
              label="Apply point correction"
              explanation={`Apply ${Number(points) > 0 ? "+" : ""}${points || "0"} points with this reason. Existing ledger entries remain intact. Subtractions beyond the balance create debt; additions repay debt first.`}
              busy={
                save.busy ||
                reason.trim().length < 3 ||
                !Number.isInteger(Number(points)) ||
                !Number(points)
              }
              onApply={() => act("points")}
            />
            <Text style={ui.small}>
              Contributor restriction limits authority to generate community
              alerts. Individual posts remain available for review.
            </Text>
            <Confirm
              label="Restrict contributor for spam"
              explanation="Removes this contributor’s alert authority until restored. Review offending posts separately."
              busy={save.busy || reason.trim().length < 3}
              onApply={() => act("restrict")}
            />
            {d?.moderation ? (
              <Confirm
                label="Restore contributor standing"
                explanation="Lifts the contributor restriction. Removed posts remain removed until reviewed separately."
                busy={save.busy || reason.trim().length < 3}
                onApply={() => act("restore")}
              />
            ) : null}
            {d?.moderation ? (
              <Text style={ui.small}>
                Restriction: {d.moderation.restrictionReason}
                {d.moderation.restoredAt ? " · Restored" : ""}
              </Text>
            ) : null}
          </View>
          <Text style={s.heading}>Private notes and support history</Text>
          <History rows={d?.history || []} />
        </>
      ) : null}
      <Action label="Refresh member" onPress={() => void state.load()} />
    </>
  );
}

function Address({ value }: { value: Row }) {
  return (
    <Text selectable style={ui.small}>
      {[
        value.recipientName,
        value.addressLine1,
        value.addressLine2,
        `${value.city || ""}, ${value.stateCode || ""} ${value.postalCode || ""}`,
        value.countryCode,
        value.phone,
      ]
        .filter(Boolean)
        .join("\n")}
    </Text>
  );
}

function Details({ values }: { values: Row | undefined }) {
  return (
    <>
      {Object.entries(values || {})
        .filter(
          ([k, v]) =>
            v != null &&
            typeof v !== "object" &&
            !["shippingConfirmed", "age21Attested"].includes(k),
        )
        .map(([k, v]) => (
          <Text key={k} selectable style={ui.small}>
            {human(k)}: {String(v)}
          </Text>
        ))}
    </>
  );
}

function Rewards({
  api,
  onMember,
  userId,
  onClear,
}: {
  api: Api;
  onMember: (id: string) => void;
  userId: string | null;
  onClear: () => void;
}) {
  const [view, setView] = useState("Open rewards"),
    [q, setQ] = useState("");
  const state = useData(
    api,
    "signal-points",
    view === "Completed / canceled" ? "?view=history" : "",
  );

  const rows = (state.data?.queue || []).filter(
    (r: Row) =>
      (!userId || r.userId === userId) &&
      (view !== "Completed / canceled" ||
        ["delivered", "canceled"].includes(r.status)) &&
      [r.accountEmail, r.itemSnapshot?.name, r.id]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase()),
  );

  return (
    <>
      {userId ? (
        <Action
          label="Showing this member’s rewards · Show all members"
          onPress={onClear}
        />
      ) : null}
      <Text style={s.heading}>Rewards & Shipping</Text>
      <Tabs
        choices={["Open rewards", "Completed / canceled", "Founder shipments"]}
        value={view}
        onChange={setView}
      />
      {view === "Founder shipments" ? (
        <FounderShipping api={api} onMember={onMember} />
      ) : (
        <>
          <Search
            label="Recipient email, reward or redemption ID"
            onSearch={setQ}
          />
          <Status state={state} />
          {rows.map((r: Row) => (
            <RewardEditor
              key={`${r.id}-${r.status}`}
              api={api}
              row={r}
              onMember={onMember}
              onRefresh={state.load}
            />
          ))}
          {state.data && !rows.length ? (
            <Empty
              title="No rewards in this view"
              copy="Completed rewards and founder shipments are available in the other views."
            />
          ) : null}
          <Action label="Refresh rewards" onPress={() => void state.load()} />
        </>
      )}
    </>
  );
}

function RewardEditor({
  api,
  row,
  onMember,
  onRefresh,
}: {
  api: Api;
  row: Row;
  onMember: (id: string) => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [carrier, setCarrier] = useState(row.carrier || ""),
    [tracking, setTracking] = useState(row.trackingNumber || ""),
    [note, setNote] = useState("");
  const save = useSave(api, onRefresh);
  const next = rewardNextStates(row as never);

  return (
    <View style={s.card}>
      <Text style={s.heading}>
        {row.itemSnapshot?.name || human(row.itemKey)}
      </Text>
      <Text selectable style={ui.small}>
        {row.accountEmail}
      </Text>
      <Text style={ui.badge}>
        {human(row.status)} · {row.pointsSpent} points
      </Text>
      <Text style={ui.mini}>
        Redeemed {date(row.createdAt)} · {row.id}
      </Text>
      <Details values={row.details} />
      {row.shippingAddress ? <Address value={row.shippingAddress} /> : null}
      {row.userId ? (
        <Action
          label="Open recipient’s member record"
          onPress={() => onMember(row.userId)}
        />
      ) : null}
      {row.carrier || row.trackingNumber ? (
        <Text selectable style={ui.small}>
          {row.carrier} · {row.trackingNumber}
        </Text>
      ) : null}
      {next.length ? (
        <>
          <TextField
            label="Fulfillment note / delivery reference"
            value={note}
            onChange={setNote}
            multiline
          />
          {row.fulfillmentType === "physical" && row.status === "packed" ? (
            <>
              <TextField
                label="Carrier"
                value={carrier}
                onChange={setCarrier}
              />
              <TextField
                label="Tracking number"
                value={tracking}
                onChange={setTracking}
              />
            </>
          ) : null}
        </>
      ) : null}
      <Saved save={save} />
      {next.map((status) => (
        <Confirm
          key={status}
          label={
            status === "digital_fulfillment"
              ? "Record digital reward delivery"
              : status === "canceled"
                ? "Cancel and return points"
                : `Mark ${human(status)}`
          }
          explanation={
            status === "canceled"
              ? "Cancels this redemption and restores its points once."
              : status === "digital_fulfillment"
                ? "Use this only after providing the selected digital reward. Record the delivery reference in the note."
                : `Records the reward as ${human(status)}.`
          }
          busy={
            save.busy ||
            (status === "shipped" && (!carrier.trim() || !tracking.trim())) ||
            (status === "digital_fulfillment" && note.trim().length < 3)
          }
          onApply={() =>
            save.run(
              "signal-points",
              {
                redemptionId: row.id,
                status,
                carrier,
                trackingNumber: tracking,
                note,
              },
              "Reward fulfillment updated.",
            )
          }
        />
      ))}
    </View>
  );
}

function FounderShipping({
  api,
  onMember,
}: {
  api: Api;
  onMember: (id: string) => void;
}) {
  const [view, setView] = useState("Pending"),
    [q, setQ] = useState("");
  const state = useData(api, "shipping");
  const rows = (state.data?.shipments || []).filter(
    (r: Row) =>
      (view === "All shipments" || r.status !== "shipped") &&
      [r.accountEmail, r.recipientName, r.founderNumber]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase()),
  );

  return (
    <>
      <Tabs
        choices={["Pending", "All shipments"]}
        value={view}
        onChange={setView}
      />
      <Search label="Founder name, email or number" onSearch={setQ} />
      <Status state={state} />
      {rows.map((r: Row) => (
        <FounderEditor
          key={r.userId + "-" + r.updatedAt}
          api={api}
          row={r}
          onMember={onMember}
          onRefresh={state.load}
        />
      ))}
      {state.data && !rows.length ? (
        <Empty
          title="No matching founder shipments"
          copy="All shipments includes previously shipped glasses."
        />
      ) : null}
      <Action
        label="Refresh founder shipments"
        onPress={() => void state.load()}
      />
    </>
  );
}

function FounderEditor({
  api,
  row,
  onMember,
  onRefresh,
}: {
  api: Api;
  row: Row;
  onMember: (id: string) => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [carrier, setCarrier] = useState(row.carrier || ""),
    [tracking, setTracking] = useState(row.trackingNumber || "");
  const save = useSave(api, onRefresh);

  return (
    <View style={s.card}>
      <Text style={s.heading}>
        Founder #{row.founderNumber || "—"} · Glass shipment
      </Text>
      <Text selectable style={ui.small}>
        {row.accountEmail}
      </Text>
      <Text style={ui.badge}>
        {human(row.status)}
        {row.referralGlassQuantity
          ? ` · ${row.referralGlassQuantity} referral glasses`
          : ""}
      </Text>
      <Address value={row} />
      <Action
        label="Open member details"
        onPress={() => onMember(row.userId)}
      />
      <TextField
        label="Shipment carrier (UPS, USPS or FedEx)"
        value={carrier}
        onChange={setCarrier}
      />
      <TextField
        label="Shipment tracking number"
        value={tracking}
        onChange={setTracking}
      />
      <Text style={ui.small}>
        Saving updates the shipment record. It does not send a shipment email.
      </Text>
      {row.status === "shipped" ? (
        <>
          <Text style={ui.small}>
            {row.shipmentNotificationSentAt
              ? `Shipment email sent ${date(row.shipmentNotificationSentAt)}`
              : "Shipment email pending"}
          </Text>
          {!row.shipmentNotificationSentAt ? (
            <Confirm
              label="Send shipment email"
              explanation={`Sends the saved tracking details to this member’s current account email. Duplicate sends are prevented.`}
              busy={save.busy}
              onApply={() =>
                save.run(
                  "shipping",
                  {
                    userId: row.userId,
                    expectedUpdatedAt: row.updatedAt,
                    sendShipmentEmail: true,
                  },
                  "Shipment email request completed.",
                )
              }
            />
          ) : null}
        </>
      ) : null}
      <Saved save={save} />
      {["confirmed", "packed", "shipped"].map((status) => (
        <Confirm
          key={status}
          label={
            status === row.status
              ? "Save tracking correction"
              : `Mark ${status}`
          }
          explanation={`Records this founder shipment as ${status}. Carrier and tracking are required for shipped records.`}
          busy={save.busy || (status === "shipped" && (!carrier || !tracking))}
          onApply={() =>
            save.run(
              "shipping",
              {
                userId: row.userId,
                expectedUpdatedAt: row.updatedAt,
                status,
                carrier,
                trackingNumber: tracking,
              },
              "Founder shipment updated.",
            )
          }
        />
      ))}
    </View>
  );
}

function CoverageOperations({ api }: { api: Api }) {
  const [view, setView] = useState("Coverage requests");
  return (
    <>
      <Tabs
        choices={[
          "Coverage requests",
          "Pricing reviews",
          "Service health",
          "Change history",
        ]}
        value={view}
        onChange={setView}
      />
      {view === "Coverage requests" ? (
        <Coverage api={api} />
      ) : view === "Pricing reviews" ? (
        <Pricing api={api} />
      ) : (
        <Operations api={api} history={view === "Change history"} />
      )}
    </>
  );
}

function Coverage({ api }: { api: Api }) {
  const state = useData(api, "coverage"),
    [view, setView] = useState("Open"),
    [q, setQ] = useState(""),
    [expanded, setExpanded] = useState<string | null>(null);
  const rows = (state.data?.requests || []).filter(
    (r: Row) =>
      (view === "All requests" || !["closed", "improved"].includes(r.status)) &&
      [r.areaLabel, r.storeName, r.stateCode]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase()),
  );

  return (
    <>
      <Text style={s.heading}>Coverage requests</Text>
      <Text style={ui.small}>
        Requested queues investigation. Under review pauses it for your review.
        Member updates appear in request history. Coverage is marked improved
        only after verified production evidence.
      </Text>
      <Tabs
        choices={["Open", "All requests"]}
        value={view}
        onChange={setView}
      />
      <Search label="State, area or store" onSearch={setQ} />
      <Status state={state} />
      {state.data ? (
        <Text style={ui.small}>
          Automation:{" "}
          {Object.entries(state.data.automation || {})
            .map(([k, v]) => `${human(k)} ${v}`)
            .join(" · ") || "No active jobs"}
        </Text>
      ) : null}
      {rows.map((r: Row) => (
        <View key={r.id} style={s.card}>
          <Text style={s.heading}>
            {r.storeName || r.areaLabel}, {r.stateCode}
          </Text>
          <Text style={ui.badge}>
            {coverageStatusLabels[r.status as CoverageStatus]}
            {r.review?.priority === "high" ? " · High priority" : ""}
          </Text>
          <Action
            label={expanded === r.id ? "Close request" : "Review request"}
            onPress={() => setExpanded(expanded === r.id ? null : r.id)}
          />
          {expanded === r.id ? (
            <CoverageEditor api={api} row={r} onRefresh={state.load} />
          ) : null}
        </View>
      ))}
      {state.data && !rows.length ? (
        <Empty
          title="No matching coverage requests"
          copy="All requests includes completed and closed reviews."
        />
      ) : null}
      <Text style={s.heading}>Recent investigations</Text>
      {state.data?.jobs?.map((job: Row) => (
        <View key={job.job_key} style={s.card}>
          <Text style={s.label}>
            {job.state_code} · {human(job.status)}
          </Text>
          <Text style={ui.small}>
            {human(job.outcome)} {job.summary || ""}
          </Text>
          <Text style={ui.mini}>{date(job.updated_at)}</Text>
        </View>
      ))}
      <Action label="Refresh coverage" onPress={() => void state.load()} />
    </>
  );
}

function CoverageEditor({
  api,
  row,
  onRefresh,
}: {
  api: Api;
  row: Row;
  onRefresh: () => Promise<unknown>;
}) {
  const [status, setStatus] = useState(row.status),
    [note, setNote] = useState(row.review?.internal_note || ""),
    [update, setUpdate] = useState(row.review?.member_update || ""),
    [high, setHigh] = useState(row.review?.priority === "high");
  const save = useSave(api, onRefresh);

  return (
    <>
      <TextField
        label="Private coverage note"
        value={note}
        onChange={setNote}
        multiline
      />
      <TextField
        label="Member update (shown in their request history)"
        value={update}
        onChange={setUpdate}
        multiline
      />
      <View style={ui.row}>
        {(["requested", "on_radar", "closed"] as const).map((value) => (
          <Action
            key={value}
            label={
              value === "requested"
                ? "Queue investigation"
                : value === "on_radar"
                  ? "Pause for review"
                  : "Close request"
            }
            selected={status === value}
            onPress={() => setStatus(value)}
          />
        ))}
      </View>
      <Action
        label={high ? "High priority ✓" : "Set high priority"}
        onPress={() => setHigh(!high)}
      />
      <Text style={ui.small}>Member preview: {update || "No update yet."}</Text>
      <Saved save={save} />
      <Action
        label="Save review"
        disabled={save.busy || row.status === "improved"}
        onPress={() =>
          void save
            .run("coverage", {
              id: row.id,
              status,
              internalNote: note,
              memberUpdate: update,
              priority: high ? "high" : "normal",
            })
            .catch(() => {})
        }
      />
    </>
  );
}

function Pricing({ api }: { api: Api }) {
  const state = useData(api, "pricing"),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState<Row | null>(null);

  return (
    <>
      <Text style={s.heading}>Pricing reviews</Text>
      <Text style={ui.small}>
        Use the exact release and size. Manufacturer MSRP and completed-sale
        evidence are reviewed separately.
      </Text>
      <Search
        label="Search bottle prices"
        onSearch={(v) => {
          setQ(v);
          setSelected(null);
        }}
      />
      <Status state={state} />
      {state.data?.health ? (
        <Text style={ui.small}>
          Pricing check: {date(state.data.health.checked_at)} ·{" "}
          {state.data.health.summary?.expiredMsrp || 0} expired MSRP ·{" "}
          {state.data.health.summary?.expiredSecondary || 0} expired secondary
          references
        </Text>
      ) : null}
      {selected ? (
        <PriceEditor
          key={selected.id}
          api={api}
          bottle={selected}
          onClose={() => setSelected(null)}
          onRefresh={state.load}
        />
      ) : (
        state.data?.bottles
          .filter((b: Row) => b.name.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 20)
          .map((b: Row) => (
            <View key={b.id} style={s.card}>
              <Text style={s.label}>{b.name}</Text>
              <Text style={ui.small}>
                {b.members} members own this ·{" "}
                {b.reference
                  ? "Has reviewed reference"
                  : "Missing reviewed prices"}
              </Text>
              <Action label="Review prices" onPress={() => setSelected(b)} />
            </View>
          ))
      )}
      <Action label="Refresh pricing" onPress={() => void state.load()} />
    </>
  );
}

function PriceEditor({
  api,
  bottle,
  onClose,
  onRefresh,
}: {
  api: Api;
  bottle: Row;
  onClose: () => void;
  onRefresh: () => Promise<unknown>;
}) {
  const ref = bottle.reference || {},
    [draft, setDraft] = useState<Row>({
      amount: ref.msrp?.amount || "",
      date: ref.msrp?.date || "",
      source: ref.msrp?.source || "",
      label: ref.msrp?.label || "",
      sales:
        ref.secondary?.observations
          ?.map((o: Row) => `${o.date}, ${o.amount}, ${o.source}`)
          .join("\n") || "",
      marketDate: ref.secondary?.date || "",
      marketSource: ref.secondary?.source || "",
      marketLabel: ref.secondary?.label || "",
      note: "",
    });
  const save = useSave(api, onRefresh);

  async function apply() {
    const observations = String(draft.sales)
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [date, amount, ...source] = line.split(",");
        return {
          date: date.trim(),
          amount: Number(amount),
          source: source.join(",").trim(),
        };
      });
    await save.run(
      "pricing",
      {
        reference: {
          bottleId: bottle.id,
          names: [bottle.name],
          ...(draft.amount
            ? {
                msrp: {
                  amount: Number(draft.amount),
                  date: draft.date,
                  source: draft.source,
                  label: draft.label,
                },
              }
            : {}),
          ...(observations.length
            ? {
                secondary: {
                  low: 1,
                  high: 1,
                  date: draft.marketDate,
                  source: draft.marketSource,
                  label: draft.marketLabel,
                  evidenceKind: "completed_sales",
                  observations,
                },
              }
            : ref.secondary
              ? { secondary: ref.secondary }
              : {}),
        },
        note: draft.note,
      },
      "Reviewed prices saved.",
    );
  }

  return (
    <View style={s.card}>
      <Action label="Back to price search" onPress={onClose} />
      <Text style={s.heading}>{bottle.name}</Text>
      {[
        ["amount", "Manufacturer MSRP"],
        ["date", "MSRP date (YYYY-MM-DD)"],
        ["source", "Manufacturer source URL"],
        ["label", "MSRP release and size"],
        [
          "sales",
          "Completed sales: YYYY-MM-DD, price, HTTPS URL (one per line)",
        ],
        ["marketDate", "Secondary observation date (YYYY-MM-DD)"],
        ["marketSource", "Secondary source URL"],
        ["marketLabel", "Secondary release and size"],
        ["note", "Review note describing evidence"],
      ].map(([key, label]) => (
        <TextField
          key={key}
          label={label}
          value={draft[key]}
          onChange={(v) => setDraft({ ...draft, [key]: v })}
          multiline={key === "sales" || key === "note"}
        />
      ))}
      <Text style={ui.small}>
        At least three distinct completed sales within 90 days are required for
        a calculated secondary range.
      </Text>
      <Saved save={save} />
      <Confirm
        label="Save reviewed prices"
        explanation="Creates a new reviewed price record; prior reviews remain in history."
        busy={save.busy || draft.note.trim().length < 10}
        onApply={apply}
      />
    </View>
  );
}

function Operations({ api, history }: { api: Api; history: boolean }) {
  const state = useData(api, "operations"),
    health = state.data?.health;

  return (
    <>
      <Text style={s.heading}>
        {history ? "Admin change history" : "Service health"}
      </Text>
      <Status state={state} />
      {history ? (
        <History rows={state.data?.audit || []} />
      ) : health ? (
        <>
          <View style={s.card}>
            <Text style={s.heading}>
              {health.ok ? "Healthy" : "Needs attention"}
            </Text>
            <Text style={ui.small}>Checked {date(health.checkedAt)}</Text>
            <Text style={ui.badge}>
              Engine: {human(health.engine?.status)} ·{" "}
              {health.engine?.ageMinutes ?? "Unknown"} min old
            </Text>
            <Text style={ui.badge}>
              Alert delivery: {human(health.cron?.status)} ·{" "}
              {health.cron?.ageMinutes ?? "Unknown"} min old
            </Text>
            <Text style={ui.small}>{health.release?.reason || ""}</Text>
          </View>
          {state.data?.states.map((r: Row, i: number) => (
            <View key={r.stateCode || r.state || i} style={s.card}>
              <Text style={s.label}>
                {r.stateCode || r.state || r.name || "State"}
              </Text>
              <Details values={r} />
            </View>
          ))}
          <Text style={ui.small}>
            Use Coverage requests to pause a request for review or return it to
            Requested for investigation. Improvement is confirmed by production
            evidence.
          </Text>
        </>
      ) : null}
      <Action label="Refresh operations" onPress={() => void state.load()} />
    </>
  );
}

function Feedback({api,onMember}:{api:Api;onMember:(id:string)=>void}) {
 const [filter,setFilter]=useState('new'),[offset,setOffset]=useState(0);
 const state=useData(api,'feedback',`?status=${filter}&offset=${offset}`),save=useSave(api,state.load);
 return <><Text style={s.heading}>Member feedback</Text><Text style={ui.small}>Private problem reports and suggestions from Free and paid members. Internal notes are visible only to admins.</Text>
 <Tabs disabled={save.busy} choices={['new','reviewed','planned','resolved','all']} value={filter} onChange={v=>{setOffset(0);setFilter(v);}}/>
 <Status state={state}/>{save.error?<Text accessibilityRole="alert" style={ui.error}>{save.error}</Text>:null}{save.notice?<Text accessibilityLiveRegion="polite" style={ui.notice}>{save.notice}</Text>:null}
 {state.data?.items.map((item:Row)=><FeedbackCard key={`${item.userId}:${item.id}`} item={item} busy={save.busy||state.loading} onMember={()=>onMember(item.userId)} onSave={(status:string,note:string)=>{void save.run('feedback',{userId:item.userId,id:item.id,status,internalNote:note},'Feedback updated.').catch(()=>{});}}/>)}
 {state.data?.items.length===0?<Empty title="No feedback here" copy="New reports and suggestions will appear here after a member sends them."/>:null}
 <View style={ui.row}>{offset>0?<Action label="Previous feedback" disabled={save.busy} onPress={()=>setOffset(Math.max(0,offset-50))}/>:null}{state.data?.nextOffset!=null?<Action label="Next feedback" disabled={save.busy} onPress={()=>setOffset(state.data!.nextOffset)}/>:null}</View>
 <Action label="Refresh feedback" disabled={save.busy||state.loading} onPress={()=>void state.load()}/></>;
}
function FeedbackCard({item,busy,onMember,onSave}:{item:Row;busy:boolean;onMember:()=>void;onSave:(status:string,note:string)=>void}) {
 const [note,setNote]=useState(item.internalNote||''),[status,setStatus]=useState(item.status);
 useEffect(()=>{setNote(item.internalNote||'');setStatus(item.status);},[item.internalNote,item.status]);
 return <View style={s.card}><Text style={s.heading}>{item.kind==='problem'?'Problem report':'Suggestion'}</Text>
 <Text style={ui.badge}>{human(item.status)} · {date(item.createdAt)}</Text><Text selectable style={s.copy}>{item.message}</Text>
 {item.screen?<Text style={ui.small}>Screen: {item.screen}</Text>:null}{item.steps?<><Text style={s.label}>Reproduction steps</Text><Text selectable style={ui.small}>{item.steps}</Text></>:null}
 <Text selectable style={ui.small}>{item.memberName}{item.email?` · ${item.email}`:''}</Text><Text style={ui.mini}>{item.context.platform} · App {item.context.version} · Build {item.context.build} · Update {item.context.update}</Text>
 <Action label="Open member" disabled={busy} onPress={onMember}/><Text style={s.label}>Internal note</Text><TextInput accessibilityLabel="Internal note" multiline maxLength={1500} editable={!busy} value={note} onChangeText={setNote} style={s.input}/>
 <Tabs disabled={busy} choices={['new','reviewed','planned','resolved']} value={status} onChange={setStatus}/><Action label={busy?'Saving…':'Save feedback review'} disabled={busy} onPress={()=>onSave(status,note)}/></View>;
}
