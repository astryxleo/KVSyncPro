"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageSquare, RefreshCw, ShieldCheck, EyeOff, Send } from "lucide-react";
import { createClient } from "@/lib/supabase";

type MessageRow = { id: string; sender_id: string; message: string; is_flagged: boolean; created_at: string; is_hidden: boolean };

export default function CommunityPage() {
  const router = useRouter();
  const [items, setItems] = useState<MessageRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState("");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [searchText, setSearchText] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      setUserId(auth.user.id);
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

  const filteredItems = items.filter((item) => item.message.toLowerCase().includes(searchText.trim().toLowerCase()));

  async function postMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > 2000 || role !== "student" || posting) return;
    setPosting(true); setMessage("");
    try {
      const db = createClient();
      const { error } = await db.from("community_messages").insert({ sender_id: userId, message: text });
      if (error) throw new Error("Your message could not be posted. Check your student access and try again.");
      setDraft(""); await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to post message."); }
    finally { setPosting(false); }
  }

  return <main className="community-page"><header><a href="/dashboard" className="community-brand">KVSync <em>Pro</em></a><button onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header><section><div className="community-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div><div className="community-heading"><div><h1>Community</h1><p>Visible school conversations for your assigned role.</p></div><button onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div><div className="community-verified"><ShieldCheck size={18}/><span><b>Protected community feed</b><small>{role ? role.replaceAll("_"," ") : "Checking role"} · Hidden messages excluded</small></span></div>{role === "student" && <form onSubmit={postMessage} className="community-compose"><label htmlFor="community-message">Share with the school community</label><textarea id="community-message" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={3} required placeholder="Keep it kind, relevant, and respectful…" /><div className="community-compose-footer"><small>{draft.length}/2000 · Messages may be reviewed by moderators</small><button type="submit" disabled={posting || !draft.trim()}><Send size={14}/>{posting ? "Posting…" : "Post message"}</button></div></form>}<label className="community-search-label">Search conversations<input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search visible messages…" aria-label="Search community messages" /></label>{busy ? <div className="community-empty">Loading messages securely…</div> : filteredItems.length ? <div className="community-list">{filteredItems.map((item) => <article className="community-card" key={item.id}><div className="community-message-icon"><MessageSquare size={17}/></div><div className="community-message-body"><div className="community-message-meta"><span>Member · {item.sender_id.slice(0,8)}…</span><time>{new Date(item.created_at).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}</time></div><p>{item.message}</p>{item.is_flagged && <span className="community-flag"><EyeOff size={12}/> Flagged for review</span>}</div></article>)}</div> : <div className="community-empty" role="status" aria-live="polite">{searchText ? "No messages match your search." : message || "No visible messages."}</div>}<p className="community-caveat">Student posts are checked by database permissions. Keep personal information private; flagged content may be reviewed by authorized moderators.</p></section></main>;
}
