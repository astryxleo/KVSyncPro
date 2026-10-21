"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, ShieldCheck, Save, CalendarDays, Users } from "lucide-react";
import { createClient } from "@/lib/supabase";

type Role = "operator" | "admin" | "teacher" | "student";
type SchoolClass = { id: string; grade: number; section: string; room_number?: string | null };
type Student = { id: string; user_id: string; class_id: string; roll_number: string };
type AttendanceStatus = "present" | "absent" | "late" | "excused";
type RecordRow = { id: string; attendance_date: string; status: AttendanceStatus; note: string | null; class_id: string; student_id: string; marked_by: string };
type Draft = { status: "" | AttendanceStatus; note: string };
const statuses: AttendanceStatus[] = ["present", "absent", "late", "excused"];
const todayLocal = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
};

export default function AttendancePage() {
  const router = useRouter();
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [userId, setUserId] = useState("");
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const canMark = role === "operator" || role === "admin" || role === "teacher";
  const selectedClass = useMemo(() => classes.find((item) => item.id === classId), [classes, classId]);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      setUserId(auth.user.id);

      const { data: roleRows, error: roleError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (roleError) throw new Error("Role verification failed. Attendance is hidden.");
      const assigned = (roleRows ?? []).map((row: { role: string }) => row.role);
      const currentRole = (["operator", "admin", "teacher", "student"] as const).find((item) => assigned.includes(item));
      if (!currentRole) throw new Error("Your assigned role does not include attendance access.");
      setRole(currentRole);

      if (currentRole === "student") {
        const { data: student, error: studentError } = await db.from("students").select("id,user_id,class_id,roll_number").eq("user_id", auth.user.id).maybeSingle();
        if (studentError) throw new Error("Could not verify your student profile.");
        if (!student) { setRows([]); setStudents([]); setMessage("Your student profile is not linked yet. Ask the operator to complete account provisioning."); return; }
        const { data, error } = await db.from("attendance").select("id,attendance_date,status,note,class_id,student_id,marked_by").eq("student_id", student.id).order("attendance_date", { ascending: false }).limit(100);
        if (error) throw new Error("Could not load attendance. Database row-level security remains in force.");
        setRows((data ?? []) as RecordRow[]);
        setClasses([]);
        setStudents([]);
        setDrafts({});
        if (!(data ?? []).length) setMessage("No attendance records are available to your account yet.");
        return;
      }

      let classQuery = db.from("classes").select("id,grade,section,room_number").order("grade").order("section");
      if (currentRole === "teacher") {
        const { data: assignmentRows, error: assignmentError } = await db.from("class_teachers").select("class_id").eq("teacher_id", auth.user.id);
        if (assignmentError) throw new Error("Could not verify your class-teacher assignment.");
        const ids = [...new Set((assignmentRows ?? []).map((row: { class_id: string }) => row.class_id))];
        if (!ids.length) { setClasses([]); setStudents([]); setRows([]); setMessage("No classes are linked to your teacher account yet."); return; }
        classQuery = classQuery.in("id", ids);
      }
      const { data: classRows, error: classError } = await classQuery;
      if (classError) throw new Error("Class list could not be loaded.");
      const availableClasses = (classRows ?? []) as SchoolClass[];
      setClasses(availableClasses);
      if (!availableClasses.length) { setStudents([]); setRows([]); setMessage("No class records are available to this account yet."); return; }
      const chosenClassId = availableClasses.some((item) => item.id === classId) ? classId : availableClasses[0].id;
      if (chosenClassId !== classId) setClassId(chosenClassId);

      const { data: rosterRows, error: rosterError } = await db.from("students").select("id,user_id,class_id,roll_number").eq("class_id", chosenClassId).order("roll_number");
      if (rosterError) throw new Error("Student roster could not be loaded under your assigned permissions.");
      const roster = (rosterRows ?? []) as Student[];
      setStudents(roster);

      if (currentRole === "operator" || currentRole === "admin") {
        const userIds = [...new Set(roster.map((item) => item.user_id))];
        if (userIds.length) {
          const { data: profiles, error: profilesError } = await db.from("profiles").select("user_id,full_name").in("user_id", userIds);
          if (!profilesError) {
            const names: Record<string, string> = {};
            for (const profile of (profiles ?? []) as { user_id: string; full_name: string | null }[]) if (profile.full_name) names[profile.user_id] = profile.full_name;
            setStudentNames(names);
          } else setStudentNames({});
        } else setStudentNames({});
      } else setStudentNames({});

      const { data: dayRows, error: attendanceError } = await db.from("attendance").select("id,attendance_date,status,note,class_id,student_id,marked_by").eq("class_id", chosenClassId).eq("attendance_date", date).order("student_id");
      if (attendanceError) throw new Error("Attendance for the selected class and date could not be loaded.");
      const records = (dayRows ?? []) as RecordRow[];
      setRows(records);
      const byStudent: Record<string, Draft> = {};
      for (const record of records) byStudent[record.student_id] = { status: record.status, note: record.note ?? "" };
      setDrafts((previous) => {
        const next: Record<string, Draft> = {};
        for (const student of roster) next[student.id] = byStudent[student.id] ?? { status: "", note: "" };
        return next;
      });
      if (!roster.length) setMessage("This class has no linked student accounts yet.");
      else if (!records.length) setMessage("No attendance has been recorded for this class and date. Select a status for each student, then save.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load attendance.");
    } finally {
      setBusy(false);
    }
  }, [router, classId, date]);

  useEffect(() => { void load(); }, [load]);

  function updateDraft(studentId: string, patch: Partial<Draft>) {
    setDrafts((previous) => ({ ...previous, [studentId]: { ...(previous[studentId] ?? { status: "", note: "" }), ...patch } }));
  }

  async function saveAttendance() {
    if (!canMark || !classId || !userId) return;
    const pending = students.filter((student) => drafts[student.id]?.status);
    if (!pending.length) { setMessage("Choose a status for at least one student before saving."); return; }
    setSaving(true);
    setMessage("");
    try {
      const db = createClient();
      const payload = pending.map((student) => ({
        student_id: student.id,
        class_id: classId,
        attendance_date: date,
        status: drafts[student.id].status as AttendanceStatus,
        note: drafts[student.id].note.trim() || null,
        marked_by: userId,
      }));
      const { error } = await db.from("attendance").upsert(payload, { onConflict: "student_id,attendance_date" });
      if (error) throw new Error("Save was rejected by the database. Confirm your class assignment and allowed attendance permissions.");
      await load();
      setMessage("Attendance saved successfully. Existing entries were updated; unselected students were left unchanged.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Attendance could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="attendance-page">
    <header><a href="/dashboard" className="attendance-logo">KVSync <em>Pro</em></a><button onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header>
    <section>
      <div className="attendance-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div>
      <h1>Attendance records</h1>
      <p className="attendance-intro">Class-scoped attendance. Database row-level security decides which records your account can read or change.</p>
      <div className="attendance-verified"><ShieldCheck size={18}/><span><b>Role verified</b><small>{role ? role.replaceAll("_", " ") : "Checking your assigned role"}{canMark ? " · Marking enabled for authorized classes" : ""}</small></span><button onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div>

      {canMark && <div className="attendance-controls">
        <label><span><Users size={14}/> Class</span><select value={classId} onChange={(event) => setClassId(event.target.value)} disabled={busy || !classes.length}><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.grade}-{item.section}{item.room_number ? " · Room " + item.room_number : ""}</option>)}</select></label>
        <label><span><CalendarDays size={14}/> Attendance date</span><input type="date" value={date} max={todayLocal()} onChange={(event) => setDate(event.target.value)} disabled={busy}/></label>
      </div>}

      {busy ? <div className="attendance-message">Loading attendance securely…</div> : <>
        {canMark && classId && <div className="attendance-roster">
          <div className="attendance-roster-heading"><div><h2>{selectedClass ? selectedClass.grade + "-" + selectedClass.section : "Class roster"}</h2><p>Choose a status per student. Leave a row unselected to make no change.</p></div><button onClick={() => void saveAttendance()} disabled={saving || !students.length}><Save size={14}/>{saving ? "Saving…" : "Save attendance"}</button></div>
          {!students.length ? <div className="attendance-message">No students are linked to this class.</div> : students.map((student) => {
            const draft = drafts[student.id] ?? { status: "", note: "" };
            return <div className="attendance-roster-row" key={student.id}>
              <div className="attendance-student"><strong>{studentNames[student.user_id] || "Student"}</strong><small>Roll no. {student.roll_number}</small></div>
              <select aria-label={"Attendance status for roll number " + student.roll_number} value={draft.status} onChange={(event) => updateDraft(student.id, { status: event.target.value as Draft["status"] })}><option value="">Not marked</option>{statuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select>
              <input aria-label={"Attendance note for roll number " + student.roll_number} maxLength={500} value={draft.note} onChange={(event) => updateDraft(student.id, { note: event.target.value })} placeholder="Optional note (max 500 chars)"/>
              {rows.some((record) => record.student_id === student.id) && <small className="attendance-existing">Previously saved</small>}
            </div>;
          })}
          <div className="attendance-roster-footer">Only selected rows are saved. Existing records for selected students are updated.</div>
        </div>}
        {!canMark && (message ? <div className="attendance-message">{message}</div> : <div className="attendance-records"><div className="attendance-record-head"><span>Date</span><span>Status</span><span>Class ID</span><span>Student ID</span><span>Note</span></div>{rows.map((record) => <div className="attendance-record" key={record.id}><span>{new Date(record.attendance_date + "T12:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span><span className={"attendance-chip " + record.status}>{record.status}</span><code>{record.class_id.slice(0, 8)}…</code><code>{record.student_id.slice(0, 8)}…</code><span>{record.note || "—"}</span></div>)}<footer>{rows.length} record(s) loaded</footer></div>)}
        {canMark && message && <div role="status" className="attendance-message attendance-status-message">{message}</div>}
      </>}
      <p className="attendance-caveat">{canMark ? "Only assigned teachers, administrators, and the Operator can save attendance. Database policies validate class access and student/class matching." : "This view is read-only. Your records are restricted to your linked student account."}</p>
    </section>
  </main>;
}
