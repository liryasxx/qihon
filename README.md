# Qihon

A mobile-only manhwa reading prototype based on Mark Cyrell Quinio's Qihon Figma design. Built with React, Vite, regular CSS, Supabase integration, and PWA support. **Nothing is automatically deployed.**

## Open it in VS Code

1. Install the current Node.js LTS release (this project requires Node 22.12 or newer).
2. Extract this project and open the `qihon` folder in VS Code.
3. Open **Terminal → New Terminal** and run:

```bash
npm install
npm run dev
```

On Windows PowerShell, use `npm.cmd install` and `npm.cmd run dev` if `npm.ps1` is blocked.

Open the **Local** address printed by Vite. Keep that terminal running. Start with **Home → Browse → a story → Read chapter**.

The live reader works without Supabase keys. Guest bookmarks and reading progress are saved in this browser. Real accounts require the setup below.

## Mobile-only layout

The app always uses the Figma phone layout, including on a computer: a centered 390px-wide app, bottom navigation, a two-column Browse grid, and a single-column Library. Smaller phones fill their available width. The reader toolbar also stays inside the phone width.

If you already downloaded the previous version, replace only `src/App.jsx` and `src/styles.css` from this ZIP in your existing project. Keep your `.env.local` and `node_modules` folder. A running Vite server will update automatically after the two files are saved.

## What this version includes

- Live Korean manhwa catalogue, title search, popular/recent sorting, and pagination.
- English chapter lists and actual chapter image fetching from MangaDex.
- A vertical scrolling reader, page selector, failed-image retry, and chapter navigation.
- Source and translation-group credits.
- Guest bookmarks, history, and page progress.
- Supabase email/password sign-up, login, confirmation, recovery, logout, and display-name editing when connected.
- Separate, private Supabase libraries and reading progress for signed-in readers.
- Installable PWA manifest, app icons, update prompt, and an offline application shell.
- Local API plus Vercel and Netlify server-function adapters. No deploy commands run as part of install/build.

This is the first **real-reading prototype**, not a completed commercial publishing platform. It does not implement diamond payments, VIP subscriptions, notifications, paid chapter locks, chapter uploading, or offline chapter downloads. External chapter availability can change.

## Connect your Supabase project

1. Create or open a Supabase project at https://supabase.com/dashboard.
2. Open **SQL Editor** and run `supabase/schema.sql` once. It creates the tables, ownership policies, and profile trigger. Re-running it preserves records.
3. In your local project, copy `.env.example` to `.env.local`.
   - Windows PowerShell: `Copy-Item .env.example .env.local`
   - macOS/Linux: `cp .env.example .env.local`
4. In the Supabase project's **Connect** dialog, copy its Project URL and **publishable key** into `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

5. In **Authentication → URL Configuration**, set the Site URL to the app's exact local address (normally `http://localhost:5173`) and allow its `/auth` redirect URL. If Vite chooses another port, use that port. When you eventually host the app, add the hosted `/auth` URL and update Site URL.
6. Enable email/password authentication. This app supports email confirmation; keep it enabled for a hosted app. Configure your email sender as required by Supabase for your users.
7. Restart `npm run dev`. Open **Profile → Sign in or create an account**.
8. Create a test account, confirm its email, save a story, and sign in on another browser to verify synchronization. Check that a second account cannot read or change the first account's library.

Use only the public/publishable key in `VITE_*` values. Vite exposes these values to the browser; a secret key or `service_role` key must never be placed there or committed to GitHub. `.env.local` is ignored by Git.

The guest library stays separate when signing in. Signing out restores the device's guest library. This prototype does not merge guest items into an account.

Supabase could not be tested against a real project during creation because no project connection was supplied. The SQL and account flows are ready for that setup; they are not a claim that a live Supabase project has already been configured.

## Where the chapters come from

MangaDex supplies titles, chapters, covers, and page-image manifests. React calls `/api/content`; the backend contacts the documented provider endpoints. This avoids depending on browser cross-origin access and avoids exposing an unrestricted URL proxy.

