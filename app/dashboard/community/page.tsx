"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageSquare, RefreshCw, ShieldCheck, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase";

type MessageRow = { id: string; sender_id: string; message: string; is_flagged: boolean; created_at: string; is_hidden: boolean };

export default function CommunityPage() {
  const router = useRouter();
  const [items, setItems] = useState<MessageRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      const { data: roles, error: roleError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (roleError) throw new Error("Role verification failed. Community access is paused.");
      const assigned = (roles ?? []).map((r: {role:string}) => r.role);
      const currentRole = ["operator","admin","teacher","student","system_moderator"].find((r) => assigned.includes(r));
      if (!currentRole) throw new Error("Your assigned role does not include community access.");
      setRole(currentRole);
      const { data, error } = await db.from("community_messages").select("id,sender_id,message,is_flagged,created_at,is_hidden").eq("is_hidden", false).order("created_at",{ascending:false}).limit(100);
      if (error) throw new Error("Community messages could not be loaded. Database policies may restrict this feed.");
      setItems((data ?? []) as MessageRow[]);
      if (!(data ?? []).length) setMessage("No visible community messages yet.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load community."); }
    finally { setBusy(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  return <main className="community-page"><header><a href="/dashboard" className="community-brand">KVSync <em>Pro</em></a><button onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header><section><div className="community-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div><div className="community-heading"><div><h1>Community</h1><p>Visible school conversations for your assigned role.</p></div><button onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div><div className="community-verified"><ShieldCheck size={18}/><span><b>Protected community feed</b><small>{role ? role.replaceAll("_"," ") : "Checking role"} · Hidden messages excluded</small></span></div>{busy ? <div className="community-empty">Loading messages securely…</div> : items.length ? <div className="community-list">{items.map((item) => <article className="community-card" key={item.id}><div className="community-message-icon"><MessageSquare size={17}/></div><div className="community-message-body"><div className="community-message-meta"><span>Member · {item.sender_id.slice(0,8)}…</span><time>{new Date(item.created_at).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}</time></div><p>{item.message}</p>{item.is_flagged && <span className="community-flag"><EyeOff size={12}/> Flagged for review</span>}</div></article>)}</div> : <div className="community-empty">{message || "No visible messages."}</div>}<p className="community-caveat">Read-only feed for this phase. Posting, direct messaging, reporting and moderation actions are not enabled here until their authorization paths are verified.</p></section></main>;
}
