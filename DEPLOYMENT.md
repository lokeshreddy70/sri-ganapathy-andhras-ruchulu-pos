# Production deployment checklist

## 1. Infrastructure

- PostgreSQL 16+ (managed PostgreSQL preferred for production)
- Node.js 20+
- HTTPS reverse proxy
- Persistent database backups
- One POS server origin, for example `https://pos.example.com`
- Optional Redis for Socket.IO when running more than one application instance

## 2. Environment

Set:

```text
NODE_ENV=production
PORT=4000
DATABASE_URL=<managed-postgresql-url>
JWT_SECRET=<random-64+-character-secret>
COOKIE_SECURE=true
PUBLIC_BASE_URL=https://pos.example.com
```

Bootstrap only once with the initial admin variables. Remove them from long-lived deployment environments after bootstrap if your deployment platform allows it.

## 3. Database

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
npm start
```

## 4. Branch URLs

After creating a branch, the admin receives a branch POS URL like:

```text
https://pos.example.com/b/canteen-4/pos
```

Do not share the main admin URL with branch cashiers.

## 5. Bench QR

For each branch:

- create/verify benches
- download `/api/benches/<bench-id>/qr.png` while authenticated as admin
- print the QR physically at the matching bench
- scan it with a phone before opening service
- verify the branch and bench name on the customer page
- submit a test order and confirm POS + KDS receive it

## 6. Thermal printer

For LAN ESC/POS:

- give each printer a static/reserved LAN IP
- configure port 9100 or the manufacturer's documented raw-print port
- create the printer in the branch POS/Admin
- install `print-agent` on a computer on the same LAN
- set `KR_POS_URL` and `PRINTER_AGENT_TOKEN`
- run the agent as a Windows/Linux service
- test a receipt and a KOT
- test printer unplug/replug and agent restart

For USB/Bluetooth printer hardware, select a supported local bridge or a supported browser Web Serial setup after testing the exact model.

## 7. Tax and billing

Before going live, the owner/accountant must configure:

- GST registration status
- GSTIN if registered
- invoice title
- tax rate(s)
- HSN/SAC policy
- bill numbering policy
- receipt header/footer
- cancellation/refund policy
- UPI/card/cash reconciliation policy

Do not assume the demo tax rate is correct for the business.

## 8. Operational tests

Run these before opening the canteen:

1. 20+ consecutive counter bills.
2. Two cashiers billing simultaneously.
3. Multiple QR orders arriving together.
4. QR order → accept → KDS → ready → served.
5. Bill PDF opened from order history.
6. Receipt printed from the thermal printer.
7. KOT printed from the kitchen printer.
8. Network disconnected while a cashier creates an order.
9. Network restored and offline order sync confirmed exactly once.
10. Duplicate submit/reload does not duplicate the bill.
11. Branch 1 cashier cannot access Branch 2 data.
12. Main admin can see both branches.
13. Password change and forced re-login.
14. Menu price change appears on new bills.
15. Old bills retain their historical unit price.
16. Database restore drill.

## 9. Scaling

For multiple branches and higher traffic:

- managed PostgreSQL
- connection pooling
- Redis Socket.IO adapter for multiple app instances
- CDN for static assets
- background worker for print jobs and heavy reports
- structured logs and metrics
- queue retry/dead-letter handling for printer failures
- scheduled backups and restore verification