The catalogue requests Korean originals with English chapter availability and a `safe` content rating. Title names, covers, and chapter availability come from the live source, so they can differ from the fictional examples in Figma. A catalogue listing does not guarantee a complete English translation. External-only chapters and empty image chapters are excluded.

The provider requires attribution and honoring translation-group removal requests. **Do not place MangaDex chapters behind diamond payments, paid services, or advertisements.** A payment demonstration should use original or appropriately authorized content and an explicitly separate implementation. Read the current provider requirements before publishing:

- https://api.mangadex.org/docs/
- https://gitlab.com/mangadex-pub/mangadex-api-docs/-/blob/main/index.md

If a translation group requests removal, disable the relevant content in the backend before publishing. A public launch should provide a reachable project issue tracker or other contact route for requests. Do not treat this prototype as a license to republish any particular series.

## Verify the project

```bash
npm test
npm run build
npm run preview
```

`preview` serves the production build and its local content API at `http://localhost:4173`. Production PWA behavior can be tested here. `vite preview` alone would not provide the API, so use the included script.

For an optional live test that downloads every image of one chapter **into memory only**:

```bash
npm run test:live
```

It defaults to the English first chapter of *I Met the Male Lead in Prison*, which had 17 readable pages when verified on November 19, 2026. Supply a different MangaDex chapter UUID if that chapter later becomes unavailable:

```bash
npm run test:live -- CHAPTER_UUID
```

## PWA installation

Build and serve with `npm run preview`, or use HTTPS when eventually hosted. In a supported browser, use **Install app** or **Add to Home Screen**. Qihon also shows an Install button when the browser exposes an install prompt. iPhone/iPad installation uses the browser's share/menu controls as supported by the device.

Only the app shell is cached. Live chapters and authentication require internet. Supabase responses and chapter-image requests are not put into an offline runtime cache by this app. Actual device installation has not been tested here.

## Push to your own GitHub repository

Create an empty GitHub repository, then run these commands in the project folder, replacing the example remote URL:

```bash
git init
git add .
git commit -m "Build Qihon reading prototype"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/qihon.git
git push -u origin main
```

Keep `.env.local`, `node_modules`, and generated `dist` out of Git. The lockfile belongs in Git. Do not connect automatic hosting deployments until you want them; pushing to GitHub does not itself host this project.

## Host later, when you decide

This project requires a server function for `/api/content`. Uploading `dist` alone to a static-only host would show the interface but would not provide live chapter fetching.

**Netlify:** the included `netlify.toml` builds with `npm run build`, publishes `dist`, and bundles `netlify/functions/content.mjs`. Deploy the complete project with Functions support, and enter the public Supabase environment values before building. The function and SPA routes are configured in the project.

**Vercel:** the included `vercel.json` builds the app and preserves the `/api/content` function while rewriting app routes to `index.html`. Enter the public Supabase environment values before building.

Git integrations on either service may deploy when you push. Choose manual deployment controls if you want publication only when you explicitly trigger it. No repository, hosting project, or public URL has been created for you. Hosting adapter configuration is supplied but has not been validated on either live hosting service.

## Files to know

| File | Purpose |
| --- | --- |
| `src/App.jsx` | Screens and reader interactions |
| `src/styles.css` | Qihon dark mobile layout, fixed to the 390px Figma phone width |
| `src/lib/state.jsx` | Authentication, bookmarks, and reading progress |
| `server/content.mjs` | Validated content requests and bounded image delivery |
| `supabase/schema.sql` | Database tables and account access policies |
| `vite.config.js` | Local API and PWA configuration |
| `api/content.js` | Vercel adapter |
| `netlify/functions/content.mjs` | Netlify adapter |

The Figma file was read only. Its available typography and dark palette informed this implementation. Its exported SVG downloads returned empty bytes in this session, so this prototype uses local line icons and a new Qihon installation icon. Cover images remain live source data.
