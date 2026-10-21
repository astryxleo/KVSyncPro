"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle, RefreshCw, ShieldCheck, MessageSquareWarning } from "lucide-react";
import { createClient } from "@/lib/supabase";

type Report = { id:string; source:string; content:string; reason:string; status:string; created_at:string; reported_user_id:string; reporter_id:string };
type FlaggedMessage = { id:string; sender_id:string; message:string; matched_snippet:string|null; created_at:string; is_hidden:boolean };

export default function ModerationPage() {
  const router = useRouter();
  const [reports,setReports] = useState<Report[]>([]);
  const [flags,setFlags] = useState<FlaggedMessage[]>([]);
  const [role,setRole] = useState("");
  const [busy,setBusy] = useState(true);
  const [message,setMessage] = useState("");
  const [actionBusy,setActionBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const db = createClient();
      const {data:auth,error:authError} = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      const {data:roles,error:roleError} = await db.from("user_roles").select("role").eq("user_id",auth.user.id);
      if (roleError) throw new Error("Role verification failed. Moderation data is hidden.");
      const assigned = (roles ?? []).map((r:{role:string})=>r.role);
      const currentRole = ["operator","admin","system_moderator"].find(r=>assigned.includes(r));
      if (!currentRole) throw new Error("Moderation access requires Operator, Admin, or System Moderator role.");
      setRole(currentRole);
      const [reportResult,flagResult] = await Promise.all([
        db.from("abuse_reports").select("id,source,content,reason,status,created_at,reported_user_id,reporter_id").eq("status","pending").order("created_at",{ascending:false}).limit(100),
        db.from("community_messages").select("id,sender_id,message,matched_snippet,created_at,is_hidden").eq("is_flagged",true).order("created_at",{ascending:false}).limit(100)
      ]);
      if (reportResult.error || flagResult.error) throw new Error("Moderation queues could not be loaded. Check the database role policies.");
      setReports((reportResult.data ?? []) as Report[]);
      setFlags((flagResult.data ?? []) as FlaggedMessage[]);
      if (!(reportResult.data ?? []).length && !(flagResult.data ?? []).length) setMessage("No pending reports or flagged messages are visible.");
    } catch(e) { setMessage(e instanceof Error ? e.message : "Unable to load moderation queues."); }
    finally { setBusy(false); }
  },[router]);

  useEffect(()=>{void load();},[load]);

  const reviewReport = async (report: Report, action: "resolve_report" | "dismiss_report") => {
    const verb = action === "resolve_report" ? "resolve" : "dismiss";
    if (!window.confirm(`Are you sure you want to ${verb} report ${report.id.slice(0,8)}?`)) return;
    setActionBusy(report.id);
    setMessage("");
    try {
      const db = createClient();
      const { data: sessionData, error: sessionError } = await db.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error("Your session has expired. Please sign in again.");
      const { data, error } = await db.functions.invoke("manage-moderation", {
        body: { action, report_id: report.id },
      });
      if (error) throw new Error("Report review failed. Check your permissions and try again.");
      if (data?.error) throw new Error(String(data.error));
      await load();
      setMessage(action === "resolve_report" ? "Report marked resolved." : "Report dismissed.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Report review failed.");
    } finally {
      setActionBusy(null);
    }
  };

  const moderateMessage = async (item: FlaggedMessage) => {
    const action = item.is_hidden ? "restore_thread" : "hide_thread";
    const reason = action === "hide_thread" ? window.prompt("Reason for hiding this message (optional):") : null;
    if (reason === null && action === "hide_thread") return;
    setActionBusy(item.id);
    setMessage("");
    try {
      const db = createClient();
      const { data: sessionData, error: sessionError } = await db.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error("Your session has expired. Please sign in again.");
      const { data, error } = await db.functions.invoke("manage-moderation", {
        body: { action, message_id: item.id, reason: reason?.trim() || undefined },
      });
      if (error) throw new Error("Moderation action failed. Check your permissions and try again.");
      if (data?.error) throw new Error(String(data.error));
      await load();
      setMessage(action === "hide_thread" ? "Message hidden and moderation log recorded." : "Message restored and moderation log recorded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Moderation action failed.");
    } finally {
      setActionBusy(null);
    }
  };

  return <main className="moderation-page"><header><a href="/dashboard" className="moderation-brand">KVSync <em>Pro</em></a><button onClick={()=>router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header><section><div className="moderation-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div><div className="moderation-heading"><div><h1>Moderation desk</h1><p>Review queues for authorized safety staff.</p></div><button onClick={()=>void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div><div className="moderation-verified"><ShieldCheck size={18}/><span><b>Restricted moderation workspace</b><small>{role ? role.replaceAll("_"," ") : "Checking role"} · Database policies enforce final access</small></span></div>{busy ? <div className="moderation-empty">Loading review queues securely…</div> : <><div className="moderation-grid"><section className="moderation-panel"><div className="moderation-panel-head"><AlertTriangle size={17}/><div><h2>Pending reports</h2><p>{reports.length} awaiting review</p></div></div>{reports.length ? reports.map(r=><article className="moderation-item" key={r.id}><div className="moderation-item-meta"><span>{r.source}</span><time>{new Date(r.created_at).toLocaleDateString("en-IN")}</time></div><h3>{r.reason || "Reason not provided"}</h3><p>{r.content}</p><small>Status: {r.status} · Report ID {r.id.slice(0,8)}…</small><div className="moderation-item-actions"><button onClick={()=>void reviewReport(r,"resolve_report")} disabled={actionBusy!==null}>{actionBusy===r.id ? "Saving…" : "Resolve"}</button><button onClick={()=>void reviewReport(r,"dismiss_report")} disabled={actionBusy!==null}>Dismiss</button></div></article>) : <p className="moderation-none">No pending reports.</p>}</section><section className="moderation-panel"><div className="moderation-panel-head"><MessageSquareWarning size={17}/><div><h2>Flagged messages</h2><p>{flags.length} flagged items</p></div></div>{flags.length ? flags.map(m=><article className="moderation-item" key={m.id}><div className="moderation-item-meta"><span>{m.is_hidden ? "Hidden" : "Visible"}</span><time>{new Date(m.created_at).toLocaleDateString("en-IN")}</time></div><p>{m.message}</p>{m.matched_snippet && <blockquote>{m.matched_snippet}</blockquote>}<small>Sender {m.sender_id.slice(0,8)}… · Message {m.id.slice(0,8)}…</small><div className="moderation-item-actions"><button onClick={()=>void moderateMessage(m)} disabled={actionBusy!==null}>{actionBusy===m.id ? "Saving…" : m.is_hidden ? "Restore message" : "Hide message"}</button></div></article>) : <p className="moderation-none">No flagged messages.</p>}</section></div>{message && <div className="moderation-inline-message">{message}</div>}</>}<p className="moderation-caveat">Review-only in this phase. Resolve/dismiss, hide/restore, bans and audit logging must be exercised through verified server-side actions before being enabled here.</p></section></main>;
}
