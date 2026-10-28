# LENSER

Server-rendered camera-gear storefront: Express 5 + EJS 6 via `express-ejs-layouts`. Postgres powers accounts, sessions, cart, wishlist, and orders.

## Commands

- `cp .env.example .env` — copy the env template and fill in Postgres credentials. `.env` is gitignored; run this before the first start.
- `npm start` — nodemon on http://localhost:`PORT` (default 3000). Entry is `app.js` (ignore `"main": "index.js"`; that file does not exist).
- `npm run migrate:shop` — applies `schema.sql` idempotently (creates accounts/cart/wishlist/orders tables). Run after schema changes.
- No lint, typecheck, build, or test suite. `npm test` is a stub that exits 1 — don't run it.

## Wiring

- `app.js` is the whole server: one GET route per page. Always pass `currentPath`; data-driven pages also pass their filtered/sorted product arrays.
- All pages render inside `views/layout.ejs` automatically. Page views contain body markup only — never `<html>`, `<head>`, header, or footer.
- `layout.ejs` includes `partials/header`, `partials/footer`, `/css/style.css`, `/js/main.js`, and Lucide from unpkg.
- Adding a page = route in `app.js` + `views/<name>.ejs` + link in `partials/header.ejs`. Route path and filename match: `/best-sellers` → `best-sellers.ejs`.
- `currentPath` is required — `header.ejs` uses it for active nav (`/` = Blog, plus `/featured`, `/deals`, `/best-sellers`, `/new-arrivals`).
- `/search` is server-rendered from the in-memory catalog; `q` matches name, brand, description, type, and spec text, with optional `type=camera|lenses|accessories`. The header search panel submits there.

## Frontend

- `public/` is served at site root: `/css/style.css`, `/js/main.js`, `/assets/...`. Use absolute paths.
- Dark theme is driven by CSS vars in `public/css/style.css`: `--surface-1: #121212`, `--text-color-primary: #e9e9e9`. Reuse them instead of hardcoding colors.
- Fonts: Inter (body), Kodchasan (`.logo` wordmark only), Archivo (hero and display headings), imported from Google Fonts.
- Icons: `<i data-lucide="name">`; `lucide.createIcons()` runs once in `layout.ejs`. Re-run it after injecting icons dynamically.
- Brand logos are inline `<symbol>` sprites at the top of `partials/header.ejs`, rendered via `<use href="#sony-logo">` etc.
- Category nav (`.nav-bottom`) uses one shared underline indicator positioned by `public/js/main.js`; it slides on hover/focus and returns to the active link. Keep per-link underline CSS out.
- Header account and cart menus are click-controlled (`data-account-trigger` / `data-cart-trigger`). Keep hover-open rules scoped away from `.nav-item--account` and `.nav-item--cart`; the account trigger shows the user's initials, not their name.
- Header search is click-controlled (`data-search-trigger`) and opens a full-screen `.search-scrim`. Opening adds `is-search-open` to `<html>` and `<body>` to lock page scroll and compensates the scrollbar with `--search-scrollbar-gutter`.
- Product media: `views/partials/product-media.ejs` renders `product.image` when present, otherwise a Lucide icon placeholder from `productIcon`. `--photo` uses `object-fit: contain` with a per-image `--media-bg` tile.

## Data / DB

- `config/db.js` exports a `pg` Pool used by auth, cart, wishlist, order, and account routes.
- `schema.sql` is valid Postgres and applied with `npm run migrate:shop`. Catalog and spec data are seeded with `node scripts/migrate-products.js` (truncates products, so it clears cart/wishlist rows).
- Commerce is DB-backed and requires login: `/cart`, `/checkout`, `/account`, plus POST routes for cart, wishlist, profile, password, and orders. Mock payment only (`cod` or `bank_transfer`); no payment gateway or password-reset email flow.
- Shipping is free at a ₱2,000 subtotal (`FREE_SHIPPING_THRESHOLD`), otherwise ₱150 (`SHIPPING_FEE`).
- The live catalog is the `products` + `product_types` + `product_specs` tables, loaded once into `productsCache` at startup. `data/products.json` and `data/product-specs.json` are seed sources only, not read per request. Product JSON shape: `id, slug, name, description, discounted_price, real_price, brand, ratings, type[], is_featured, amount_sold, date_added, image`; specs live as JSONB (`highlights`, `overview`, `spec_groups`, `box_items`).
- `image` is `/assets/products/<slug>.webp` for all 24 products. If an image is removed, the card falls back to a Lucide icon.
- `data/product-assets.json` maps each product to its flat target path and stores `status`, `credit`, `license`, and `background`.
- Keep image paths flat (no brand folders). Sourced photos are WebP, displayed with `object-fit: contain`; `app.js` merges each asset's `background` hex into `product.image_background`, used as the card's tile color. Never remove or key out image backgrounds.
- `camera.json` is the older reference shape.
- `config/db.js` loads `dotenv` and reads Postgres settings from `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD`; session signing uses `SESSION_SECRET`. Never commit `.env`.

## Images

- Intake: AVIF/JPG/PNG → WebP q90, max 2000px on the long edge, EXIF stripped, background preserved. Delete the source after the WebP is verified. Already-WebP files are used as supplied.
- No background removal, alpha keying, or `-cutout` derivatives.
- All 24 products have WebP photos. Six supplied images are 1200px or smaller on the long edge and are used as-is without upscaling.

## Page designs

Each top-level page has its own layout — do not fold them into one template:

- `/featured` — editorial spotlight + asymmetric picks.
- `/deals` — deal-of-the-week banner + discount-meter cards.
- `/best-sellers` — ranked top-10 chart with sticky rail and podium.
- `/new-arrivals` — "Just landed" rail + month-grouped timeline.

## Known gaps

- No password reset flow; users can only change a password after logging in.
- Order status is set to `placed` at checkout and has no admin update UI.

## User preferences (do not regress)

- Keep the `LENSER` wordmark in **Kodchasan** — the user considers it part of the brand identity.
- Display headings (hero, section headings, page titles) use **Archivo**, an optical/technical grotesque.
- Every main page must have a distinct layout like a real product site, not one repeated grid.
- The catalog is intentionally 24 products; keep it populated when editing data.
- After catalog changes, give the user a JSON list of product names/slugs so they can source photos.
- Never remove image backgrounds; preserve white/dark backgrounds as supplied and match the card tile to the image edge.
- Convert supplied images to WebP and delete the originals after verification.

## Skills

- `frontend-design` is installed at `.agents/skills/frontend-design/` (auto-loaded by opencode; source `anthropics/skills`, pinned in `skills-lock.json`). Use it for UI/visual design work. Update with `npx skills update`.
