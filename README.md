# Qihon

A mobile manhwa reader built with React, Vite, CSS, and Supabase. A student project that can be installed as a PWA.

## Features

- Browse MangaDex titles and choose available chapter languages
- Bookmarks, reading history, and offline downloads
- Accounts, profile photos, and in-app notifications
- Demo diamonds and chapter unlocks synced across devices

## Run locally

Requires Node.js 22.12 or newer.

1. Copy `.env.example` to `.env.local` and enter your Supabase URL and publishable key.
2. Run these files in Supabase SQL Editor:
   - `supabase/schema.sql`
   - `supabase/avatars.sql`
   - `supabase/diamonds.sql`
3. Open the project folder in VS Code and run:

```powershell
npm.cmd install
npm.cmd run dev
```

Open the Local URL shown in the terminal.

## Check the project

```powershell
npm.cmd test
npm.cmd run build
```

## Vercel

Import the GitHub repository using the **Vite** preset.

- Build command: `npm run build`
- Output directory: `dist`
- Add your Supabase environment variables in Vercel.

Connected GitHub pushes can trigger automatic deployments.

## Notes

- Content comes from [MangaDex](https://mangadex.org). Chapter availability depends on its uploads.
- Diamonds and checkout are demos. No money is charged.
- Downloads stay on the device where they were saved.
- Install using **Install app** or **Add to Home Screen** in your browser.
- Keep `.env.local` and secret keys out of GitHub.