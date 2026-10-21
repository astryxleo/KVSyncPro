"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase";

type RecordRow = { id: string; attendance_date: string; status: string; note: string | null; class_id: string; student_id: string };

export default function AttendancePage() {
  const router = useRouter();
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading attendance securely…");
  const [role, setRole] = useState("");

  async function load() {
    setBusy(true); setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      const { data: roles, error: rolesError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (rolesError) throw new Error("Role verification failed. Attendance is hidden.");
      const assigned = (roles ?? []).map((r: {role:string}) => r.role);
      const currentRole = ["operator","admin","teacher","student"].find((r) => assigned.includes(r));
      if (!currentRole) throw new Error("Your assigned role does not include attendance access.");
      setRole(currentRole);
      let q = db.from("attendance").select("id,attendance_date,status,note,class_id,student_id").order("attendance_date", {ascending:false}).limit(100);
      if (currentRole === "student") {
        const { data: student, error } = await db.from("students").select("id").eq("user_id", auth.user.id).maybeSingle();
        if (error) throw new Error("Could not verify your student profile.");
        if (!student) { setRows([]); setMessage("Your student profile is not linked yet. Ask the operator to complete account provisioning."); return; }
        q = q.eq("student_id", student.id);
      }
      const { data, error } = await q;
      if (error) throw new Error("Could not load records. Supabase row-level security remains in force.");
      setRows((data ?? []) as RecordRow[]);
      if (!(data ?? []).length) setMessage("No attendance records are available to your account yet.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load attendance."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  return <main className="attendance-page"><header><a href="/dashboard" className="attendance-logo">KVSync <em>Pro</em></a><button onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header><section><div className="attendance-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div><h1>Attendance records</h1><p className="attendance-intro">Read-only attendance view. Supabase Row Level Security controls which records your account can see.</p><div className="attendance-verified"><ShieldCheck size={18}/><span><b>Role verified</b><small>{role ? role.replaceAll("_"," ") : "Checking your assigned role"}</small></span><button onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div>{busy ? <div className="attendance-message">{message}</div> : message ? <div className="attendance-message">{message}</div> : <div className="attendance-records"><div className="attendance-record-head"><span>Date</span><span>Status</span><span>Class</span><span>Student</span><span>Note</span></div>{rows.map((r) => <div className="attendance-record" key={r.id}><span>{new Date(r.attendance_date+"T12:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</span><span className={"attendance-chip "+r.status.toLowerCase()}>{r.status}</span><code>{r.class_id.slice(0,8)}…</code><code>{r.student_id.slice(0,8)}…</code><span>{r.note || "—"}</span></div>)}<footer>{rows.length} record(s) loaded</footer></div>}<p className="attendance-caveat">Marking and editing are intentionally disabled until class-roster and status-value checks are completed end-to-end.</p></section></main>;
}
