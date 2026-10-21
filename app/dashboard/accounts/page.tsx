"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, MailPlus, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase";

type AppRole = "operator" | "admin" | "teacher" | "student" | "system_moderator" | "data_content_manager" | "tester" | "support_manager";
type SchoolClass = { id: string; grade: number; section: string };

const roleNames: Record<AppRole, string> = {
  operator: "Operator",
  admin: "Administrator",
  teacher: "Teacher",
  student: "Student",
  system_moderator: "System Moderator",
  data_content_manager: "Data & Content Manager",
  tester: "Tester",
  support_manager: "Support Manager",
};

export default function AccountsPage() {
  const router = useRouter();
  const [actorRoles, setActorRoles] = useState<AppRole[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("student");
  const [classId, setClassId] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  const isOperator = actorRoles.includes("operator");
  const canCreate = actorRoles.some((item) => ["operator", "admin", "data_content_manager"].includes(item));
  const roleOptions = useMemo<AppRole[]>(() => isOperator
    ? ["admin", "teacher", "student", "system_moderator", "data_content_manager", "tester", "support_manager"]
    : ["teacher", "student"], [isOperator]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const db = createClient();
      const { data: { user }, error: authError } = await db.auth.getUser();
      if (authError || !user) {
        router.replace("/");
        return;
      }
      const { data: roleRows, error: roleError } = await db.from("user_roles").select("role").eq("user_id", user.id);
      if (roleError) throw new Error("Your permissions could not be verified.");
      const roles = (roleRows ?? []).map((row: { role: string }) => row.role as AppRole);
      if (!roles.some((item) => ["operator", "admin", "data_content_manager"].includes(item))) {
        router.replace("/dashboard");
        return;
      }
      setActorRoles(roles);
      const { data: classRows, error: classError } = await db.from("classes").select("id,grade,section").order("grade").order("section");
      if (classError) throw new Error("Class list could not be loaded.");
      setClasses((classRows ?? []) as SchoolClass[]);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not load account provisioning." });
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!roleOptions.includes(role)) setRole(roleOptions[0] ?? "student");
  }, [role, roleOptions]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!canCreate) {
      setMessage({ kind: "error", text: "Your role cannot provision accounts." });
      return;
    }
    if (role === "operator") {
      setMessage({ kind: "error", text: "Operator accounts require a separate trusted provisioning process." });
      return;
    }
    if (role === "student" && (!classId || !rollNumber.trim())) {
      setMessage({ kind: "error", text: "Choose a class and enter the student's roll number." });
      return;
    }
    setSaving(true);
    try {
      const db = createClient();
      const { data: { session }, error: sessionError } = await db.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error("Your session expired. Sign in again.");
      const { data, error } = await db.functions.invoke("manage-users", {
        body: {
          action: "create_user",
          email: email.trim().toLowerCase(),
          full_name: fullName.trim(),
          role,
          class_id: role === "student" ? classId : null,
          roll_number: role === "student" ? rollNumber.trim() : null,
        },
      });
      if (error) {
        const detail = typeof data?.error === "string" ? data.error : error.message;
        throw new Error(detail || "Account invitation failed.");
      }
      if (data?.error) throw new Error(String(data.error));
      setMessage({
        kind: "success",
        text: `Account created: ${email.trim().toLowerCase()} | Temporary password: ${data.temporary_password} | Share these credentials privately. The password is shown only now; no email was sent.`,
      });
      setFullName("");
      setEmail("");
      setClassId("");
      setRollNumber("");
      setRole("student");
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Account could not be created." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="accounts-page"><div className="accounts-loading">Verifying account permissions…</div></main>;

  return (
    <main className="accounts-page">
      <header className="accounts-topbar">
        <a className="accounts-brand" href="/dashboard">KVSync <em>Pro</em></a>
        <button type="button" onClick={() => router.push("/dashboard/classes")}><ArrowLeft size={15} /> Classes &amp; people</button>
      </header>
      <section className="accounts-content">
        <div className="accounts-eyebrow">IDENTITY &amp; ACCESS MANAGEMENT</div>
        <div className="accounts-heading">
          <div><h1>Provision school accounts</h1><p>Create teacher and student accounts through the secured server workflow.</p></div>
          <span className="accounts-shield"><ShieldCheck size={18} /> ROLE VERIFIED</span>
        </div>
        <div className="accounts-info">
          <div className="accounts-info-icon"><MailPlus size={20} /></div>
          <div><strong>Operator-managed login credentials</strong><p>The server creates a confirmed KVSync Pro login ID and a one-time temporary password. No invitation email or SMTP is used. Share the password privately and securely.</p></div>
        </div>
        {!canCreate ? (
          <div className="accounts-message error">Your assigned role does not include account provisioning.</div>
        ) : (
          <form className="accounts-form" onSubmit={createAccount}>
            <div className="accounts-form-title"><UserPlus size={18} /><div><strong>New account</strong><small>All fields are validated before the request is sent.</small></div></div>
            <div className="accounts-fields">
              <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} autoComplete="name" placeholder="Enter the person's full name" required /></label>
              <label>KVSync Pro login ID<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="off" placeholder="teacher01@kvsync.pro" pattern="^[A-Za-z0-9._+-]+@kvsync[.]pro$" title="Use a login ID ending in @kvsync.pro" required /></label>
              <label>Account role<select value={role} onChange={(event) => setRole(event.target.value as AppRole)} required>{roleOptions.map((item) => <option key={item} value={item}>{roleNames[item]}</option>)}</select></label>
              {role === "student" && <>
                <label>Class and section<select value={classId} onChange={(event) => setClassId(event.target.value)} required><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>Class {item.grade}{item.section}</option>)}</select></label>
                <label>Roll number<input value={rollNumber} onChange={(event) => setRollNumber(event.target.value)} maxLength={30} placeholder="Enter roll number" required /></label>
              </>}
            </div>
            {message && <div className={`accounts-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>{message.kind === "success" ? <CheckCircle2 size={17} /> : <ShieldCheck size={17} />}{message.text}</div>}
            <div className="accounts-form-actions"><span>Operator-only management roles stay protected.</span><button type="submit" disabled={saving || !canCreate}>{saving ? "Creating account…" : "Create account"} <MailPlus size={16} /></button></div>
          </form>
        )}
        <div className="accounts-security-note"><ShieldCheck size={16} /><p>Security note: account creation is enforced by the <code>manage-users</code> server function, not just this screen. Operator accounts are intentionally excluded from this form.</p></div>
      </section>
    </main>
  );
}
