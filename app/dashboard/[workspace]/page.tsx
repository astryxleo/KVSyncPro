"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, ShieldCheck, Plus, CheckCircle2, Activity, FileText, LifeBuoy, Bug } from "lucide-react";
import { createClient } from "@/lib/supabase";

type Role = "operator" | "admin" | "teacher" | "student" | "system_moderator" | "data_content_manager" | "tester" | "support_manager";
type Item = { id: string; title?: string; content?: string; description?: string; severity?: string; status?: string; target_role?: string; created_at?: string; subject?: string | null; message?: string; reporter_id?: string; screenshot_url?: string | null; sender_id?: string; recipient_id?: string; action?: string; reason?: string | null; actor_id?: string };
const labels: Record<string, string> = {
  content: "Content management",
  bugs: "Bug reports",
  support: "Support inbox",
  activity: "System activity",
};
const allowedRoles: Record<string, Role[]> = {
  content: ["operator", "admin", "data_content_manager"],
  bugs: ["operator", "admin", "tester", "support_manager"],
  support: ["operator", "admin", "support_manager"],
  activity: ["operator", "admin", "tester"],
};
const shell: React.CSSProperties = { minHeight: "100vh", background: "#08090c", color: "#f4f0e6", padding: "28px 18px 56px" };
const panel: React.CSSProperties = { background: "linear-gradient(145deg,rgba(28,27,25,.95),rgba(14,15,18,.98))", border: "1px solid rgba(208,170,89,.22)", borderRadius: 18, padding: 22, boxShadow: "0 18px 55px rgba(0,0,0,.2)" };
const button: React.CSSProperties = { border: "1px solid rgba(221,184,105,.4)", borderRadius: 10, background: "rgba(184,142,57,.13)", color: "#f0d9a0", padding: "10px 14px", cursor: "pointer", display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 650 };
const field: React.CSSProperties = { width: "100%", padding: "12px 13px", borderRadius: 10, border: "1px solid #39352d", background: "#101115", color: "#f4f0e6", outline: "none", marginTop: 7, boxSizing: "border-box" };

