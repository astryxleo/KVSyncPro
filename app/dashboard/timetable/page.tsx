"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, RefreshCw, ShieldCheck, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase";

type SchoolClass = { id: string; grade: number; section: string };
type Period = { id: string; class_id: string; day_of_week: string; period_number: number; subject: string; teacher_name: string | null; file_url: string | null; classes?: { grade: number; section: string }[] | null };
const weekdays = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export default function TimetablePage() {
  const router = useRouter();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [day, setDay] = useState("All days");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState("");
  const [newDay, setNewDay] = useState("Monday");
  const [newPeriod, setNewPeriod] = useState("1");
  const [newSubject, setNewSubject] = useState("");
  const [newTeacher, setNewTeacher] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      const { data: roleRows, error: roleError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (roleError) throw new Error("Role verification failed. Timetable is hidden.");
      const assigned = (roleRows ?? []).map((r: {role:string}) => r.role);
      const currentRole = ["operator","admin","teacher","student"].find((r) => assigned.includes(r));
      if (!currentRole) throw new Error("Your assigned role does not include timetable access.");
      setRole(currentRole);
      let studentClassId = "";
      let manageableIds: string[] = [];
      if (currentRole === "operator" || currentRole === "admin") {
        const { data: allClasses, error: classError } = await db.from("classes").select("id,grade,section").order("grade").order("section");
        if (classError) throw new Error("Class list could not be loaded for timetable management.");
        setClasses((allClasses ?? []) as SchoolClass[]);
        manageableIds = (allClasses ?? []).map((row: {id:string}) => row.id);
      } else if (currentRole === "teacher") {
        const { data: assignments, error: assignmentError } = await db.from("class_teachers").select("class_id").eq("teacher_id", auth.user.id);
        if (assignmentError) throw new Error("Could not verify your timetable management assignments.");
        manageableIds = [...new Set((assignments ?? []).map((row: {class_id:string}) => row.class_id))];
        if (manageableIds.length) {
          const { data: assignedClasses, error: classError } = await db.from("classes").select("id,grade,section").in("id", manageableIds).order("grade").order("section");
          if (classError) throw new Error("Assigned classes could not be loaded.");
          setClasses((assignedClasses ?? []) as SchoolClass[]);
        } else setClasses([]);
      } else setClasses([]);

      if (currentRole === "student") {
        const { data: student, error } = await db.from("students").select("class_id").eq("user_id", auth.user.id).maybeSingle();
        if (error) throw new Error("Could not verify your class assignment.");
        if (!student?.class_id) { setMessage("Your student profile or class is not linked yet. Ask the operator to complete account provisioning."); return; }
        studentClassId = student.class_id;
      }
      let query = db.from("timetables").select("id,class_id,day_of_week,period_number,subject,teacher_name,file_url,classes(grade,section)").order("period_number",{ascending:true}).limit(200);
      if (studentClassId) {
        query = query.eq("class_id", studentClassId);
      } else if (currentRole === "teacher") {
        const [classAssignments, subjectAssignments] = await Promise.all([
          db.from("class_teachers").select("class_id").eq("teacher_id", auth.user.id),
          db.from("class_subject_teachers").select("class_id").eq("teacher_id", auth.user.id),
        ]);
        if (classAssignments.error || subjectAssignments.error) throw new Error("Could not verify your teaching assignments.");
        const classIds = [...new Set([...(classAssignments.data ?? []), ...(subjectAssignments.data ?? [])].map((row: {class_id:string}) => row.class_id))];
        if (!classIds.length) {
          setPeriods([]);
          setMessage("No classes are linked to your teacher account yet.");
          return;
        }
        query = query.in("class_id", classIds);
      }
      const { data, error } = await query;
      if (error) throw new Error("Timetable could not be loaded. Check the database permissions.");
      setPeriods((data ?? []) as Period[]);
      if (!(data ?? []).length) setMessage("No timetable entries are available to your account yet.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load timetable."); }
    finally { setBusy(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function addPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId || !newSubject.trim() || !classes.some((item) => item.id === classId) || saving) return;
    setSaving(true); setMessage("");
    try {
      const db = createClient();
      const { error } = await db.from("timetables").insert({ class_id: classId, day_of_week: newDay, period_number: Number(newPeriod), subject: newSubject.trim(), teacher_name: newTeacher.trim() || null });
      if (error) throw new Error("Could not add this period. Check your class-management permission and whether that period already exists.");
      setNewSubject(""); setNewTeacher(""); await load(); setMessage("Timetable period added.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to add timetable period."); }
    finally { setSaving(false); }
  }

  async function deletePeriod(period: Period) {
    if (!classes.some((item) => item.id === period.class_id) || saving) return;
    if (!window.confirm(`Delete period ${period.period_number} (${period.subject})?`)) return;
    setSaving(true); setMessage("");
    try {
      const { error } = await createClient().from("timetables").delete().eq("id", period.id);
      if (error) throw new Error("Could not delete this period. Database permissions rejected the change.");
      await load(); setMessage("Timetable period deleted.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to delete timetable period."); }
    finally { setSaving(false); }
  }
  const filtered = periods.filter((p) => day === "All days" || p.day_of_week.toLowerCase() === day.toLowerCase());

  return <main className="timetable-page"><header><a href="/dashboard" className="timetable-brand">KVSync <em>Pro</em></a><button type="button" onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header><section><div className="timetable-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div><div className="timetable-heading"><div><h1>Class timetable</h1><p>Class schedules available to your verified account.</p></div><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div><div className="timetable-verified"><ShieldCheck size={18}/><span><b>Role-checked schedule</b><small>{role ? role.replaceAll("_"," ") : "Checking role"} · Row Level Security remains active</small></span></div>{classes.length > 0 && <form className="timetable-manage-form" onSubmit={addPeriod}><div><h2>Manage timetable</h2><p>Add a period for a class you are authorized to manage.</p></div><label>Class<select value={classId} onChange={(e) => setClassId(e.target.value)} required><option value="">Choose class</option>{classes.map((item) => <option key={item.id} value={item.id}>Class {item.grade}-{item.section}</option>)}</select></label><label>Day<select value={newDay} onChange={(e) => setNewDay(e.target.value)}>{weekdays.map((item) => <option key={item}>{item}</option>)}</select></label><label>Period number<input type="number" min="1" max="15" value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} required /></label><label>Subject<input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} maxLength={80} required placeholder="e.g. Mathematics"/></label><label>Teacher name (optional)<input value={newTeacher} onChange={(e) => setNewTeacher(e.target.value)} maxLength={120} placeholder="Teacher name"/></label><button type="submit" disabled={saving || !classId || !newSubject.trim()}><Plus size={14}/>{saving ? "Saving…" : "Add period"}</button></form>}{message && !busy && <p className="timetable-feedback" role="status" aria-live="polite">{message}</p>}<div className="timetable-filters"><label htmlFor="timetable-day">View day</label><select id="timetable-day" value={day} onChange={(e) => setDay(e.target.value)}><option>All days</option>{weekdays.map((d) => <option key={d}>{d}</option>)}</select><span>{filtered.length} period(s)</span></div>{busy ? <div className="timetable-empty">Loading timetable securely…</div> : filtered.length ? <div className="timetable-list">{filtered.map((p) => <article className="timetable-period" key={p.id}><div className="timetable-period-number">{String(p.period_number).padStart(2,"0")}</div><div className="timetable-period-copy"><span>{p.day_of_week}</span><h2>{p.subject}</h2><p>{p.teacher_name || "Teacher not listed"}</p></div><div className="timetable-period-class">{p.classes?.[0] ? `Class ${p.classes[0].grade}-${p.classes[0].section}` : `Class ID ${p.class_id.slice(0,8)}…`}</div>{p.file_url && <a href={p.file_url} target="_blank" rel="noreferrer">Open schedule ↗</a>}{classes.some((item) => item.id === p.class_id) && <button type="button" className="timetable-delete" onClick={() => void deletePeriod(p)} disabled={saving} aria-label={`Delete period ${p.period_number} ${p.subject}`}><Trash2 size={14}/> Delete</button>}</article>)}</div> : <div className="timetable-empty" role="status" aria-live="polite"><CalendarDays size={22}/><p>{message || "No periods for this day."}</p></div>}<p className="timetable-caveat">Only Operator, Administrator, and assigned class teachers see management controls. Database row-level security remains the final authority for every change.</p></section></main>;
}
