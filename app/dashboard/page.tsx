"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, ArrowDownLeft, ArrowRight, Bell, BookOpen, CalendarCheck2, CheckCircle2,
  ChevronRight, CircleHelp, ClipboardCheck, FileText, GraduationCap, LayoutDashboard,
  LogOut, MessageSquare, ShieldCheck, Users, WalletCards, Wrench, Menu, UserPlus
} from "lucide-react";
import { createClient } from "@/lib/supabase";

type Role = "operator" | "admin" | "teacher" | "student" | "system_moderator" | "data_content_manager" | "tester" | "support_manager";
type ModuleItem = { label: string; description: string; icon: typeof LayoutDashboard; roles: Role[]; status?: string };

const roleLabels: Record<Role, string> = {
  operator: "Operator", admin: "Administrator", teacher: "Teacher", student: "Student",
  system_moderator: "System Moderator", data_content_manager: "Data & Content Manager",
  tester: "Tester", support_manager: "Support Manager",
};

const modules: ModuleItem[] = [
  { label: "Overview", description: "Your workspace at a glance", icon: LayoutDashboard, roles: ["operator","admin","teacher","student","system_moderator","data_content_manager","tester","support_manager"] },
  { label: "Attendance", description: "Class attendance and records", icon: CalendarCheck2, roles: ["operator","admin","teacher","student"] },
  { label: "Classes & people", description: "Class rosters and school accounts", icon: Users, roles: ["operator","admin","teacher"] },
  { label: "Account provisioning", description: "Create school accounts without email invitations", icon: UserPlus, roles: ["operator","admin","data_content_manager"] },
  { label: "Learning hub", description: "Homework and study materials", icon: BookOpen, roles: ["operator","admin","teacher","student","data_content_manager"] },
  { label: "Timetable", description: "Class schedules and periods", icon: ClipboardCheck, roles: ["operator","admin","teacher","student"] },
  { label: "Announcements", description: "School and class updates", icon: Bell, roles: ["operator","admin","teacher","student","data_content_manager"] },
  { label: "Community", description: "School community conversations", icon: MessageSquare, roles: ["operator","admin","teacher","student","system_moderator"] },
  { label: "Moderation", description: "Reports, flags and safety actions", icon: ShieldCheck, roles: ["operator","admin","system_moderator"] },
  { label: "Content management", description: "Manage learning content and updates", icon: FileText, roles: ["operator","admin","data_content_manager"] },
  { label: "Bug reports", description: "Review product issues and feedback", icon: Wrench, roles: ["operator","admin","tester","support_manager"] },
  { label: "Support inbox", description: "Help requests and user support", icon: CircleHelp, roles: ["operator","admin","support_manager"] },
  { label: "System activity", description: "Operational visibility and audit work", icon: Activity, roles: ["operator","admin","tester"] },
];

const roleDescriptions: Record<Role, string> = {
  operator: "Full platform oversight and account provisioning.",
  admin: "School administration and operational coordination.",
  teacher: "Classroom workflows, attendance and learning resources.",
  student: "Your learning, timetable and school updates.",
  system_moderator: "Community safety, reports and moderation queues.",
  data_content_manager: "Learning resources and school-wide content.",
  tester: "Quality checks, issue tracking and system verification.",
  support_manager: "Support requests and user assistance.",
};

