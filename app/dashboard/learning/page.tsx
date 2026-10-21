"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, FileText, RefreshCw, ShieldCheck, Plus, Pencil, X } from "lucide-react";
import { createClient } from "@/lib/supabase";

type Homework = { id: string; class_id: string; title: string; subject: string; description: string | null; deadline: string | null; created_at: string; posted_by?: string };
type Material = { id: string; title: string; subject: string; file_url: string; file_type: string | null };
type SchoolClass = { id: string; grade: number; section: string };

const inputStyle = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid var(--border, #353535)", background: "var(--surface, #111)", color: "inherit", font: "inherit" };

export default function LearningPage() {
  const router = useRouter();
  const [homework, setHomework] = useState<Homework[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      setUserId(auth.user.id);
      const { data: roles, error: roleError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (roleError) throw new Error("Role verification failed. Learning content is hidden.");
      const assigned = (roles ?? []).map((r: {role:string}) => r.role);
      const allowed = ["operator","admin","teacher","student","data_content_manager"].find((r) => assigned.includes(r));
      if (!allowed) throw new Error("Your assigned role does not include learning-hub access.");
      setRole(allowed);
      let studentClassId = "";
      if (allowed === "student") {
        const { data: student, error } = await db.from("students").select("class_id").eq("user_id", auth.user.id).maybeSingle();
        if (error) throw new Error("Could not verify your class assignment.");
        if (!student?.class_id) { setMessage("Your student profile or class is not linked yet. Ask the operator to complete account provisioning."); return; }
        studentClassId = student.class_id;
      }
      let homeworkQuery = db.from("homework").select("id,class_id,title,subject,description,deadline,created_at,posted_by").order("created_at",{ascending:false}).limit(100);
      let materialQuery = db.from("study_materials").select("id,title,subject,file_url,file_type").order("created_at",{ascending:false}).limit(100);
      if (studentClassId) {
        homeworkQuery = homeworkQuery.eq("class_id", studentClassId);
        materialQuery = materialQuery.eq("class_id", studentClassId);
      }
      const [hw, mats] = await Promise.all([homeworkQuery, materialQuery]);
      if (hw.error) throw new Error("Homework could not be loaded. Check the assigned database permissions.");
      if (mats.error) throw new Error("Study materials could not be loaded. Check the assigned database permissions.");
      setHomework((hw.data ?? []) as Homework[]);
      setMaterials((mats.data ?? []) as Material[]);
      if (["operator","admin","teacher"].includes(allowed)) {
        let classRows: SchoolClass[] = [];
        if (allowed === "teacher") {
          const [wholeClass, subjectClass] = await Promise.all([
            db.from("class_teachers").select("class_id").eq("teacher_id", auth.user.id),
            db.from("class_subject_teachers").select("class_id").eq("teacher_id", auth.user.id),
          ]);
          if (wholeClass.error || subjectClass.error) throw new Error("Could not verify teaching assignments.");
          const ids = [...new Set([...(wholeClass.data ?? []), ...(subjectClass.data ?? [])].map((r: {class_id:string}) => r.class_id))];
          if (ids.length) {
            const { data, error } = await db.from("classes").select("id,grade,section").in("id", ids).order("grade").order("section");
            if (error) throw new Error("Assigned classes could not be loaded.");
            classRows = (data ?? []) as SchoolClass[];
          }
        } else {
          const { data, error } = await db.from("classes").select("id,grade,section").order("grade").order("section").limit(200);
          if (error) throw new Error("Classes could not be loaded for content management.");
          classRows = (data ?? []) as SchoolClass[];
        }
        setClasses(classRows);
        if (!classId && classRows.length) setClassId(classRows[0].id);
      }
      if (!(hw.data ?? []).length && !(mats.data ?? []).length) setMessage("No homework or study materials are available yet.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load learning content."); }
    finally { setBusy(false); }
  }, [router, classId]);

  useEffect(() => { void load(); }, [load]);

  const startEdit = (item: Homework) => {
    setEditingId(item.id); setClassId(item.class_id); setSubject(item.subject); setTitle(item.title);
    setDescription(item.description ?? ""); setDeadline(item.deadline ? item.deadline.slice(0,10) : "");
    setEditorOpen(true); setMessage("");
  };
  const startNew = () => {
    setEditingId(""); setSubject(""); setTitle(""); setDescription(""); setDeadline("");
    if (classes.length) setClassId(classes[0].id);
    setEditorOpen(true); setMessage("");
  };
  const saveHomework = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!classId || !title.trim() || !subject.trim()) { setMessage("Choose a class and enter both title and subject."); return; }
    setSaving(true); setMessage("");
    try {
      const db = createClient();
      const payload = { class_id: classId, title: title.trim(), subject: subject.trim(), description: description.trim() || null, deadline: deadline || null, ...(editingId ? {} : { posted_by: userId }) };
      const result = editingId
        ? await db.from("homework").update(payload).eq("id", editingId).select("id").maybeSingle()
        : await db.from("homework").insert(payload).select("id").maybeSingle();
      if (result.error) throw new Error(result.error.message.includes("row-level security") ? "Database permissions blocked this change. Check your class assignment." : "Homework could not be saved: " + result.error.message);
      if (!result.data) throw new Error("No row was changed. Your role may not have permission for this item.");
      setEditorOpen(false); setEditingId(""); setMessage("Homework saved successfully.");
      await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to save homework."); }
    finally { setSaving(false); }
  };

  const canCreateHomework = ["operator","admin","teacher"].includes(role) && classes.length > 0;
  const canEditHomework = (item: Homework) => ["operator","admin"].includes(role) || (role === "teacher" && item.posted_by === userId);

  return <main className="learning-page">
    <header><a className="learning-brand" href="/dashboard">KVSync <em>Pro</em></a><button onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header>
    <section>
      <div className="learning-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div>
      <div className="learning-title-row"><div><h1>Learning hub</h1><p>Homework and study resources available to your signed-in role.</p></div><button className="learning-refresh" onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div>
      <div className="learning-verified"><ShieldCheck size={18}/><span><b>Role-checked content</b><small>{role ? role.replaceAll("_"," ") : "Checking role"} · Database row policies remain active</small></span></div>
      {canCreateHomework && <div style={{display:"flex",justifyContent:"flex-end",margin:"16px 0"}}><button className="learning-refresh" onClick={startNew}><Plus size={15}/> Add homework</button></div>}
      {editorOpen && <form onSubmit={saveHomework} className="learning-panel" style={{display:"grid",gap:12,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>{editingId ? "Edit homework" : "Create homework"}</h2><button type="button" onClick={() => setEditorOpen(false)} aria-label="Close editor"><X size={18}/></button></div>
        <label>Class<select required value={classId} onChange={e => setClassId(e.target.value)} style={inputStyle}><option value="">Choose class</option>{classes.map(c => <option key={c.id} value={c.id}>Class {c.grade}-{c.section}</option>)}</select></label>
        <label>Subject<input required maxLength={80} value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} placeholder="e.g. Mathematics"/></label>
        <label>Homework title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="Enter a clear title"/></label>
        <label>Description<textarea maxLength={5000} value={description} onChange={e => setDescription(e.target.value)} style={{...inputStyle,minHeight:100,resize:"vertical"}} placeholder="Instructions or details (optional)"/></label>
        <label>Deadline<input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inputStyle}/></label>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button type="submit" disabled={saving || !classes.length}>{saving ? "Saving…" : editingId ? "Save changes" : "Publish homework"}</button><button type="button" onClick={() => setEditorOpen(false)}>Cancel</button></div>
      </form>}
      {busy ? <div className="learning-message">Loading learning resources securely…</div> : message && !homework.length && !materials.length ? <div className="learning-message">{message}</div> : <>
        <div className="learning-grid">
          <article className="learning-panel"><div className="learning-panel-head"><span><BookOpen size={18}/></span><div><h2>Homework</h2><p>{homework.length} item(s) available</p></div></div>
            {homework.length ? homework.map(item => <div className="learning-item" key={item.id}><div><span className="learning-subject">{item.subject || "General"}</span><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</div><div style={{display:"grid",justifyItems:"end",gap:8}}><small>{item.deadline ? "Due "+new Date(item.deadline).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "No deadline listed"}</small>{canEditHomework(item) && <button type="button" onClick={() => startEdit(item)} aria-label={"Edit "+item.title}><Pencil size={14}/> Edit</button>}</div></div>) : <p className="learning-empty">No homework items are visible to this account.</p>}
          </article>
          <article className="learning-panel"><div className="learning-panel-head"><span><FileText size={18}/></span><div><h2>Study materials</h2><p>{materials.length} resource(s) available</p></div></div>
            {materials.length ? materials.map(item => <div className="learning-item material" key={item.id}><div><span className="learning-subject">{item.subject || "General"}{item.file_type ? " · "+item.file_type : ""}</span><h3>{item.title}</h3></div><a href={item.file_url} target="_blank" rel="noreferrer">Open resource ↗</a></div>) : <p className="learning-empty">No study materials are visible to this account.</p>}
          </article>
        </div>
        {message && <div className="learning-inline-message">{message}</div>}
      </>}
      <p className="learning-caveat">Homework creation and editing are enabled for authorized staff. Study-material upload and secure signed-download workflows remain separate until storage integration is completed.</p>
    </section>
  </main>;
}
