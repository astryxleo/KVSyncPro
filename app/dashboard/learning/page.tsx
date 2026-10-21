"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase";

type Homework = { id: string; title: string; subject: string; description: string | null; deadline: string | null; created_at: string };
type Material = { id: string; title: string; subject: string; file_url: string; file_type: string | null };

export default function LearningPage() {
  const router = useRouter();
  const [homework, setHomework] = useState<Homework[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
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
      if (roleError) throw new Error("Role verification failed. Learning content is hidden.");
      const assigned = (roles ?? []).map((r: {role:string}) => r.role);
      const allowed = ["operator","admin","teacher","student","data_content_manager"].find((r) => assigned.includes(r));
      if (!allowed) throw new Error("Your assigned role does not include learning-hub access.");
      setRole(allowed);
      let classId = "";
      if (allowed === "student") {
        const { data: student, error } = await db.from("students").select("class_id").eq("user_id", auth.user.id).maybeSingle();
        if (error) throw new Error("Could not verify your class assignment.");
        if (!student?.class_id) { setMessage("Your student profile or class is not linked yet. Ask the operator to complete account provisioning."); return; }
        classId = student.class_id;
      }
      let homeworkQuery = db.from("homework").select("id,title,subject,description,deadline,created_at").order("created_at",{ascending:false}).limit(100);
      let materialQuery = db.from("study_materials").select("id,title,subject,file_url,file_type").limit(100);
      if (classId) {
        homeworkQuery = homeworkQuery.eq("class_id", classId);
        materialQuery = materialQuery.eq("class_id", classId);
      }
      const [hw, mats] = await Promise.all([homeworkQuery, materialQuery]);
      if (hw.error) throw new Error("Homework could not be loaded. Check the assigned database permissions.");
      if (mats.error) throw new Error("Study materials could not be loaded. Check the assigned database permissions.");
      setHomework((hw.data ?? []) as Homework[]);
      setMaterials((mats.data ?? []) as Material[]);
      if (!(hw.data ?? []).length && !(mats.data ?? []).length) setMessage("No homework or study materials are available yet.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load learning content."); }
    finally { setBusy(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  return <main className="learning-page"><header><a className="learning-brand" href="/dashboard">KVSync <em>Pro</em></a><button onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header><section><div className="learning-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div><div className="learning-title-row"><div><h1>Learning hub</h1><p>Homework and study resources available to your signed-in role.</p></div><button className="learning-refresh" onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div><div className="learning-verified"><ShieldCheck size={18}/><span><b>Role-checked content</b><small>{role ? role.replaceAll("_"," ") : "Checking role"} · Database row policies remain active</small></span></div>{busy ? <div className="learning-message">Loading learning resources securely…</div> : message && !homework.length && !materials.length ? <div className="learning-message">{message}</div> : <><div className="learning-grid"><article className="learning-panel"><div className="learning-panel-head"><span><BookOpen size={18}/></span><div><h2>Homework</h2><p>{homework.length} item(s) available</p></div></div>{homework.length ? homework.map((item) => <div className="learning-item" key={item.id}><div><span className="learning-subject">{item.subject || "General"}</span><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</div><small>{item.deadline ? "Due "+new Date(item.deadline).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "No deadline listed"}</small></div>) : <p className="learning-empty">No homework items are visible to this account.</p>}</article><article className="learning-panel"><div className="learning-panel-head"><span><FileText size={18}/></span><div><h2>Study materials</h2><p>{materials.length} resource(s) available</p></div></div>{materials.length ? materials.map((item) => <div className="learning-item material" key={item.id}><div><span className="learning-subject">{item.subject || "General"}{item.file_type ? " · "+item.file_type : ""}</span><h3>{item.title}</h3></div><a href={item.file_url} target="_blank" rel="noreferrer">Open resource ↗</a></div>) : <p className="learning-empty">No study materials are visible to this account.</p>}</article></div>{message && <div className="learning-inline-message">{message}</div>}</>}<p className="learning-caveat">This hub is read-only for now. Upload, edit, submission tracking and signed-download flows will be enabled after storage and classroom permissions are tested.</p></section></main>;
}
