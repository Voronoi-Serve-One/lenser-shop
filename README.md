# LENSER Local Setup Guide

LENSER is a server-rendered camera-gear storefront built with:

- **Node.js + Express 5**
- **EJS** templates through `express-ejs-layouts`
- **PostgreSQL** for accounts, sessions, carts, wishlists, and orders
- Plain CSS and JavaScript in `public/`

There is no frontend build step. This guide is written for **Windows 10/11 and PowerShell**.

---

## What you need

Install these before starting:

| Tool | Recommended version | Check with |
| --- | --- | --- |
| Git for Windows | Latest | `git --version` |
| Node.js | 20 LTS or newer | `node --version` |
| npm | Installed with Node.js | `npm --version` |
| PostgreSQL | 14 or newer | `psql --version` |

Download links:

- Node.js: <https://nodejs.org/en/download>
- Git for Windows: <https://git-scm.com/download/win>
- PostgreSQL for Windows: <https://www.postgresql.org/download/windows/>

During PostgreSQL installation:

- Keep the default port unless you have a reason to change it.
- Set a superuser password and remember it.
- Install pgAdmin if you want a graphical database client.
- Make sure the PostgreSQL service starts after installation.

If `node`, `npm`, `git`, or `psql` is not recognized after installation, close and reopen PowerShell.

---

## Quick start

If everything is already installed, run this sequence:

```powershell
cd $HOME\Documents
git clone https://github.com/Voronoi-Serve-One/lenser-shop.git
cd lenser-shop
npm install
Copy-Item .env.example .env
notepad .env
npm run migrate:shop
node scripts/migrate-products.js
npm start
```

Then open:

<http://localhost:3000>

Stop the server with `Ctrl+C`.

The rest of this guide explains each step and what to do when something fails.

---

## 1. Get the project

Clone the repository:

```powershell
cd $HOME\Documents
git clone https://github.com/Voronoi-Serve-One/lenser-shop.git
cd lenser-shop
```

If you do not have Git:

1. Download the repository ZIP from GitHub.
2. Extract it.
3. Open PowerShell in the extracted folder.

If the repository is private, your GitHub account must have access to it.

---

## 2. Install dependencies

From the project folder:

```powershell
npm install
```

This installs the runtime dependencies and the nodemon development server.

For a clean install using the committed lockfile:

```powershell
npm ci
```

Use one or the other, not both back-to-back.

There is no separate build command. The application is served directly by Node.

---

## 3. Create your `.env` file

Copy the template:

```powershell
Copy-Item .env.example .env
notepad .env
```

Fill in the values for your local PostgreSQL installation.

| Variable | Example | Purpose |
| --- | --- | --- |
| `PGHOST` | `localhost` | PostgreSQL host |
| `PGPORT` | `5432` | PostgreSQL port |
| `PGDATABASE` | `lenser_system` | Database name |
| `PGUSER` | `postgres` | PostgreSQL user |
| `PGPASSWORD` | `your-password` | Password for the PostgreSQL user |
| `SESSION_SECRET` | long random string | Signs session cookies |
| `NODE_ENV` | `development` | Local development mode |
| `PORT` | `3000` | Port used by the Express server |

Generate a session secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output into `SESSION_SECRET`.

Important:

- `.env` contains local secrets and is ignored by Git.
- Never commit `.env`.
- If you change `.env`, stop and restart the server.
- Do not use this local password or secret in production.

---

## 4. Start PostgreSQL

The app needs PostgreSQL running before it can load products or use accounts, carts, wishlists, or orders.

Start it using one of these methods:

1. Press `Win+R`, run `services.msc`, find the PostgreSQL service, and click **Start**.
2. Open pgAdmin and connect to your local server.
3. Use PowerShell if the service name is known:

```powershell
Get-Service *postgres*
```

Then start the correct service:

```powershell
Start-Service postgresql-x64-16
```

Replace `postgresql-x64-16` with the service name shown by `Get-Service`. If the command is denied, run PowerShell as Administrator or start the service through `services.msc`.

If PostgreSQL uses a different port, update `PGPORT` in `.env`.

---

## 5. Create the database and tables

Run:

```powershell
npm run migrate:shop
```

This command:

1. Connects to the PostgreSQL maintenance database named `postgres`.
2. Checks whether `PGDATABASE` exists.
3. Creates `lenser_system` if it is missing and the PostgreSQL role has `CREATEDB`.
4. Applies `schema.sql` to the target database.

Expected output when the database already exists:

```text
Database lenser_system already exists
Shop tables are ready
```

Expected output when it creates the database:

```text
Created database lenser_system
Shop tables are ready
```

You can run this command more than once. It is safe to reapply the schema.

### If automatic database creation fails

The PostgreSQL role may not have permission to create databases.

Create the database manually:

```powershell
psql -U postgres -c "CREATE DATABASE lenser_system;"
```

