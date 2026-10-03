# Sri Ganapathy Andhra's Ruchulu — Canteen Operations Platform

Production-oriented full-stack foundation for a company canteen network. The product is designed around a main admin controlling any number of branches, branch-scoped POS logins, mobile QR bench ordering, live kitchen updates, PDF/thermal receipts, configurable billing, and offline-first POS behavior.

## Brand
- Business: **Sri Ganapathy Andhra's Ruchulu**
- Phone: **9490079466**
- Supplied brand artwork is included under `public/brand/` and used by the login/splash/receipt surfaces.

## Architecture

- Node.js 20+
- TypeScript + Express 5
- PostgreSQL 16 + Prisma
- HttpOnly cookie sessions using JWT
- bcrypt password hashing
- Socket.IO branch/order realtime events
- PDFKit receipt generation
- QRCode generation
- PWA manifest + service worker shell caching
- Local offline POS order queue with idempotency keys
- Optional LAN ESC/POS print agent
- Responsive POS/admin/customer/KDS interfaces

## Core flows

### Main Admin

1. Sign in to `/admin/`.
2. Create any number of branches.
3. Every branch receives its own slug/URL and branch-scoped sales login.
4. Create benches for that branch.
5. Download individual bench QR PNGs.
6. Configure receipt header/footer, GSTIN, invoice prefix, paper width, UPI ID and tax settings.
7. Create staff and reset staff passwords.
8. See consolidated branch sales/orders/expenses.

### Branch POS

`/b/<branch-slug>/pos`

- Branch-scoped login.
- Fast category/menu billing.
- Keyboard-wedge barcode scanner support: focus the search field, scan, press Enter.
- Dine-in / takeaway / delivery modes.
- Cash / UPI / card payment selection.
- Immediate server-side bill creation.
- Bill opens as a PDF in a new browser tab.
- Bill history is clickable and opens the same PDF.
- KOT/order status routing through realtime events.
- Offline queue when connectivity is lost; orders carry a client idempotency key and are retried after reconnect.

### Bench QR ordering

Each bench has a unique token. The QR opens:

`/order/<bench-token>`

The customer sees only that branch's active menu, submits the order, and receives a live order status screen. The POS/KDS receives the new order over Socket.IO and can accept/send it to the kitchen.

### Kitchen Display

`/kds/`

- Branch-scoped live queue.
- Pending → Preparing → Ready → Served states.
- QR and POS orders share the same order stream.

### Receipts

The PDF receipt supports:

- Business logo
- Business name
- Address
- Phone
- GSTIN when configured
- Configurable invoice title
- Invoice/bill number
- Date/time
- Source and bench
- Cashier
- Items, quantities, rates, HSN when configured
- Subtotal
- Discount
- Tax
- Total
- Payment method
- Optional UPI payment QR
- Configurable footer
- 58mm or 80mm paper sizing

The PDF endpoint is intentionally `inline`, so clicking a bill opens the document immediately and the browser print action can be used as a fallback.

## Thermal printing

Two production paths are provided:

1. **LAN ESC/POS printer + local print agent** — recommended for unattended counter printing. The agent polls the server and sends ESC/POS bytes to the configured printer IP/port.
2. **Browser Web Serial path** — can be added/enabled for compatible USB/serial/Bluetooth-emulating printers in a supported HTTPS browser. Web Serial is not universally supported, so the exact printer model must be tested before selecting it as the only print path.

Do not assume a generic USB printer can be driven reliably from every browser.

## First bootstrap — no demo credentials

Copy `.env.example` to `.env` and set a real admin password of at least 12 characters.

Required:

- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_PASSWORD`

Optional first branch bootstrap:

- `INITIAL_BRANCH_NAME`
- `INITIAL_BRANCH_CODE`
- `INITIAL_BRANCH_SALES_USERNAME`
- `INITIAL_BRANCH_SALES_PASSWORD`
- `INITIAL_BENCH_COUNT`

There are **no hard-coded demo usernames/passwords** in this project.

## Local setup

```bash
docker compose up -d
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open:

- `http://localhost:4000/pos/`
- `http://localhost:4000/admin/`
- `http://localhost:4000/kds/`

For QR URLs and Web Serial hardware, deploy through HTTPS and set `PUBLIC_BASE_URL` to the real public origin.

## Important production deployment work

This repository is deliberately not claiming that hardware, payments, or infrastructure are magically production-ready without testing. Before handing the system to the canteen, complete:

- HTTPS, secure cookies and production JWT secret
- Secret manager/environment protection
- Managed PostgreSQL backups + PITR
- Redis/managed Socket.IO adapter if horizontally scaling the server
- Load testing against expected cashier/QR traffic
- Automated API/unit/E2E tests
- Monitoring, error tracking and uptime alerts
- Printer-model validation, correct character encoding and cutter settings
- Local print agent installation on the same LAN as each network printer
- Exact GST/tax configuration approved for the business
- UPI/payment reconciliation process if using QR payments
- Full offline conflict/retry testing with power/network interruption
- Audit review for bill cancellation, discounts, price changes and password resets
- Production data retention and access policy

The code avoids fake integrations: where a hardware capability depends on the actual printer/browser/network, the integration point is explicit rather than pretending it is universally supported.




