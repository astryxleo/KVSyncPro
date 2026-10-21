# KVSync Pro

A role-aware school administration and communication workspace for PM SHRI Kendriya Vidyalaya, Janakpuri.

## Stack
- Next.js App Router + TypeScript
- Supabase Auth, Postgres, Row Level Security, and Edge Functions
- Tailwind CSS v4
- Royal black-and-gold visual system

## Local setup
1. Install Node.js 20.9+.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` using the KVSync Pro project's public URL and publishable/anon key.
5. Run `npm run dev`.

Never place a Supabase service-role key or secret key in a `NEXT_PUBLIC_*` variable or browser code.

## Implemented workspaces
- Secure password sign-in; no public sign-up flow.
- Role lookup from `public.user_roles`; access is denied when role verification fails or no role is assigned.
- Role-aware dashboard navigation for Operator, Administrator, Teacher, Student, System Moderator, Data & Content Manager, Tester, and Support Manager.
- Account provisioning through the `manage-users` Edge Function. Internal IDs use the `@kvsync.pro` suffix; account creation does not send email invitations and returns a generated temporary password once.
- Attendance records, class directory and teaching assignments, timetable, learning hub, announcements, community feed, and moderation queues.
- Content management with authorized announcement publishing.
- Bug-report review and support inbox with database-policy-checked status updates.
- System activity view for privileged moderation events; testers see their own quality reports.
- Supabase RLS remains the data-access boundary. UI role checks are not a replacement for database policies.

## Important limitations
- `@kvsync.pro` is an internal login identifier, not a real mailbox. Users cannot receive email at that address.
- The generated temporary password is displayed to the account creator once, but forced password change on first sign-in has not been implemented yet.
- Some existing workspaces are read-only or depend on live class/teacher assignments. Storage upload/download permissions and end-to-end authenticated-session tests still need verification.
- Do not treat a successful production build as proof that every role workflow works. Test with separate accounts for each role before school-wide use.

## Deployment
The Vercel project is connected to this repository. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in both Preview and Production environments. Keep service-role keys and other secrets server-side only.
