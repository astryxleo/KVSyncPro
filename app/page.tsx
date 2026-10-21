"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, BookOpen, CalendarCheck2, Eye, EyeOff, Fingerprint, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase";

const roleLabels: Record<string, string> = {
  operator: "Operator",
  admin: "Administrator",
  teacher: "Teacher",
  student: "Student",
  system_moderator: "System Moderator",
  data_content_manager: "Data & Content Manager",
  tester: "Tester",
  support_manager: "Support Manager",
};

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [signedIn, setSignedIn] = useState<{ email: string; roles: string[] } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user) throw new Error("Sign-in failed. Check your credentials or contact the school operator.");
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      if (roleError) throw new Error("Signed in, but your role could not be verified. Access has not been granted.");
      const roles = (roleRows ?? []).map((row: { role: string }) => row.role);
      if (!roles.length) {
        await supabase.auth.signOut();
        throw new Error("This account has no assigned KVSync Pro role. Ask the operator to provision your account.");
      }
      window.location.assign("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      setSignedIn(null);
      setMessage("");
    }
  }

  return (
    <main className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="KVSync Pro home">
          <span className="brand-mark"><img src="https://raw.githubusercontent.com/astryxleo/KVSyncPro/main/download.png" alt="" width="42" height="42" /></span>
          <span className="brand-copy"><strong>KVSync <em>Pro</em></strong><small>PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</small></span>
        </a>
        <div className="secure-label"><span className="secure-dot" /> SECURE SCHOOL WORKSPACE</div>
      </header>

      <section className="hero-grid">
        <div className="intro">
          <div className="eyebrow"><Sparkles size={14} /> ONE CAMPUS. ONE CONNECTED SYSTEM.</div>
          <h1>School life,<br /><span>synchronised.</span></h1>
          <p className="intro-copy">A focused workspace for learning, attendance, communication and school operations — designed around your role.</p>
          <div className="feature-stack">
            <div className="feature-item"><span className="feature-icon"><CalendarCheck2 size={18} /></span><span><strong>Connected operations</strong><small>Attendance and essential school workflows</small></span></div>
            <div className="feature-item"><span className="feature-icon"><BookOpen size={18} /></span><span><strong>Learning, in one place</strong><small>Resources, assignments and class updates</small></span></div>
            <div className="feature-item"><span className="feature-icon"><ShieldCheck size={18} /></span><span><strong>Role-aware access</strong><small>Workspace access follows assigned permissions</small></span></div>
          </div>
          <div className="campus-note"><span className="campus-line" /> BUILT FOR THE KV JANAKPURI COMMUNITY</div>
        </div>

        <section className="login-card" aria-labelledby="login-title">
          <div className="card-emblem"><img src="https://raw.githubusercontent.com/astryxleo/KVSyncPro/main/download.png" alt="KVSync Pro logo" width="42" height="42" style={{objectFit:"contain"}} /></div>
          {signedIn ? (
            <div className="welcome-panel">
              <div className="status-pill"><span className="secure-dot" /> AUTHENTICATED</div>
              <h2 id="login-title">You’re signed in.</h2>
              <p className="card-subtitle">Your account has been authenticated and its assigned role was retrieved.</p>
              <div className="account-summary"><span className="summary-label">ACCOUNT</span><strong>{signedIn.email}</strong><span className="summary-label role-label">ASSIGNED ROLE{signedIn.roles.length > 1 ? "S" : ""}</span><div className="role-list">{signedIn.roles.map((role) => <span className="role-chip" key={role}>{roleLabels[role] ?? role}</span>)}</div></div>
              <p className="notice">Your workspace access follows the roles assigned to this school account.</p>
              <button className="submit-button" type="button" onClick={handleSignOut}>Sign out <ArrowRight size={17} /></button>
            </div>
          ) : (
            <>
              <div className="card-kicker">WELCOME BACK</div>
              <h2 id="login-title">Sign in to continue</h2>
              <p className="card-subtitle">Use the school account provided to you.</p>
              <form className="login-form" onSubmit={handleSubmit}>
                <label htmlFor="email">Email address</label>
                <div className="input-wrap"><Mail size={17} /><input id="email" type="email" autoComplete="username" placeholder="username@kvsync.pro" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
                <div className="label-row"><label htmlFor="password">Password</label><span className="managed-note"><LockKeyhole size={12} /> PRIVATE ACCESS</span></div>
                <div className="input-wrap"><LockKeyhole size={17} /><input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="reveal-button" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
                {message && <div className="form-message" role="alert" aria-live="assertive">{message}</div>}
                <button className="submit-button" type="submit" disabled={busy}>{busy ? "Verifying account…" : "Enter workspace"} <ArrowRight size={17} /></button>
              </form>
              <div className="form-footer"><ShieldCheck size={15} /><span>Protected sign-in · No public account registration</span></div>
              <div className="help-note">Need access? Contact your school’s authorised operator.</div>
            </>
          )}
        </section>
      </section>

      <footer className="footer"><span>© {new Date().getFullYear()} KVSync Pro</span><span><span className="footer-dot" /> SCHOOL WORKSPACE PREVIEW</span><span>ACCESS WITH PURPOSE.</span></footer>
    </main>
  );
}