Then run the migration again:

```powershell
npm run migrate:shop
```

If `psql` is not on your `PATH`, use the full path. Replace `16` with your installed PostgreSQL version:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE lenser_system;"
```

Alternatively, create the database through pgAdmin, then run `npm run migrate:shop`.

### Verify the tables

Connect to the database:

```powershell
psql -U postgres -d lenser_system
```

List the tables:

```sql
\dt
```

Exit with:

```sql
\q
```

---

## 6. Seed the product catalog

The storefront needs product data. Run:

```powershell
node scripts/migrate-products.js
```

Expected output:

```text
Migrated 24 products
```

This command loads:

- 24 products
- Product categories/types
- Product specifications
- Image background and credit metadata

> **Warning:** This script truncates and recreates product data. PostgreSQL cascades that reset to rows that reference products, including cart, wishlist, and order-item rows. Run it during initial setup or when you intentionally want to reset catalog data. Do not run it casually after creating orders you want to keep.

The storefront catalog is loaded into memory when the server starts. If the app is already running after seeding, restart it.

---

## 7. Run the app

Start the development server:

```powershell
npm start
```

Expected output:

```text
Server running at http://localhost:3000
```

Open:

<http://localhost:3000>

Nodemon restarts the server after changes to application files. Changes to `.env` usually require a manual restart.

To stop the server, press `Ctrl+C`.

If port `3000` is busy, change `PORT` in `.env`, save the file, and restart.

---

## 8. First-run checklist

After the server starts, verify the setup:

1. Open the homepage and confirm products are visible.
2. Open a product detail page.
3. Create an account through **Create account**.
4. Add a product to the cart and confirm the cart badge updates.
5. Save a product to saved gear.
6. Open the cart and continue to checkout.
7. Choose `cod` or `bank_transfer`. Do not enter real payment details.
8. Confirm the order appears under the account page.

Useful routes:

| Page | Route |
| --- | --- |
| Home | `/` |
| Featured | `/featured` |
| Deals | `/deals` |
| Best sellers | `/best-sellers` |
| New arrivals | `/new-arrivals` |
| Cameras | `/cameras` |
| Lenses | `/lenses` |
| Accessories | `/accessories` |
| Search | `/search` |
| Example product | `/product/canon-eos-rebel-sl3` |
| Cart | `/cart` |
| Checkout | `/checkout` |
| Account | `/account` |
| Login | `/login` |
| Create account | `/register` |

Cart, wishlist, checkout, and account actions require an authenticated account. Logged-out cart and wishlist actions redirect to Create Account.

---

## 9. Daily workflow

When starting work:

```powershell
git pull
npm install
npm run migrate:shop
npm start
```

Notes:

- `npm install` is only necessary when dependencies or `package-lock.json` change.
- `npm run migrate:shop` is safe to run and applies schema changes.
- Do **not** run the product seed script on every pull. It resets catalog data and can clear cart, wishlist, and order-item rows.
- Never commit `.env`.

---

## 10. Project structure

```text
lenser-shop/
├─ app.js                         Express server and all routes
├─ config/
│  └─ db.js                       PostgreSQL pool and environment loading
├─ data/
│  ├─ products.json               Catalog seed data
│  ├─ product-specs.json          Spec seed data
│  └─ product-assets.json         Image background and credit metadata
├─ public/
│  ├─ css/style.css               All site styles
│  ├─ js/main.js                  Header, cart, wishlist, toast, and nav behavior
│  └─ assets/
│     ├─ products/                Product images
│     └─ blog/                    Editorial and auth imagery
├─ scripts/
│  ├─ migrate-shop.js             Database bootstrap and schema migration
│  └─ migrate-products.js         Catalog seed/reset
├─ views/
│  ├─ layout.ejs                  Shared HTML shell
│  ├─ *.ejs                       Page templates
│  └─ partials/                   Header, footer, product cards, mini-cart, etc.
├─ schema.sql                     Tables and indexes
├─ .env.example                   Environment template
├─ package.json                   Scripts and dependencies
└─ README.md
```

---

## 11. How the app works

- `app.js` starts Express, configures sessions, and defines all routes.
- Every page is rendered with an EJS layout.
- The header is inserted by `views/partials/header.ejs`.
- The footer is inserted by `views/partials/footer.ejs`.
- Product data is read from PostgreSQL into an in-memory cache at startup.
- Sessions are stored in the PostgreSQL `session` table.
- Accounts, cart items, wishlist items, orders, and order items are stored in PostgreSQL.
- Product images are static files under `public/assets/products/`.
- Shipping is free at a ₱2,000 subtotal; otherwise the shipping fee is ₱150.
- Checkout uses mock payment methods only.

### Main database tables

| Table | Purpose |
| --- | --- |
| `products` | Catalog products and pricing |
| `product_types` | Product category tags such as camera, lens, accessory |
| `product_specs` | JSONB highlights, overview, spec groups, and box items |
| `users` | Account records |
| `cart_items` | Per-user cart quantities |
| `wishlist_items` | Per-user saved gear |
| `orders` | Order totals, shipping details, and status |
| `order_items` | Product snapshots for each order |
| `session` | Express session store |

---

## 12. Commands reference

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies |
| `npm ci` | Clean install from `package-lock.json` |
| `npm start` | Start nodemon on `http://localhost:3000` |
| `npm run migrate:shop` | Create database if needed and apply schema |
| `node scripts/migrate-products.js` | Seed or reset all product data |
| `npm test` | Not implemented; intentionally exits with an error |