export default function DashboardPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [email, setEmail] = useState("");
  const [active, setActive] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.replace("/");
        return;
      }
      setEmail(user.email ?? "");
      const { data, error: roleError } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (roleError) throw new Error("Your role could not be verified. Access is paused until the role can be checked.");
      const assigned = (data ?? []).map((item: { role: string }) => item.role as Role).filter((role) => role in roleLabels);
      if (!assigned.length) {
        await supabase.auth.signOut();
        router.replace("/");
        return;
      }
      setRoles(assigned);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load your workspace.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void loadSession(); }, [loadSession]);

  const visibleModules = useMemo(() => modules.filter((item) => item.roles.some((role) => roles.includes(role))), [roles]);
  const primaryRole = roles[0];
  const selectedModule = visibleModules.find((item) => item.label === active) ?? visibleModules[0];

  async function signOut() {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  function openModule(label: string) {
    const paths: Record<string, string> = {
      "Classes & people": "/dashboard/classes",
      "Account provisioning": "/dashboard/accounts",
      "Attendance": "/dashboard/attendance",
      "Learning hub": "/dashboard/learning",
      "Timetable": "/dashboard/timetable",
      "Announcements": "/dashboard/announcements",
      "Community": "/dashboard/community",
      "Moderation": "/dashboard/moderation",
      "Content management": "/dashboard/content",
      "Bug reports": "/dashboard/bugs",
      "Support inbox": "/dashboard/support",
      "System activity": "/dashboard/activity",
    };
    const path = paths[label];
    if (path) {
      router.push(path);
      return;
    }
    setActive(label);
  }

  if (loading) {
    return <main className="dashboard-loading"><span className="loading-mark">KV</span><p>Securing your workspace…</p></main>;
  }

  if (error) {
    return <main className="dashboard-loading"><div className="dashboard-error"><ShieldCheck size={25} /><h1>Workspace verification paused</h1><p>{error}</p><button className="dash-button" onClick={() => void loadSession()}>Retry verification <ArrowRight size={16} /></button><button className="dash-text-button" onClick={() => router.replace("/")}>Return to sign in</button></div></main>;
  }

  return (
    <main className="dashboard-shell">
      <aside className={`dash-sidebar ${mobileOpen ? "dash-sidebar-open" : ""}`}>
        <a className="dash-brand" href="/"><span className="dash-brand-mark">KV</span><span><strong>KVSync <em>Pro</em></strong><small>JANAKPURI CAMPUS</small></span></a>
        <div className="dash-workspace-label">WORKSPACE</div>
        <nav className="dash-nav" aria-label="Workspace navigation">
          {visibleModules.map((item) => {
            const Icon = item.icon;
            return <button key={item.label} className={`dash-nav-item ${active === item.label ? "active" : ""}`} onClick={() => { setMobileOpen(false); openModule(item.label); }}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{active === item.label && <ChevronRight className="nav-chevron" size={15} />}</button>;
          })}
        </nav>
        <div className="dash-sidebar-bottom"><div className="dash-secure-note"><span className="secure-dot" /><span><strong>Protected workspace</strong><small>Access checked against assigned role</small></span></div><button className="dash-signout" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} />{signingOut ? "Signing out…" : "Sign out"}</button></div>
      </aside>

      {mobileOpen && <button aria-label="Close navigation" className="dash-backdrop" onClick={() => setMobileOpen(false)} />}
      <section className="dash-main">
        <header className="dash-topbar">
          <button className="dash-menu-toggle" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="dash-breadcrumb">KVSync Pro <ChevronRight size={13} /> <span>{active}</span></div>
          <div className="dash-topbar-right"><span className="dash-status"><span className="secure-dot" /> SECURE SESSION</span><div className="dash-avatar">{(email[0] ?? "U").toUpperCase()}</div></div>
        </header>

        <div className="dash-content">
          <div className="dash-welcome-row"><div><div className="dash-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div><h1>{active === "Overview" ? "Welcome to your workspace." : active}</h1><p>{active === "Overview" ? (roleDescriptions[primaryRole] ?? "Your role-aware school workspace.") : (selectedModule?.description ?? "Your workspace module.")}</p></div><div className="dash-role-badge"><GraduationCap size={16} /><span>{roles.map((role) => roleLabels[role]).join(" · ")}</span></div></div>

          {active === "Overview" ? (
            <>
              <div className="dash-highlight"><div className="highlight-icon"><ShieldCheck size={21} /></div><div><strong>Identity verified · Role-aware access enabled</strong><p>KVSync Pro has checked your active session and loaded the modules associated with your assigned role{roles.length > 1 ? "s" : ""}.</p></div><CheckCircle2 className="highlight-check" size={19} /></div>
              <div className="dash-section-heading"><div><h2>Your modules</h2><p>Choose a workspace to continue.</p></div><span>{visibleModules.length} AVAILABLE</span></div>
              <div className="dash-module-grid">{visibleModules.filter((item) => item.label !== "Overview").map((item) => { const Icon = item.icon; return <button key={item.label} className="dash-module-card" onClick={() => openModule(item.label)}><span className="module-icon"><Icon size={19} /></span><span className="module-card-title">{item.label}</span><span className="module-card-description">{item.description}</span><span className="module-card-footer">Open module <ArrowRight size={14} /></span></button>; })}</div>
              <div className="dash-bottom-grid"><div className="dash-info-card"><div className="info-card-heading"><span className="module-icon small"><WalletCards size={17} /></span><div><strong>Workspace status</strong><small>Application readiness</small></div></div><div className="status-line"><span>Sign-in session</span><span className="state-live"><span /> Verified</span></div><div className="status-line"><span>Role permissions</span><span className="state-live"><span /> Loaded</span></div><div className="status-line"><span>Feature rollout</span><span className="state-pending">In progress</span></div></div><div className="dash-info-card dash-next-card"><div className="info-card-heading"><span className="module-icon small"><ArrowDownLeft size={17} /></span><div><strong>Built in phases</strong><small>KVSync Pro development</small></div></div><p>Module screens are being connected to live school data in stages. Only use features that are available in your workspace; an empty or unfinished module is not a school record.</p></div></div>
            </>
          ) : (
            <div className="dash-module-detail"><div className="detail-icon">{selectedModule && <selectedModule.icon size={25} />}</div><div className="dash-eyebrow">WORKSPACE MODULE</div><h2>{active}</h2><p>{selectedModule?.description}</p><div className="detail-notice"><Activity size={18} /><div><strong>Module foundation is in place</strong><span>This screen is currently a safe workspace shell. Live records, create/edit actions and role-specific workflows still need to be wired and tested before this module is considered operational.</span></div></div><button className="dash-button" onClick={() => setActive("Overview")}>Back to overview <ArrowRight size={16} /></button></div>
          )}
          <footer className="dash-footer"><span>© {new Date().getFullYear()} KVSync Pro</span><span>PM SHRI KV JANAKPURI</span><span>SECURE SCHOOL WORKSPACE</span></footer>
        </div>
      </section>
    </main>
  );
}
