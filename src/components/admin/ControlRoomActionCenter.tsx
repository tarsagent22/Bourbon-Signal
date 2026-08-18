"use client";

import { useEffect, useMemo, useState } from "react";

export type ControlRoomWorkItem = { key: string; title: string; detail: string; kind: string; priority: "urgent" | "high" | "normal"; href: string; email?: string };
export type ControlRoomMember = { id: string; name: string; email: string; tier: string; status: string };
type FollowUp = { note: string; dueDate: string; resolved: boolean; updatedAt: string };
type Audit = { id: string; itemKey: string; message: string; at: string };
const STORE = "bourbon-signal-control-room-v2";

export default function ControlRoomActionCenter({ items, members }: { items: ControlRoomWorkItem[]; members: ControlRoomMember[] }) {
  const [followups, setFollowups] = useState<Record<string, FollowUp>>({});
  const [audit, setAudit] = useState<Audit[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(STORE) || "{}"); setFollowups(saved.followups || {}); setAudit(saved.audit || []); setSeen(saved.seen || []); } catch {} }, []);
  const persist = (nextFollowups: Record<string, FollowUp>, nextAudit = audit, nextSeen = seen) => {
    setFollowups(nextFollowups); setAudit(nextAudit); setSeen(nextSeen);
    localStorage.setItem(STORE, JSON.stringify({ followups: nextFollowups, audit: nextAudit.slice(0, 100), seen: nextSeen }));
  };
  const update = (item: ControlRoomWorkItem, patch: Partial<FollowUp>, message: string) => {
    const previous = followups[item.key] || { note: "", dueDate: "", resolved: false, updatedAt: "" };
    const next = { ...followups, [item.key]: { ...previous, ...patch, updatedAt: new Date().toISOString() } };
    const history = [{ id: crypto.randomUUID(), itemKey: item.key, message, at: new Date().toISOString() }, ...audit];
    persist(next, history);
  };
  const priorityRank = { urgent: 0, high: 1, normal: 2 } as const;
  const active = items.filter((item) => !followups[item.key]?.resolved).sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  const newCount = items.filter((item) => !seen.includes(item.key)).length;
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return members.filter((member) => `${member.name} ${member.email} ${member.tier} ${member.status}`.toLowerCase().includes(needle)).slice(0, 12);
  }, [members, query]);
  return <div className="oca">
    <header><div><p>Owner work queue</p><h2>Act, assign, and close the loop</h2></div><span>{active.length} open · {newCount} new</span></header>
    {newCount ? <div className="oca-alert" role="status"><strong>{newCount} new item{newCount === 1 ? "" : "s"} need review.</strong><button onClick={() => persist(followups, audit, items.map((item) => item.key))}>Mark seen</button></div> : null}
    <label className="oca-search"><span>Search every member</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, tier, or status" /></label>
    {query.trim().length >= 2 ? <div className="oca-results">{results.length ? results.map((member) => <article key={member.id}><div><strong>{member.name}</strong><a href={`mailto:${member.email}`}>{member.email}</a></div><span>{member.tier} · {member.status}</span><small>{items.filter((item) => item.email === member.email).length} open queue item(s)</small></article>) : <p>No member matches.</p>}</div> : null}
    <div className="oca-list">{active.length ? active.map((item) => { const followup = followups[item.key] || { note: "", dueDate: "", resolved: false, updatedAt: "" }; return <article className={`oca-item ${item.priority}`} key={item.key}>
      <div className="oca-main"><span>{item.priority} · {item.kind}</span><h3>{item.title}</h3><p>{item.detail}</p><div className="oca-links"><a href={item.href}>Open record</a>{item.email ? <a href={`mailto:${item.email}`}>Contact</a> : null}</div></div>
      <div className="oca-follow"><label>Due<input type="date" value={followup.dueDate} onChange={(event) => update(item, { dueDate: event.target.value }, `Due date set to ${event.target.value || "none"}`)} /></label><label>Owner note<textarea value={followup.note} onChange={(event) => setFollowups({ ...followups, [item.key]: { ...followup, note: event.target.value, updatedAt: new Date().toISOString() } })} placeholder="Next step or context" /></label><div><button onClick={() => update(item, { note: followups[item.key]?.note || "" }, "Follow-up note saved")}>Save note</button><button className="resolve" onClick={() => update(item, { resolved: true }, "Marked resolved")}>Resolve</button></div></div>
    </article>; }) : <div className="oca-clear"><strong>No owner follow-up is open.</strong><p>New exceptions will appear here automatically.</p></div>}</div>
    <details className="oca-audit"><summary>Recent owner activity <b>{audit.length}</b></summary><div>{audit.slice(0, 20).map((entry) => <p key={entry.id}><time>{new Date(entry.at).toLocaleString()}</time><span>{entry.message}</span></p>)}</div></details>
    <style>{css}</style>
  </div>;
}