There is no lint, typecheck, build, or automated test suite.

---

## 13. Environment reference

Example `.env`:

```text
PGHOST=localhost
PGPORT=5432
PGDATABASE=lenser_system
PGUSER=postgres
PGPASSWORD=your-local-postgres-password
SESSION_SECRET=replace-with-a-long-random-string
NODE_ENV=development
PORT=3000
```

Common mistakes:

- `PGPASSWORD` does not match the PostgreSQL user password.
- PostgreSQL is installed on a different port, but `PGPORT` still says `5432`.
- `PGUSER` points to a user that does not exist.
- `PGDATABASE` was changed, but the new database was not created.
- `SESSION_SECRET` is left empty or uses the example value for production-like work.
- `.env` was edited while the server was running and the server was not restarted.

---

## 14. Resetting local data

### Reapply the schema safely

```powershell
npm run migrate:shop
```

This does not delete existing user or order data.

### Reset catalog data

```powershell
node scripts/migrate-products.js
```

This resets products and can cascade to cart, wishlist, and order-item rows.

### Full local reset

Stop the app first with `Ctrl+C`, then run:

```powershell
dropdb --if-exists -U postgres lenser_system
npm run migrate:shop
node scripts/migrate-products.js
```

If `dropdb` is not on your `PATH`, use:

```powershell
psql -U postgres -c "DROP DATABASE IF EXISTS lenser_system;"
```

Full reset deletes:

- users
- carts
- wishlists
- orders
- order items
- sessions
- catalog data

Re-seed afterward.

---

## 15. Troubleshooting

### `ECONNREFUSED` or `127.0.0.1:5432`

PostgreSQL is not running, or the host/port is wrong.

Check the service:

```powershell
Get-Service *postgres*
```

Check `.env` and confirm `PGHOST`, `PGPORT`, and `PGUSER`.

### `password authentication failed for user "postgres"`

`PGPASSWORD` does not match the PostgreSQL password.

Either update `.env` or reset the local PostgreSQL password.

### `database "lenser_system" does not exist`

Run:

```powershell
npm run migrate:shop
```

Or create it manually and run the migration again.

### `permission denied to create database`

The PostgreSQL role cannot create databases.

Use the `postgres` superuser for local development, grant `CREATEDB`, or create the database manually.

### `psql` is not recognized

Use the full path, replacing `16` with your PostgreSQL version:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" --version
```

You can also add `C:\Program Files\PostgreSQL\16\bin` to your user `PATH` and reopen PowerShell.

### The console reports `Failed to initialize products`

The app could not read the product catalog, usually because PostgreSQL is not running or the schema has not been applied.

1. Start PostgreSQL.
2. Run `npm run migrate:shop`.
3. Run `node scripts/migrate-products.js`.
4. Restart the server with `npm start`.

### The homepage has no products

The catalog is probably empty.

Run:

```powershell
node scripts/migrate-products.js
```

Restart the app afterward.

### Changes to `.env` are not applied

Stop the server with `Ctrl+C` and run:

```powershell
npm start
```

### Port 3000 is already in use

Find the process using the port:

```powershell
netstat -ano | findstr :3000
```

Stop it:

```powershell
Stop-Process -Id <PID>
```

Or change `PORT` in `.env`.

### Add to cart or the heart button sends me to Create Account

This is expected when logged out. Create an account or sign in first.

### I lost my password

There is no password-reset flow. For local development, create a new test account or reset the local database if you do not need the existing data.

### Migrations fail after pulling new code

Run:

```powershell
npm install
npm run migrate:shop
```

Then restart the server.

---

## 16. Known limitations

- No password-reset email flow.
- No admin order-status management UI.
- Checkout uses mock payment methods only: `cod` and `bank_transfer`.
- Cart, wishlist, checkout, and account features require login.
- No lint, typecheck, build, or test suite.
- Product seeding is destructive to catalog-related rows.

---

## 17. Security notes

- Never commit `.env`.
- Never share your PostgreSQL password.
- Replace the example `SESSION_SECRET`.
- Do not use real payment information.
- Do not run this local setup against a production database.
- Do not run the product seed script on data you need to keep.

---

## 18. License

This project is marked as ISC in `package.json`.
