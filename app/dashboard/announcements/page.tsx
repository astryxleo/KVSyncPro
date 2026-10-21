"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, RefreshCw, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase";

type UpdateRow = { id: string; title: string; content: string; target_role: string | null; class_id: string | null; created_at: string };

export default function AnnouncementsPage() {
  const router = useRouter();
  const [items, setItems] = useState<UpdateRow[]>([]);
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      const { data: roleRows, error: roleError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (roleError) throw new Error("Role verification failed. Announcements are hidden.");
      const assigned = (roleRows ?? []).map((r: {role:string}) => r.role);
      const currentRole = ["operator","admin","teacher","student","data_content_manager"].find((r) => assigned.includes(r));
      if (!currentRole) throw new Error("Your assigned role does not include announcement access.");
      setRole(currentRole);
      let classId = "";
      if (currentRole === "student") {
        const { data: student, error } = await db.from("students").select("class_id").eq("user_id", auth.user.id).maybeSingle();
        if (error) throw new Error("Could not verify your class assignment.");
        if (!student?.class_id) { setMessage("Your student profile or class is not linked yet. Ask the operator to complete account provisioning."); return; }
        classId = student.class_id;
      }
      let query = db.from("updates").select("id,title,content,target_role,class_id,created_at").order("created_at",{ascending:false}).limit(100);
      if (currentRole === "student") {
        query = query.or(`target_role.eq.all,target_role.eq.student,and(target_role.eq.class,class_id.eq.${classId})`);
      } else if (currentRole === "teacher") {
        query = query.or("target_role.eq.all,target_role.eq.teacher");
      }
      const { data, error } = await query;
      if (error) throw new Error("Announcements could not be loaded. Check database permissions.");
      setItems((data ?? []) as UpdateRow[]);
      if (!(data ?? []).length) setMessage("No announcements are available to your account yet.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load announcements."); }
    finally { setBusy(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  return <main className="announcements-page"><header><a href="/dashboard" className="announcements-brand">KVSync <em>Pro</em></a><button onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header><section><div className="announcements-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div><div className="announcements-heading"><div><h1>Announcements</h1><p>School updates available to your verified account.</p></div><button onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div><div className="announcements-verified"><ShieldCheck size={18}/><span><b>Role-checked feed</b><small>{role ? role.replaceAll("_"," ") : "Checking role"} · Row Level Security remains active</small></span></div>{busy ? <div className="announcement-empty">Loading announcements securely…</div> : items.length ? <div className="announcement-list">{items.map((item) => <article className="announcement-card" key={item.id}><div className="announcement-icon"><Bell size={18}/></div><div className="announcement-body"><div className="announcement-meta"><span>{item.target_role || "School update"}</span><time>{item.created_at ? new Date(item.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : ""}</time></div><h2>{item.title}</h2><p>{item.content}</p></div></article>)}</div> : <div className="announcement-empty">{message || "No announcements available."}</div>}<p className="announcement-caveat">This feed is read-only. Publishing and editing remain restricted to authorized management workflows and must be verified with live role sessions.</p></section></main>;
}