const css = `.oca{display:grid;gap:14px}.oca>header{display:flex;align-items:end;justify-content:space-between;gap:16px}.oca>header p{margin:0;color:#c4943a;font:900 9px/1 var(--font-jetbrains);letter-spacing:.14em;text-transform:uppercase}.oca h2{margin:7px 0 0;font:700 30px/1 var(--font-playfair)}.oca>header>span{color:#d9b768;font:800 11px var(--font-jetbrains)}.oca-alert{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid rgba(220,166,55,.35);background:rgba(196,148,58,.1);padding:12px 14px}.oca button,.oca-links a{border:1px solid rgba(196,148,58,.4);border-radius:8px;background:transparent;color:#d9b768;padding:8px 10px;font:800 10px var(--font-jetbrains);cursor:pointer;text-decoration:none}.oca-search{display:grid;gap:6px}.oca-search span,.oca-follow label{color:rgba(245,237,214,.5);font-size:10px}.oca-search input,.oca-follow input,.oca-follow textarea{width:100%;box-sizing:border-box;border:1px solid rgba(245,237,214,.14);border-radius:8px;background:#0d0a07;color:#f5edd6;padding:10px}.oca-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.oca-results article{display:grid;grid-template-columns:1fr auto;gap:4px 10px;border:1px solid rgba(245,237,214,.09);background:#15100c;padding:11px}.oca-results article div{display:grid}.oca-results a{color:#d9b768;font-size:10px}.oca-results span,.oca-results small{color:rgba(245,237,214,.5);font-size:9px}.oca-results small{grid-column:1/-1}.oca-list{display:grid;gap:8px}.oca-item{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:14px;border:1px solid rgba(245,237,214,.1);border-left:3px solid #7893b8;background:#15100c;padding:14px}.oca-item.urgent{border-left-color:#de5e49}.oca-item.high{border-left-color:#dca637}.oca-main>span{color:#c4943a;font:900 8px var(--font-jetbrains);text-transform:uppercase}.oca-main h3{margin:5px 0;font:700 20px var(--font-playfair)}.oca-main p{margin:0;color:rgba(245,237,214,.58);font-size:11px;line-height:1.45}.oca-links{display:flex;gap:7px;margin-top:10px}.oca-follow{display:grid;grid-template-columns:110px 1fr;gap:8px}.oca-follow label{display:grid;gap:5px}.oca-follow textarea{min-height:58px;resize:vertical}.oca-follow>div{grid-column:1/-1;display:flex;justify-content:flex-end;gap:7px}.oca-follow .resolve{background:#c4943a;color:#0d0a07}.oca-clear{border-left:2px solid #73c987;background:rgba(56,130,74,.08);padding:14px}.oca-clear p{margin:4px 0 0;color:rgba(245,237,214,.5)}.oca-audit{border-top:1px solid rgba(245,237,214,.1)}.oca-audit summary{cursor:pointer;padding:12px 0;color:#d9b768;font-size:11px}.oca-audit summary b{float:right}.oca-audit p{display:grid;grid-template-columns:170px 1fr;gap:12px;margin:0;padding:8px 0;border-top:1px solid rgba(245,237,214,.07);font-size:10px}.oca-audit time{color:rgba(245,237,214,.4)}@media(max-width:700px){.oca>header,.oca-alert{align-items:flex-start}.oca>header,.oca-results,.oca-item{display:grid;grid-template-columns:1fr}.oca-follow{grid-template-columns:1fr}.oca-follow>div{grid-column:1}.oca-audit p{grid-template-columns:1fr}.oca h2{font-size:25px}}`;
