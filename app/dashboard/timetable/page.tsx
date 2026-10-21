"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, RefreshCw, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase";

type Period = { id: string; class_id: string; day_of_week: string; period_number: number; subject: string; teacher_name: string | null; file_url: string | null; classes?: { grade: number; section: string } | null };
const weekdays = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export default function TimetablePage() {
  const router = useRouter();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [day, setDay] = useState("All days");
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
      if (roleError) throw new Error("Role verification failed. Timetable is hidden.");
      const assigned = (roleRows ?? []).map((r: {role:string}) => r.role);
      const currentRole = ["operator","admin","teacher","student"].find((r) => assigned.includes(r));
      if (!currentRole) throw new Error("Your assigned role does not include timetable access.");
      setRole(currentRole);
      let classId = "";
      if (currentRole === "student") {
        const { data: student, error } = await db.from("students").select("class_id").eq("user_id", auth.user.id).maybeSingle();
        if (error) throw new Error("Could not verify your class assignment.");
        if (!student?.class_id) { setMessage("Your student profile or class is not linked yet. Ask the operator to complete account provisioning."); return; }
        classId = student.class_id;
      }
      let query = db.from("timetables").select("id,class_id,day_of_week,period_number,subject,teacher_name,file_url,classes(grade,section)").order("period_number",{ascending:true}).limit(200);
      if (classId) {
        query = query.eq("class_id", classId);
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
  const filtered = periods.filter((p) => day === "All days" || p.day_of_week.toLowerCase() === day.toLowerCase());

  return <main className="timetable-page"><header><a href="/dashboard" className="timetable-brand">KVSync <em>Pro</em></a><button onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header><section><div className="timetable-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div><div className="timetable-heading"><div><h1>Class timetable</h1><p>Class schedules available to your verified account.</p></div><button onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div><div className="timetable-verified"><ShieldCheck size={18}/><span><b>Role-checked schedule</b><small>{role ? role.replaceAll("_"," ") : "Checking role"} · Row Level Security remains active</small></span></div><div className="timetable-filters"><label htmlFor="timetable-day">View day</label><select id="timetable-day" value={day} onChange={(e) => setDay(e.target.value)}><option>All days</option>{weekdays.map((d) => <option key={d}>{d}</option>)}</select><span>{filtered.length} period(s)</span></div>{busy ? <div className="timetable-empty">Loading timetable securely…</div> : filtered.length ? <div className="timetable-list">{filtered.map((p) => <article className="timetable-period" key={p.id}><div className="timetable-period-number">{String(p.period_number).padStart(2,"0")}</div><div className="timetable-period-copy"><span>{p.day_of_week}</span><h2>{p.subject}</h2><p>{p.teacher_name || "Teacher not listed"}</p></div><div className="timetable-period-class">{p.classes ? `Class ${p.classes.grade}-${p.classes.section}` : `Class ID ${p.class_id.slice(0,8)}…`}</div>{p.file_url && <a href={p.file_url} target="_blank" rel="noreferrer">Open schedule ↗</a>}</article>)}</div> : <div className="timetable-empty"><CalendarDays size={22}/><p>{message || "No periods for this day."}</p></div>}<p className="timetable-caveat">This schedule view is read-only. Creating and editing periods requires verified management permissions and school-approved timetable rules.</p></section></main>;
}
