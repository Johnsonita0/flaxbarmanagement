# Flex Bar Web

Responsive React, TypeScript, and Vite application for the Flex Bar staff and business management system.

The UI is grouped by purpose: screen-level views live in `src/pages/`, reusable UI in `src/components/`, and all stylesheets live in `src/css/`. `src/App.tsx` only re-exports the app router.

## Local setup

1. Copy `.env.example` to `.env` and set the Supabase anon/publishable key plus the local API URL. The Flex Bar Supabase project URL is already set.
2. From this folder, run `npm install`, then `npm run dev`.
3. Run `npm run build` to type-check and build the production frontend.

Only the Supabase publishable/anon key belongs in this browser app. Never put a Supabase service-role key or Cloudflare R2 credentials in `VITE_*` variables.

The frontend is configured as an installable PWA with a manifest and a shell-only service worker. The branded launch splash appears for 10 seconds on every launch, on mobile, tablet, and desktop. Returning authenticated users see a welcome-back message and are taken to their last visited screen; first-time visitors see the workspace preparation message. The service worker does not cache API responses or authentication data. The role confirmation screen displays the role assigned to the signed-in profile; it does not let a user grant themselves a different role.

## Vercel

Create a Vercel project connected to the frontend Git repository and set its Root Directory to `frontend`. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL` in Vercel project settings. The API deployment must allow the frontend's production origin through `FRONTEND_ORIGINS`.
