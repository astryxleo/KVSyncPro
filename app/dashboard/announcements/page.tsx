"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, RefreshCw, ShieldCheck, Plus, Send } from "lucide-react";
import { createClient } from "@/lib/supabase";

type SchoolClass = { id: string; grade: number; section: string };
type UpdateRow = { id: string; title: string; content: string; target_role: string | null; class_id: string | null; created_at: string };

export default function AnnouncementsPage() {
  const router = useRouter();
  const [items, setItems] = useState<UpdateRow[]>([]);
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [targetRole, setTargetRole] = useState("all");
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      setUserId(auth.user.id);
      const { data: roleRows, error: roleError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (roleError) throw new Error("Role verification failed. Announcements are hidden.");
      const assigned = (roleRows ?? []).map((r: {role:string}) => r.role);
      const currentRole = ["operator","admin","teacher","student","data_content_manager"].find((r) => assigned.includes(r));
      if (!currentRole) throw new Error("Your assigned role does not include announcement access.");
      setRole(currentRole);
      if (currentRole === "operator" || currentRole === "admin") {
        const { data: allClasses, error: classError } = await db.from("classes").select("id,grade,section").order("grade").order("section");
        if (classError) throw new Error("Classes could not be loaded for announcement targeting.");
        setClasses((allClasses ?? []) as SchoolClass[]);
      } else if (currentRole === "teacher") {
        const { data: assignments, error: assignmentError } = await db.from("class_teachers").select("class_id").eq("teacher_id", auth.user.id);
        if (assignmentError) throw new Error("Your class assignments could not be verified.");
        const ids = [...new Set((assignments ?? []).map((row: {class_id:string}) => row.class_id))];
        if (ids.length) {
          const { data: assignedClasses, error: classError } = await db.from("classes").select("id,grade,section").in("id", ids).order("grade").order("section");
          if (classError) throw new Error("Assigned classes could not be loaded.");
          setClasses((assignedClasses ?? []) as SchoolClass[]);
        } else setClasses([]);
      } else setClasses([]);
      let studentClassId = "";
      if (currentRole === "student") {
        const { data: student, error } = await db.from("students").select("class_id").eq("user_id", auth.user.id).maybeSingle();
        if (error) throw new Error("Could not verify your class assignment.");
        if (!student?.class_id) { setMessage("Your student profile or class is not linked yet. Ask the operator to complete account provisioning."); return; }
        studentClassId = student.class_id;
      }
      let query = db.from("updates").select("id,title,content,target_role,class_id,created_at").order("created_at",{ascending:false}).limit(100);
      if (currentRole === "student") {
        query = query.or(`target_role.eq.all,target_role.eq.student,and(target_role.eq.class,class_id.eq.${studentClassId})`);
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

  const canPublish = role === "operator" || role === "admin" || role === "teacher";

  async function publishAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || !cleanBody || !canPublish || saving) return;
    if (role === "teacher" && (targetRole !== "class" || !classId || !classes.some((item) => item.id === classId))) { setMessage("Teachers can publish only to a class they are assigned to manage."); return; }
    setSaving(true); setMessage("");
    try {
      const db = createClient();
      const payload = { title: cleanTitle, content: cleanBody, target_role: targetRole, class_id: targetRole === "class" ? classId : null, posted_by: userId };
      const { error } = await db.from("updates").insert(payload);
      if (error) throw new Error("Announcement could not be published. Database permissions rejected this audience or class.");
      setTitle(""); setBody(""); setTargetRole(role === "teacher" ? "class" : "all"); setClassId("");
      await load(); setMessage("Announcement published.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to publish announcement."); }
    finally { setSaving(false); }
  }

  return <main className="announcements-page"><header><a href="/dashboard" className="announcements-brand">KVSync <em>Pro</em></a><button onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header><section><div className="announcements-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div><div className="announcements-heading"><div><h1>Announcements</h1><p>School updates available to your verified account.</p></div><button onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div><div className="announcements-verified"><ShieldCheck size={18}/><span><b>Role-checked feed</b><small>{role ? role.replaceAll("_"," ") : "Checking role"} · Row Level Security remains active</small></span></div>{canPublish && <form className="announcements-compose" onSubmit={publishAnnouncement}><div><h2><Plus size={17}/> Publish an announcement</h2><p>Publishing options follow your assigned role and class permissions.</p></div><label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required placeholder="e.g. Assembly schedule update"/></label><label>Message<textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={4} required placeholder="Write the announcement clearly…"/></label><div className="announcements-compose-row"><label>Audience<select value={targetRole} onChange={(e) => setTargetRole(e.target.value)}>{(role === "teacher" ? [{value:"class",label:"Assigned class"}] : [{value:"all",label:"Everyone"},{value:"teacher",label:"Teachers"},{value:"student",label:"Students"},{value:"class",label:"A class"}]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{targetRole === "class" && <label>Class<select value={classId} onChange={(e) => setClassId(e.target.value)} required><option value="">Choose class</option>{classes.map((item) => <option key={item.id} value={item.id}>Class {item.grade}-{item.section}</option>)}</select></label>}</div><button type="submit" disabled={saving || !title.trim() || !body.trim() || (targetRole === "class" && !classId)}><Send size={14}/>{saving ? "Publishing…" : "Publish announcement"}</button></form>}{message && !busy && <p className="announcements-feedback" role="status">{message}</p>}{busy ? <div className="announcement-empty">Loading announcements securely…</div> : items.length ? <div className="announcement-list">{items.map((item) => <article className="announcement-card" key={item.id}><div className="announcement-icon"><Bell size={18}/></div><div className="announcement-body"><div className="announcement-meta"><span>{item.target_role || "School update"}</span><time>{item.created_at ? new Date(item.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : ""}</time></div><h2>{item.title}</h2><p>{item.content}</p></div></article>)}</div> : <div className="announcement-empty">{message || "No announcements available."}</div>}<p className="announcement-caveat">Publishing is available to authorized school management and assigned class teachers. Database row-level security remains the final authority.</p></section></main>;
}
