"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Plus, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { createClient } from "@/lib/supabase";

type SchoolRole = "operator" | "admin" | "teacher";
type SchoolClass = { id: string; grade: number; section: string; room_number: string | null };
type StudentRow = { id: string; user_id: string; class_id: string; roll_number: string };
type ProfileRow = { user_id: string; full_name: string | null; email?: string | null };
type TeacherRow = { user_id: string; full_name: string | null; email: string | null };
type ClassTeacherRow = { id: string; class_id: string; teacher_id: string; academic_year: string };

export default function ClassesPage() {
  const router = useRouter();
  const [role, setRole] = useState<SchoolRole | "">("");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [classTeachers, setClassTeachers] = useState<ClassTeacherRow[]>([]);
  const [assignmentClass, setAssignmentClass] = useState("");
  const [assignmentTeacher, setAssignmentTeacher] = useState("");
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newGrade, setNewGrade] = useState("6");
  const [newSection, setNewSection] = useState("A");
  const [newRoom, setNewRoom] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) {
        router.replace("/");
        return;
      }

      const { data: roleRows, error: roleError } = await db
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.user.id);
      if (roleError) throw new Error("Role verification failed. Class records are hidden.");

      const assigned = (roleRows ?? []).map((row: { role: string }) => row.role);
      const currentRole = (["operator", "admin", "teacher"] as const).find((item) => assigned.includes(item));
      if (!currentRole) throw new Error("Your assigned role does not include class-directory access.");
      setRole(currentRole);

      let allowedClassIds: string[] | null = null;
      if (currentRole === "teacher") {
        const [homeroom, subject] = await Promise.all([
          db.from("class_teachers").select("class_id").eq("teacher_id", auth.user.id),
          db.from("class_subject_teachers").select("class_id").eq("teacher_id", auth.user.id),
        ]);
        if (homeroom.error || subject.error) throw new Error("Teaching assignments could not be verified.");
        allowedClassIds = [...new Set([
          ...(homeroom.data ?? []).map((row: { class_id: string }) => row.class_id),
          ...(subject.data ?? []).map((row: { class_id: string }) => row.class_id),
        ])];
        if (!allowedClassIds.length) {
          setClasses([]);
          setStudents([]);
          setNames({});
          setMessage("No classes are linked to your teacher account yet.");
          return;
        }
      }

      let classQuery = db.from("classes").select("id,grade,section,room_number").order("grade").order("section");
      let studentQuery = db.from("students").select("id,user_id,class_id,roll_number").order("roll_number");
      if (allowedClassIds) {
        classQuery = classQuery.in("id", allowedClassIds);
        studentQuery = studentQuery.in("class_id", allowedClassIds);
      }

      const [classResult, studentResult] = await Promise.all([classQuery, studentQuery]);
      if (classResult.error) throw new Error("Class records could not be loaded.");
      if (studentResult.error) throw new Error("Student roster could not be loaded under your assigned permissions.");

      const nextClasses = (classResult.data ?? []) as SchoolClass[];
      const nextStudents = (studentResult.data ?? []) as StudentRow[];
      setClasses(nextClasses);
      setStudents(nextStudents);

      if (currentRole === "operator" || currentRole === "admin") {
        const [teacherRoleResult, assignmentResult] = await Promise.all([
          db.from("user_roles").select("user_id").eq("role", "teacher"),
          db.from("class_teachers").select("id,class_id,teacher_id,academic_year").order("academic_year", { ascending: false }),
        ]);
        if (teacherRoleResult.error || assignmentResult.error) throw new Error("Teacher assignments could not be loaded.");
        const teacherIds = [...new Set((teacherRoleResult.data ?? []).map((row: { user_id: string }) => row.user_id))];
        const assignmentRows = (assignmentResult.data ?? []) as ClassTeacherRow[];
        setClassTeachers(assignmentRows);
        if (teacherIds.length) {
          const { data: teacherProfiles, error: teacherProfilesError } = await db
            .from("profiles").select("user_id,full_name,email").in("user_id", teacherIds);
          if (teacherProfilesError) throw new Error("Teacher directory could not be loaded.");
          setTeachers((teacherProfiles ?? []) as TeacherRow[]);
        } else {
          setTeachers([]);
        }
      } else {
        setTeachers([]);
        setClassTeachers([]);
      }

      if (currentRole === "operator" || currentRole === "admin") {
        const userIds = [...new Set(nextStudents.map((student) => student.user_id))];
        if (userIds.length) {
          const { data: profileRows, error: profileError } = await db
            .from("profiles")
            .select("user_id,full_name")
            .in("user_id", userIds);
          if (profileError) throw new Error("Student names could not be loaded.");
          const nextNames: Record<string, string> = {};
          for (const profile of (profileRows ?? []) as ProfileRow[]) {
            if (profile.full_name) nextNames[profile.user_id] = profile.full_name;
          }
          setNames(nextNames);
        } else {
          setNames({});
        }
      } else {
        // Teacher profile access is intentionally not widened here; roster rows remain class-scoped.
        setNames({});
      }

      if (!nextClasses.length) setMessage("No class records are available to this account yet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load the class directory.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  const createClass = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (role !== "operator" && role !== "admin") {
      setMessage("Only Operator or Admin can create classes.");
      return;
    }
    const grade = Number(newGrade);
    const section = newSection.trim().toUpperCase();
    const room = newRoom.trim();
    if (!Number.isInteger(grade) || grade < 1 || grade > 12 || !["A", "B", "C", "D"].includes(section)) {
      setMessage("Choose a grade from 1–12 and a section from A–D.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) {
        router.replace("/");
        return;
      }
      const { data: roleRows, error: roleError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (roleError || !(roleRows ?? []).some((row: { role: string }) => ["operator", "admin"].includes(row.role))) {
        throw new Error("Class creation is restricted to Operator and Admin accounts.");
      }
      const { error } = await db.from("classes").insert({
        grade,
        section,
        room_number: room || null,
      });
      if (error) {
        if (error.code === "23505") throw new Error(`Class ${grade}${section} already exists.`);
        if (error.code === "42501") throw new Error("Database permissions do not allow this class creation.");
        throw new Error("Could not create the class. Check the details and try again.");
      }
      setShowCreate(false);
      setNewRoom("");
      setMessage(`Class ${grade}${section} created successfully.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create this class.");
    } finally {
      setSaving(false);
    }
  };

  const assignHomeroomTeacher = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ((role !== "operator" && role !== "admin") || !assignmentClass || !assignmentTeacher) return;
    setAssignmentBusy(true);
    setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      const { data: roleRows, error: roleError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (roleError || !(roleRows ?? []).some((row: { role: string }) => ["operator", "admin"].includes(row.role))) {
        throw new Error("Only Operator or Admin can manage homeroom assignments.");
      }
      const { error } = await db.from("class_teachers").insert({ class_id: assignmentClass, teacher_id: assignmentTeacher });
      if (error) {
        if (error.code === "23505") throw new Error("This class already has a homeroom teacher assigned for the academic year.");
        if (error.code === "42501") throw new Error("Database permissions do not allow this assignment.");
        throw new Error("Could not assign the teacher. Check that the account has the Teacher role.");
      }
      setAssignmentClass("");
      setAssignmentTeacher("");
      setMessage("Homeroom teacher assigned successfully.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to assign this teacher.");
    } finally {
      setAssignmentBusy(false);
    }
  };

  const removeHomeroomTeacher = async (assignment: ClassTeacherRow) => {
    if (role !== "operator" && role !== "admin") return;
    if (!window.confirm("Remove this homeroom teacher assignment?")) return;
    setAssignmentBusy(true);
    setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      const { data: roleRows, error: roleError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (roleError || !(roleRows ?? []).some((row: { role: string }) => ["operator", "admin"].includes(row.role))) {
        throw new Error("Only Operator or Admin can manage homeroom assignments.");
      }
      const { error } = await db.from("class_teachers").delete().eq("id", assignment.id);
      if (error) throw new Error("Could not remove the assignment under current database permissions.");
      setMessage("Homeroom assignment removed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove this assignment.");
    } finally {
      setAssignmentBusy(false);
    }
  };

  useEffect(() => { void load(); }, [load]);

  const visibleClasses = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return classes;
    return classes.filter((schoolClass) => {
      const classLabel = `${schoolClass.grade}${schoolClass.section}`;
      const roster = students.filter((student) => student.class_id === schoolClass.id);
      return [classLabel, schoolClass.room_number ?? "", ...roster.map((student) =>
        `${student.roll_number} ${names[student.user_id] ?? ""}`,
      )].some((value) => value.toLowerCase().includes(term));
    });
  }, [classes, names, search, students]);

  return (
    <main className="classes-page">
      <header>
        <a className="classes-brand" href="/dashboard">KVSync <em>Pro</em></a>
        <button onClick={() => router.push("/dashboard")}><ArrowLeft size={15} /> Overview</button>
      </header>
      <section>
        <div className="classes-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div>
        <div className="classes-heading">
          <div>
            <h1>Classes &amp; people</h1>
            <p>Class directory and student roster visible to your verified school role.</p>
          </div>
          <button onClick={() => void load()} disabled={busy}><RefreshCw size={14} /> Refresh</button>
        </div>
        <div className="classes-verified">
          <ShieldCheck size={18} />
          <span><b>Role-checked school records</b><small>{role ? role.replaceAll("_", " ") : "Checking role"} · Database row policies remain active</small></span>
        </div>
        {(role === "operator" || role === "admin") && (
          <div className="classes-create-area">
            <button className="classes-create-toggle" onClick={() => { setShowCreate((value) => !value); setMessage(""); }}>
              <Plus size={15} /> {showCreate ? "Cancel" : "Create class"}
            </button>
            {showCreate && (
              <form className="classes-create-form" onSubmit={createClass}>
                <label>Grade
                  <select value={newGrade} onChange={(event) => setNewGrade(event.target.value)} required>
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                  </select>
                </label>
                <label>Section
                  <select value={newSection} onChange={(event) => setNewSection(event.target.value)} required>
                    {["A", "B", "C", "D"].map((section) => <option key={section} value={section}>{section}</option>)}
                  </select>
                </label>
                <label>Room number <span>(optional)</span>
                  <input value={newRoom} onChange={(event) => setNewRoom(event.target.value)} maxLength={30} placeholder="e.g. 204" />
                </label>
                <button type="submit" disabled={saving || busy}>{saving ? "Creating…" : "Create class"}</button>
              </form>
            )}
          </div>
        )}
        <div className="classes-stats">
          <article><span><Building2 size={17} /></span><div><strong>{classes.length}</strong><small>Classes visible</small></div></article>
          <article><span><Users size={17} /></span><div><strong>{students.length}</strong><small>Student records visible</small></div></article>
        </div>
        <label className="classes-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search class, room, roll number or student name" />
        </label>
        {busy ? <div className="classes-empty">Loading class records securely…</div> : message && !classes.length ? <div className="classes-empty">{message}</div> : visibleClasses.length ? (
          <div className="classes-grid">
            {visibleClasses.map((schoolClass) => {
              const roster = students.filter((student) => student.class_id === schoolClass.id);
              return (
                <article className="classes-card" key={schoolClass.id}>
                  <div className="classes-card-top">
                    <span className="classes-class-icon"><Building2 size={19} /></span>
                    <span className="classes-room">{schoolClass.room_number ? `Room ${schoolClass.room_number}` : "Room not assigned"}</span>
                  </div>
                  <h2>Class {schoolClass.grade}<span>{schoolClass.section}</span></h2>
                  <p>{roster.length} student record{roster.length === 1 ? "" : "s"}</p>
                  {(role === "operator" || role === "admin") && (() => {
                    const assignment = classTeachers.find((item) => item.class_id === schoolClass.id);
                    const teacher = assignment ? teachers.find((item) => item.user_id === assignment.teacher_id) : null;
                    return (
                      <div className="classes-assignment">
                        <div className="classes-assignment-heading">Homeroom teacher</div>
                        {assignment ? (
                          <div className="classes-assigned-teacher">
                            <span>{teacher?.full_name || teacher?.email || "Assigned teacher"}</span>
                            <button type="button" disabled={assignmentBusy} onClick={() => void removeHomeroomTeacher(assignment)}>Remove</button>
                          </div>
                        ) : (
                          <form className="classes-assignment-form" onSubmit={assignHomeroomTeacher}>
                            <select aria-label={`Teacher for class ${schoolClass.grade}${schoolClass.section}`} value={assignmentClass === schoolClass.id ? assignmentTeacher : ""} onChange={(event) => { setAssignmentClass(schoolClass.id); setAssignmentTeacher(event.target.value); }} required>
                              <option value="">Select teacher</option>
                              {teachers.map((item) => <option key={item.user_id} value={item.user_id}>{item.full_name || item.email || item.user_id}</option>)}
                            </select>
                            <button type="submit" disabled={assignmentBusy || !teachers.length} onClick={() => setAssignmentClass(schoolClass.id)}>{assignmentBusy ? "Saving…" : "Assign"}</button>
                          </form>
                        )}
                      </div>
                    );
                  })()}
                  {roster.length ? (
                    <div className="classes-roster">
                      {roster.slice(0, 8).map((student) => (
                        <div key={student.id}>
                          <span className="classes-student-mark">{(student.roll_number || "?").slice(0, 2)}</span>
                          <span className="classes-student-name">{names[student.user_id] ?? (role === "teacher" ? "Student record" : "Name not linked")}</span>
                          <small>Roll {student.roll_number || "—"}</small>
                        </div>
                      ))}
                      {roster.length > 8 && <small className="classes-more">+ {roster.length - 8} more student record(s)</small>}
                    </div>
                  ) : <div className="classes-roster-empty">No student records visible for this class.</div>}
                </article>
              );
            })}
          </div>
        ) : <div className="classes-empty">No classes match your search.</div>}
        <p className="classes-caveat">Teacher homeroom assignment and class creation are available to Operator/Admin and remain enforced by database policies. Student roster edits and account provisioning are not enabled here.</p>
      </section>
    </main>
  );
}
