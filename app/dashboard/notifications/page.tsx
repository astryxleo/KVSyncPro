"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, CheckCheck, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase";

type Notice = { id: string; title: string; content: string; target_role: string | null; created_at: string | null };
type Filter = "all" | "unread" | "read";
const panel: React.CSSProperties = { background: "linear-gradient(145deg,#181817,#101115)", border: "1px solid #393124", borderRadius: 16, padding: 18 };
const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 10, border: "1px solid #5d4a2c", background: "#201b13", color: "#f0d9a0", cursor: "pointer" };
const field: React.CSSProperties = { width: "100%", minWidth: 0, boxSizing: "border-box", padding: "12px 14px", borderRadius: 11, border: "1px solid rgba(215,180,106,.24)", background: "#101115", color: "#f5f3ee", font: "inherit" };

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notice[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const db = createClient();
      const { data: { user }, error: authError } = await db.auth.getUser();
      if (authError || !user) { router.replace("/"); return; }
      const { data: roles, error: roleError } = await db.from("user_roles").select("role").eq("user_id", user.id);
      if (roleError) throw roleError;
      if (!(roles ?? []).length) { router.replace("/"); return; }
      const saved = user.user_metadata?.kv_notifications_read;
      setReadIds(Array.isArray(saved) ? saved.filter((v: unknown): v is string => typeof v === "string") : []);
      const { data, error } = await db.from("updates").select("id,title,content,target_role,created_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      setItems((data ?? []) as Notice[]);
      if (!(data ?? []).length) setMessage("No school updates are available for this account yet.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not load school notifications."); }
    finally { setBusy(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const unreadCount = useMemo(() => items.filter(item => !readIds.includes(item.id)).length, [items, readIds]);
  const filteredItems = useMemo(() => items.filter(item => {
    const isRead = readIds.includes(item.id);
    const matchesFilter = filter === "all" || (filter === "read" ? isRead : !isRead);
    const q = searchText.trim().toLowerCase();
    return matchesFilter && (!q || `${item.title} ${item.content} ${item.target_role ?? ""}`.toLowerCase().includes(q));
  }), [items, readIds, filter, searchText]);

  async function saveReadIds(next: string[]) {
    setSaving(true); setMessage("");
    try {
      const { error } = await createClient().auth.updateUser({ data: { kv_notifications_read: next } });
      if (error) throw error;
      setReadIds(next);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save notification status."); }
    finally { setSaving(false); }
  }
  async function toggleRead(id: string) {
    const next = readIds.includes(id) ? readIds.filter(v => v !== id) : [...new Set([...readIds, id])];
    await saveReadIds(next);
  }
  async function markAllRead() {
    await saveReadIds([...new Set([...readIds, ...items.map(item => item.id)])]);
  }

  return <main style={{ minHeight: "100vh", background: "#08090c", color: "#f4f0e6", padding: "28px 18px 56px" }}>
    <section style={{ maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 26 }}>
        <a href="/dashboard" style={{ color: "#f0d9a0", textDecoration: "none", fontWeight: 800 }}>KVSync <span style={{ color: "#d3a64f" }}>Pro</span></a>
        <button style={btn} onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button>
      </header>
      <div style={{ color: "#cba75b", fontSize: 11, letterSpacing: ".16em", fontWeight: 800 }}>SCHOOL COMMUNICATION</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div><h1 style={{ fontSize: "clamp(28px,5vw,42px)", margin: "8px 0" }}>Notifications</h1><p style={{ color: "#a6a5ab", marginTop: 0 }}>{unreadCount} unread · {items.length} recent updates</p></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => void load()} disabled={busy || saving}><RefreshCw size={14}/>{busy ? "Refreshing…" : "Refresh"}</button>
          <button style={btn} onClick={() => void markAllRead()} disabled={busy || saving || unreadCount === 0}><CheckCheck size={14}/>Mark all read</button>
        </div>
      </div>
      <div style={{ ...panel, display: "flex", alignItems: "center", gap: 12, marginBottom: 16, color: "#d9c99f" }}><ShieldCheck size={19}/><span>School updates are filtered by database permissions. Read status is saved to your signed-in account.</span></div>
      <label style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}><Search size={17} color="#cba75b"/><input style={field} value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search title, message, or audience…" aria-label="Search notifications"/></label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>{(["all","unread","read"] as Filter[]).map(value => <button key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} style={{ ...btn, background: filter === value ? "#3a2e19" : "#201b13", textTransform: "capitalize" }}>{value === "all" ? `All (${items.length})` : value === "unread" ? `Unread (${unreadCount})` : `Read (${items.length - unreadCount})`}</button>)}</div>
      {busy ? <div style={panel}>Loading school updates…</div> : filteredItems.length ? <div style={{ display: "grid", gap: 12 }}>{filteredItems.map(item => {
        const isRead = readIds.includes(item.id);
        return <article key={item.id} style={{ ...panel, borderColor: isRead ? "#393124" : "rgba(215,180,106,.52)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 11, background: "#292216", display: "grid", placeItems: "center", color: "#f0d9a0" }}><Bell size={17}/></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", color: "#cba75b", fontSize: 12 }}><span>{item.target_role || "School update"} · {isRead ? "Read" : "Unread"}</span><time>{item.created_at ? new Date(item.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Date unavailable"}</time></div>
              <h2 style={{ fontSize: 18, margin: "8px 0" }}>{item.title}</h2>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "#c6c5ca", lineHeight: 1.65, margin: "0 0 12px" }}>{item.content}</p>
              <button style={btn} onClick={() => void toggleRead(item.id)} disabled={saving}>{isRead ? "Mark unread" : "Mark as read"}</button>
            </div>
          </div>
        </article>;
      })}</div> : <div style={{ ...panel, textAlign: "center", padding: 34 }}><Bell size={25}/><p>{searchText ? "No notifications match your search." : filter === "unread" ? "You're all caught up." : filter === "read" ? "No read notifications in this list." : message || "No recent updates."}</p></div>}
      {message && !busy && <p role="status" style={{ color: "#f0b7a9" }}>{message}</p>}
      <p style={{ color: "#8f9098", fontSize: 12, marginTop: 18 }}>Read status is stored with your account metadata. Push notifications and email delivery are not enabled.</p>
    </section>
  </main>;
}
