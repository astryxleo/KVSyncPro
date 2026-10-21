# KVSync Pro

A role-aware school administration and communication workspace for PM SHRI Kendriya Vidyalaya, Janakpuri.

## Stack
- Next.js App Router + TypeScript
- Supabase Auth and Postgres
- Tailwind CSS v4
- Royal black-and-gold visual system

## Local setup
1. Install Node.js 20.9+.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` using the KVSync Pro project's public URL and publishable/anon key.
5. Run `npm run dev`.

Never place a Supabase service-role key or secret key in a `NEXT_PUBLIC_*` variable or browser code.

## Current implementation
- Responsive branded sign-in screen.
- Supabase password sign-in.
- Role lookup from `public.user_roles`; account is signed out if no role is assigned or role lookup fails.
- No public sign-up flow.
- Dashboard modules, role-specific routes, storage workflows, and authenticated end-to-end testing are not yet implemented.

## Deployment
Configure the same two public environment variables in the hosting project's Preview and Production environments. Deploy only after verifying the linked repository and project.
