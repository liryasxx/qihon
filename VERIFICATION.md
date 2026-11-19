# Verification — November 19, 2026

- Production build: passed (`npm run build`).
- Backend checks: 5 passed (`npm test`). Tests cover image-host restrictions, invalid requests, ordered page resolution and translation credits, catalogue filters, and rejecting external/non-English/empty chapters.
- Live provider test: passed (`npm run test:live`). Every image of an English chapter of I Met the Male Lead in Prison was fetched through Qihon’s backend: 17 pages, 6,741,763 bytes. Images were processed in memory, not packaged with this project.
- Browser: title search, title details, chapter list, real chapter image rendering, page selector, bookmarks, and saved page progress checked. Bookmark and chapter 1/page 3 remained after browser reload.
- Mobile-only layout update: verified a 390px app and bottom navigation inside a 1363px desktop viewport, with no horizontal page overflow. Browse stays in two columns; Library stays in one column. The reader toolbar also measures 390px. Compared Home and Library with the supplied Figma screens. No physical phone/device test performed.
- PWA: production manifest, non-empty 192/512/maskable icons, and generated service worker verified. Actual device installation and offline operation were not tested.
- Supabase: integration and database migration included; live sign-up, account isolation, and cloud sync await a connected Supabase project.
- GitHub/hosting: no repository was pushed and nothing was deployed. Vercel/Netlify adapters are included; a live hosting deployment was not tested.