export default function WorkspaceModulePage() {
  const params = useParams<{ workspace: string }>();
  const workspace = params.workspace;
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetRole, setTargetRole] = useState("all");

  const validWorkspace = Object.prototype.hasOwnProperty.call(labels, workspace);
  const primaryRole = useMemo(() => roles.find((role) => allowedRoles[workspace]?.includes(role)) ?? "", [roles, workspace]);
  const isStaff = roles.some((role) => ["operator", "admin", "support_manager"].includes(role));
  const canPublish = workspace === "content" && roles.some((role) => ["operator", "admin"].includes(role));
  const canReviewBugs = workspace === "bugs" && isStaff;

  const load = useCallback(async () => {
    if (!validWorkspace) { setBusy(false); return; }
    setBusy(true);
    setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      setUserId(auth.user.id);
      const { data: roleRows, error: roleError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (roleError) throw new Error("Role verification failed. This workspace is locked.");
      const knownRoles: Role[] = ["operator", "admin", "teacher", "student", "system_moderator", "data_content_manager", "tester", "support_manager"];
      const assigned = (roleRows ?? []).map((row: { role: string }) => row.role).filter((role): role is Role => knownRoles.includes(role as Role));
      if (!assigned.some((role) => allowedRoles[workspace]?.includes(role))) throw new Error("Your assigned role does not include access to this workspace.");
      setRoles(assigned);
      let result: { data: unknown[] | null; error: { message: string } | null };
      if (workspace === "content") {
        result = await db.from("updates").select("id,title,content,target_role,created_at").order("created_at", { ascending: false }).limit(100);
      } else if (workspace === "bugs") {
        result = await db.from("bug_reports").select("id,title,description,severity,status,created_at,reporter_id,screenshot_url").order("created_at", { ascending: false }).limit(100);
      } else if (workspace === "support") {
        result = await db.from("contact_messages").select("id,subject,message,status,created_at,sender_id,recipient_id").is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
      } else if (assigned.includes("tester") && !assigned.some((role) => ["operator", "admin"].includes(role))) {
        result = await db.from("bug_reports").select("id,title,description,severity,status,created_at,reporter_id").eq("reporter_id", auth.user.id).order("created_at", { ascending: false }).limit(100);
      } else {
        result = await db.from("moderation_action_logs").select("id,message_id,actor_id,action,reason,created_at").order("created_at", { ascending: false }).limit(100);
      }
      if (result.error) throw new Error("The data could not be loaded. Database permissions remain enforced; refresh or contact the operator.");
      setItems((result.data ?? []) as Item[]);
      if (!(result.data ?? []).length) setMessage(workspace === "activity" && assigned.includes("tester") ? "No quality reports are recorded for this account yet." : "Nothing to display yet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load this workspace.");
    } finally { setBusy(false); }
  }, [router, validWorkspace, workspace]);

  useEffect(() => { void load(); }, [load]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPublish || !title.trim() || !body.trim()) return;
    setSaving(true); setMessage("");
    try {
      const db = createClient();
      const { error } = await db.from("updates").insert({ title: title.trim(), content: body.trim(), target_role: targetRole, class_id: null, posted_by: userId });
      if (error) throw new Error("Publishing failed. Confirm your role and database policy.");
      setTitle(""); setBody(""); setMessage("Announcement published successfully."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Publishing failed."); }
    finally { setSaving(false); }
  }

  async function updateStatus(item: Item, status: string) {
    setSaving(true); setMessage("");
    try {
      const db = createClient();
      const table = workspace === "bugs" ? "bug_reports" : "contact_messages";
      const update = workspace === "bugs" ? { status, updated_at: new Date().toISOString() } : { status };
      const { error } = await db.from(table).update(update).eq("id", item.id);
      if (error) throw new Error("Status update was rejected by the database policy.");
      setMessage("Status updated."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Status update failed."); }
    finally { setSaving(false); }
  }

  if (!validWorkspace) return <main style={shell}><section style={{ ...panel, maxWidth: 650, margin: "10vh auto" }}><h1>Workspace not found</h1><button style={button} onClick={() => router.replace("/dashboard")}>Return to overview</button></section></main>;

  const Icon = workspace === "content" ? FileText : workspace === "bugs" ? Bug : workspace === "support" ? LifeBuoy : Activity;
  return <main style={shell}>
    <header style={{ maxWidth: 1100, margin: "0 auto 30px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
      <a href="/dashboard" style={{ color: "#f0d9a0", textDecoration: "none", fontWeight: 800, letterSpacing: ".02em" }}>KVSync <span style={{ color: "#d3a64f" }}>Pro</span></a>
      <button style={button} onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button>
    </header>
    <section style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ color: "#c5a65c", fontSize: 11, letterSpacing: ".18em", fontWeight: 800, marginBottom: 12 }}>PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 20, flexWrap: "wrap", marginBottom: 22 }}>
        <div><h1 style={{ fontSize: "clamp(30px,5vw,44px)", letterSpacing: "-.04em", margin: 0 }}>{labels[workspace]}</h1><p style={{ color: "#a9a8ad", margin: "9px 0 0" }}>{workspace === "content" ? "School updates and authorized publishing." : workspace === "bugs" ? "Product issue tracking with role-checked review." : workspace === "support" ? "Support conversations available to authorized staff." : "Recent moderation events or your quality reports."}</p></div>
        <button style={button} onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button>
      </div>
      <div style={{ ...panel, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <ShieldCheck color="#d5b367" size={22}/><div><strong>Access verified</strong><div style={{ color: "#a9a8ad", fontSize: 13, marginTop: 4 }}>{primaryRole ? primaryRole.replaceAll("_", " ") : "Checking role"} · Database row-level security remains active</div></div>
      </div>
      {canPublish && <form onSubmit={publish} style={{ ...panel, marginBottom: 20, display: "grid", gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Publish announcement</h2>
        <label>Title<input style={field} maxLength={140} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. School assembly update"/></label>
        <label>Message<textarea style={{ ...field, minHeight: 110, resize: "vertical" }} maxLength={5000} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a clear school update…"/></label>
        <label>Audience<select style={field} value={targetRole} onChange={(e) => setTargetRole(e.target.value)}><option value="all">Everyone</option><option value="teacher">Teachers</option><option value="student">Students</option></select></label>
        <div><button style={button} disabled={saving}><Plus size={15}/>{saving ? "Publishing…" : "Publish update"}</button></div>
      </form>}
      {message && <div role="status" style={{ ...panel, marginBottom: 18, color: "#e8d7a9" }}>{message}</div>}
      {busy ? <div style={panel}>Loading securely…</div> : items.length ? <div style={{ display: "grid", gap: 12 }}>
        {items.map((item) => <article key={item.id} style={panel}>
          <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "start", minWidth: 0, flex: 1 }}><span style={{ color: "#d3ad5e", paddingTop: 3 }}><Icon size={19}/></span><div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 18, overflowWrap: "anywhere" }}>{item.title || item.subject || item.action || "Activity record"}</h2>
              <p style={{ color: "#c4c1c0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.65, margin: "9px 0" }}>{item.content || item.description || item.message || item.reason || (item.actor_id ? "Privileged moderation action recorded." : "")}</p>
              <div style={{ color: "#99989f", fontSize: 12 }}>{item.created_at ? new Date(item.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}{item.target_role ? " · Audience: " + item.target_role : ""}{item.severity ? " · Severity: " + item.severity : ""}{item.reporter_id ? " · Reporter: " + item.reporter_id.slice(0, 8) : ""}</div>
            </div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {item.status && <span style={{ border: "1px solid #4a4335", color: "#e6d19b", borderRadius: 20, padding: "5px 9px", fontSize: 12 }}>{item.status.replaceAll("_", " ")}</span>}
              {workspace === "bugs" && canReviewBugs && <select aria-label="Update bug status" style={{ ...field, width: "auto", margin: 0 }} value={item.status || "open"} disabled={saving} onChange={(e) => void updateStatus(item, e.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select>}
              {workspace === "support" && <select aria-label="Update support status" style={{ ...field, width: "auto", margin: 0 }} value={item.status || "active"} disabled={saving} onChange={(e) => void updateStatus(item, e.target.value)}><option value="active">Active</option><option value="pushed">In progress</option><option value="closed">Closed</option></select>}
            </div>
          </div>
        </article>)}
      </div> : <div style={panel}><CheckCircle2 color="#d3ad5e" size={20}/><p style={{ color: "#aaa9ad", marginBottom: 0 }}>{message || "No records are available to this account yet."}</p></div>}
      {workspace === "content" && !canPublish && <p style={{ color: "#85848b", fontSize: 12, lineHeight: 1.6, marginTop: 18 }}>Your role has read access to updates visible under database policies. Publishing is restricted to Operator and Administrator until the content-manager write policy is separately approved.</p>}
    </section>
  </main>;
}
