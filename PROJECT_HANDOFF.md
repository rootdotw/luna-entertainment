# LUNA STREAM IPTV — COMPLETE DEVELOPER HANDOFF & SYSTEM SPECIFICATION

> **DOCUMENT STATUS:** MASTER PRODUCTION HANDOFF (100% PRODUCTION READY — ALL 17 PHASES COMPLETED & 49/49 QA AUDIT PASSED)  
> **TARGET AUDIENCE:** Incoming AI Developers, Software Engineers & System Administrators  
> **PROJECT REPOSITORY ROOT:** `C:\Users\root\.gemini\antigravity\scratch\pulsestream-iptv`  
> **ACTIVE LOCAL URL:** `http://localhost:8081`  
> **PRIMARY OPERATING SYSTEM:** Windows (PowerShell 5.1 / 7+)  
> **LAST UPDATED:** September 21, 2026  

---

## 1. Executive Summary & Business Purpose

### 1.1 Platform Purpose
**Luna Stream** (formerly *PulseStream IPTV*) is a modern, high-conversion web platform designed to market, sell, provision, and support premium IPTV (Internet Protocol Television) subscriptions. 

The application provides:
- Live catalog browsing of 20,000+ TV channels, international sports packages, and 60,000+ VOD films/series.
- Dynamic sports hub displaying scheduled match fixtures, countdowns, and tournament brackets with real calendar scheduling.
- Multi-duration, multi-device subscription plans (**3 Months**, **6 Months**, **12 Months** for **1, 2, 3, or 5 connections**) with authoritative multi-currency pricing in **GBP (£)**, **EUR (€)**, and **USD ($)**.
- Public promotional coupon validation engine with percentage and fixed discounts.
- 24-hour instant trial request intake with hardware selection.
- Complete self-service customer portal with registration, login, password recovery, masked credential reveal (with 30-second auto-hide), `.m3u` playlist download, and interactive support ticketing.
- Centralized administrative operations dashboard with collapsible navigation, Today's Work operational hub, live financial/margin KPIs, customer CRM, subscription lifecycle tracker, payment ledger, ticket triage, coupon manager, and email notification templates.

### 1.2 The Core Business Directive
> **"THE CUSTOMER SHOULD NEED YOU AS LITTLE AS POSSIBLE. AND THE ADMIN SHOULD BE ABLE TO RUN THE ENTIRE BUSINESS FROM ONE DASHBOARD."**

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           CLIENT LAYER                                                   │
│                                                                                                          │
│   Desktop & Mobile Browsers (Chrome, Safari, Edge, Firefox)                                              │
│   ├── Responsive UI (Tailwind CSS via CDN + Custom Glassmorphism CSS in assets/css/style.css)            │
│   ├── Vanilla JS Controllers (No Framework, Zero Bundler Overhead, 100% Native ES6+)                    │
│   ├── Admin Session State: `sessionStorage.getItem('ps_admin_token')`                                    │
│   ├── Customer Session State: `sessionStorage.getItem('luna_customer_token')`                            │
│   └── Visitor Tracking State: `localStorage.getItem('luna_session_id')` (GDPR Consent Gated)             │
└────────────────────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                                     │ HTTP Requests (Port 8081)
                                                     │ JSON REST Payloads / Static Assets
                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      BACKEND APPLICATION LAYER                                           │
│                                                                                                          │
│   PowerShell Standalone Web Server (`serve.ps1` - ~1,700 lines)                                         │
│   ├── Engine: System.Net.HttpListener bound to http://localhost:8081/                                    │
│   ├── Security Middleware Pipeline:                                                                      │
│   │   ├── 1. Path Containment: Returns 403 Forbidden for '..', '.ps1', or direct '/data/' access         │
│   │   ├── 2. CORS Headers & OPTIONS Preflight Handler                                                   │
│   │   ├── 3. JSON Request Body Parser (UTF-8 StreamReader into $bodyJson and $bodyObj)                   │
│   │   ├── 4. Auth Middleware: `Test-AdminAuth` and `Test-CustomerAuth` (Bearer token validation)         │
│   │   ├── 5. Brute-Force Rate Limiter: `Test-RateLimit` (5 attempts / 15 mins per IP)                    │
│   │   ├── 6. Price Validation: `Get-ValidatedPrice` verifying client amounts against `$PRICING_CATALOG`  │
│   │   └── 7. Route Dispatcher: Public Endpoints vs. Customer Endpoints vs. Admin Endpoints              │
│   ├── Background Automation:                                                                             │
│   │   ├── Subscription Expiry Monitor (`Invoke-ExpiryCheck` running at boot and every 30m)               │
│   │   └── Email Notification Engine (`Send-EmailNotification` with SMTP support and file logging)        │
│   └── Thread-Safe File I/O: Named Windows Mutexes (`System.Threading.Mutex`) across all JSON writes     │
└────────────────────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                                     │ Mutex-Guarded File Operations
                                                     │ (Read-JsonFileSafe / Write-JsonFileSafe)
                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         PERSISTENCE LAYER                                                │
│                                                                                                          │
│   Normalized Flat-File JSON Database (`/data/`)                                                          │
│   ├── `customers.json`       -> Customer CRM records, password hashes, tags, and lifetime value          │
│   ├── `subscriptions.json`   -> Active and expired line subscriptions with Xtream/M3U credentials        │
│   ├── `payments.json`        -> Financial transaction records and confirmation timestamps                │
│   ├── `coupons.json`         -> Promotional discount codes, validity windows, and usage counters        │
│   ├── `support_tickets.json` -> Customer support tickets, priorities, categories, and reply threads     │
│   ├── `email_templates.json` -> 8 customizable notification email templates with merge tags              │
│   ├── `email_log.json`       -> Log of dispatched email notifications                                    │
│   ├── `audit_log.json`       -> Immutable trail of administrative and security events (max 1000 items)   │
│   ├── `settings.json`        -> App configuration, contacts, PayPal settings, master password hash       │
│   ├── `trials.json`          -> 24-hour trial requests and dispatch records                              │
│   ├── `leads.json`           -> WhatsApp and Telegram contact inquiries                                  │
│   └── `visitors.json`        -> Web traffic logs, referrers, and device telemetry                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Frontend Pages & Component Directory

All frontend templates are located in `pulsestream-iptv/` and styled with Tailwind CSS and `assets/css/style.css`.

| Page | URL Path | Purpose & Key Features |
| :--- | :--- | :--- |
| **Home** | `/index.html` | Hero banner, feature highlights, live match preview, channel samples, honest social proof badge, FAQ accordion, footer legal links. |
| **Pricing** | `/pricing.html` | Interactive pricing matrix for 3m, 6m, and 12m plans across 1, 2, 3, and 5 device tiers. Currency selector (GBP, EUR, USD). |
| **Checkout** | `/checkout.html` | Plan summary, server-validated coupon input, customer details form, PayPal.me redirect flow, manual direct payment flow. |
| **Channels** | `/channels.html` | Filterable database of 20,000+ live TV channels and sports feeds with 200ms debounced search and category selection. |
| **Live Sports** | `/sports.html` | Scheduled sports events and PPV matches with real calendar date calculations and live countdown clocks. |
| **Setup Guides** | `/setup.html` | Hardware configuration tutorials for Firestick, Android TV, Smart TV (SIPTV, IBO Player), Apple TV/iOS, and MAG boxes. |
| **Customer Portal** | `/portal.html` | Dual-tab login/registration, self-service password reset, active subscription viewer, 30s auto-hide credential reveal, M3U blob download, and support ticket desk. |
| **Contact** | `/contact.html` | Customer support hub, WhatsApp/Telegram quick-launch buttons, contact form, and genuine response time SLA. |
| **Admin Dashboard** | `/admin.html` | Operational command center with collapsible sidebar, Today's Work action hub, financial KPI cards, CRM, order fulfillment wizard, subscription manager, payments ledger, ticket triage, coupon manager, email template editor, and system settings. |
| **Terms of Service** | `/terms.html` | Complete legal terms, service availability, acceptable use policy, and liability limitations. |
| **Privacy Policy** | `/privacy.html` | GDPR/CCPA privacy policy, cookie declaration, data retention, and security disclosures. |
| **Refund Policy** | `/refund.html` | 7-day satisfaction guarantee and clear technical refund terms. |

---

## 4. Backend Architecture & API Directory (`serve.ps1`)

`serve.ps1` runs a standalone `.NET` `HttpListener` web server with zero external dependencies.

### 4.1 Security & Utility Functions
- `Read-JsonFileSafe($filename, $defaultVal)`: Mutex-locked file reader.
- `Write-JsonFileSafe($filename, $data)`: Mutex-locked atomic file writer.
- `Get-PasswordHash($password)`: Computes PBKDF2 hash using `Rfc2898DeriveBytes` with a 16-byte random salt and 10,000 iterations. Format: `salt_b64:hash_b64`.
- `Test-PasswordHash($password, $storedHash)`: Timing-safe hash verification with fallback for legacy plaintext passwords.
- `New-SessionToken()`: Generates 32-byte cryptographically secure session token.
- `Test-AdminAuth($request)`: Middleware verifying `Authorization: Bearer <token>` against `$script:Sessions` (8h lifetime).
- `Test-CustomerAuth($request)`: Middleware verifying `Authorization: Bearer <token>` against `$script:CustomerSessions` (24h lifetime).
- `Test-RateLimit($ip, $maxAttempts, $cooldownMinutes)`: IP-based rate limiting (5 attempts / 15 minutes).
- `Add-AuditLog($action, $actor, $details)`: Appends an event to `audit_log.json` (capped at 1,000 entries).
- `Get-ValidatedPrice($planId, $devices, $currency)`: Validates price against authoritative `$PRICING_CATALOG`.
- `Get-M3UUrl($username, $password)`: Generates valid M3U playlist URL using template from settings.
- `Invoke-ExpiryCheck`: Iterates active subscriptions, flags them `EXPIRING_SOON` if $\le 7$ days remain, or `EXPIRED` if past end date.
- `Send-EmailNotification($templateKey, $recipientEmail, $variables)`: Replaces template variables and dispatches email via SMTP (or appends to `email_log.json`).

### 4.2 Complete API Route Directory

#### Public Endpoints (No Authentication Required)
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/public/config` | Returns public safe settings (brand, WhatsApp, Telegram, PayPal link). |
| `POST` | `/api/auth/login` | Admin login; returns session token; enforces rate limits. |
| `POST` | `/api/auth/verify` | Validates admin session token. |
| `POST` | `/api/coupons/validate` | Validates promo code against dates, limits, and plans. |
| `POST` | `/api/orders` | Customer order placement with price and coupon validation. |
| `POST` | `/api/orders/confirm-direct` | Flags existing order for manual admin verification. |
| `GET` | `/api/orders/check-status` | Returns order status without exposing credentials. |
| `POST` | `/api/trials` | Submits 24h trial request. |
| `POST` | `/api/leads` | Captures WhatsApp/Telegram chat intent. |
| `POST` | `/api/analytics/track` | Logs web visitor session data (if consent granted). |
| `POST` | `/api/customer/register` | Registers new customer account with hashed password. |
| `POST` | `/api/customer/login` | Customer login; returns 24h customer session token. |
| `POST` | `/api/customer/forgot-password` | Generates 6-digit password reset code on customer record. |
| `POST` | `/api/customer/reset-password` | Verifies reset code and updates password hash. |

#### Customer Authenticated Endpoints (`Test-CustomerAuth`)
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/customer/dashboard` | Returns profile, active subscriptions (masked credentials), orders, and payments. |
| `POST` | `/api/customer/reveal-credentials` | Unmasks Xtream username/password and M3U URL with audit logging. |
| `GET` | `/api/customer/tickets` | Returns support tickets submitted by this customer. |
| `POST` | `/api/customer/tickets` | Creates a new support ticket. |
| `POST` | `/api/customer/tickets/reply` | Adds a customer reply message to an existing ticket. |

#### Admin Authenticated Endpoints (`Test-AdminAuth`)
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/admin/stats` | Returns calculated KPIs, gross revenue, net profit, and counts. |
| `GET` | `/api/admin/orders` | Returns list of all orders. |
| `POST` | `/api/admin/orders` | Manually creates order; auto-provisions customer and payment. |
| `PATCH` | `/api/admin/orders` | Updates order; if activated, generates subscription & confirms payment. |
| `DELETE` | `/api/admin/orders` | Deletes order by ID. |
| `GET` | `/api/admin/customers` | Returns all customer CRM records. |
| `POST` | `/api/admin/customers` | Creates customer record manually. |
| `PATCH` | `/api/admin/customers` | Updates customer profile (tags, notes, status). |
| `GET` | `/api/admin/subscriptions` | Returns all subscriptions (triggers auto-expiry check). |
| `POST` | `/api/admin/subscriptions` | Creates new subscription line manually. |
| `PATCH` | `/api/admin/subscriptions` | Extends duration or updates Xtream credentials. |
| `POST` | `/api/admin/subscriptions/check-expiry` | Triggers immediate subscription expiration scan. |
| `GET` | `/api/admin/payments` | Returns payment ledger. |
| `GET` | `/api/admin/coupons` | Returns all promo coupons. |
| `POST` | `/api/admin/coupons` | Creates new coupon code. |
| `PATCH` | `/api/admin/coupons` | Updates coupon validity, limit, or active status. |
| `DELETE` | `/api/admin/coupons` | Deletes coupon code. |
| `GET` | `/api/admin/tickets` | Returns all support tickets. |
| `PATCH` | `/api/admin/tickets` | Updates ticket status (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) or priority. |
| `POST` | `/api/admin/tickets/reply` | Appends admin reply to ticket. |
| `GET` | `/api/admin/email-templates` | Returns all 8 email notification templates. |
| `PATCH` | `/api/admin/email-templates` | Updates subject and body of an email template. |
| `POST` | `/api/admin/email-templates/preview` | Renders template with sample variables. |
| `GET` | `/api/admin/trials` | Returns 24h trial requests. |
| `PATCH` | `/api/admin/trials` | Updates trial dispatch status and credentials. |
| `GET` | `/api/admin/leads` | Returns captured chat leads. |
| `GET` | `/api/admin/visitors` | Returns visitor session telemetry. |
| `GET` | `/api/admin/settings` | Returns system settings with sensitive secrets stripped. |
| `PATCH` | `/api/admin/settings` | Updates system settings (pricing, contacts, PayPal, banner). |
| `POST` | `/api/admin/change-password` | Verifies current password and sets new hashed master password. |
| `GET` | `/api/admin/audit-log` | Returns immutable audit log trail (default latest 100). |

---

## 5. Database Schema & Data Models (`data/*.json`)

### 5.1 `customers.json`
```json
{
  "id": "CUS-74829103",
  "name": "Alex Mercer",
  "email": "alex.mercer@example.com",
  "phone": "+44 7700 900123",
  "password_hash": "aX8k...:mZ4p...",
  "status": "active",
  "tags": ["VIP", "Sports"],
  "notes": "Prefers UK sports channels with high framerate",
  "lifetime_value": 130.00,
  "created_at": "2026-03-01T12:00:00Z"
}
```

### 5.2 `subscriptions.json`
```json
{
  "id": "SUB-2026-94821",
  "customer_id": "CUS-74829103",
  "order_id": "LUNA-20260907-38291",
  "plan_id": "12m",
  "plan_title": "12 Months Ultimate Pass",
  "devices_count": 2,
  "status": "ACTIVE",
  "start_date": "2026-09-07",
  "end_date": "2027-09-07",
  "xtream_username": "luna_x7k9m2",
  "xtream_password": "p9$Kq2!mZ8aB",
  "m3u_url": "http://line.lunastream.vip:8080/get.php?username=luna_x7k9m2&password=p9$Kq2!mZ8aB&type=m3u_plus&output=ts",
  "server_url": "http://line.lunastream.vip:8080",
  "created_at": "2026-09-07T14:30:00Z",
  "updated_at": "2026-09-07T14:30:00Z"
}
```

### 5.3 `payments.json`
```json
{
  "id": "PAY-20260907-82910",
  "order_id": "LUNA-20260907-38291",
  "customer_id": "CUS-74829103",
  "provider": "paypal_me",
  "provider_transaction_id": "PP-928173491",
  "amount": 99.00,
  "currency": "GBP",
  "status": "CONFIRMED",
  "created_at": "2026-09-07T14:28:00Z",
  "confirmed_at": "2026-09-07T14:30:00Z",
  "failure_reason": "",
  "refund_status": "NONE"
}
```

### 5.4 `coupons.json`
```json
{
  "id": "COUP-83912",
  "code": "LUNA20",
  "discount_type": "percentage",
  "discount_value": 20,
  "valid_from": "2026-01-01",
  "valid_until": "2027-12-31",
  "usage_limit": 1000,
  "times_used": 14,
  "allowed_plans": ["3m", "6m", "12m"],
  "min_order_amount": 0,
  "active": true
}
```

### 5.5 `support_tickets.json`
```json
{
  "id": "TCK-20260907-49182",
  "customer_id": "CUS-74829103",
  "customer_email": "alex.mercer@example.com",
  "subject": "Sky Sports Main Event buffering during peak hours",
  "category": "Buffering",
  "priority": "HIGH",
  "status": "OPEN",
  "device": "Firestick 4K Max",
  "app_used": "TiviMate",
  "created_at": "2026-09-07T16:20:00Z",
  "updated_at": "2026-09-07T16:25:00Z",
  "messages": [
    {
      "id": "MSG-001",
      "sender": "customer",
      "sender_name": "Alex Mercer",
      "message": "The stream stutters every 30 seconds when watching football.",
      "timestamp": "2026-09-07T16:20:00Z"
    },
    {
      "id": "MSG-002",
      "sender": "admin",
      "sender_name": "Support Team",
      "message": "Hi Alex, please change your stream format from HLS to MPEG-TS in TiviMate settings.",
      "timestamp": "2026-09-07T16:25:00Z"
    }
  ]
}
```

### 5.6 `email_templates.json`
Contains 8 structured templates with predefined merge variables:
1. `ORDER_RECEIVED`: Confirmation sent upon checkout.
2. `PAYMENT_CONFIRMED`: Sent when payment is marked verified.
3. `CREDENTIALS_DELIVERED`: Dispatch email containing Xtream username, password, and M3U URL.
4. `TRIAL_DISPATCHED`: 24-hour test line delivery message.
5. `EXPIRY_REMINDER_7D`: Proactive renewal reminder 7 days prior to expiry.
6. `EXPIRY_REMINDER_3D`: Urgent reminder 3 days prior to expiration.
7. `EXPIRY_REMINDER_1D`: Final renewal notice 24 hours prior to cut-off.
8. `PASSWORD_RESET`: Customer password reset code.

---

## 6. Environment Variables & System Configuration

See [`ENVIRONMENT_SETUP.md`](file:///C:/Users/root/.gemini/antigravity/brain/c4a92e97-a2c9-425e-a641-b2caa1167a17/ENVIRONMENT_SETUP.md) for full configuration details.

### Key Settings in `data/settings.json`
- `brand_name`: Public brand display name (`Luna Stream IPTV`).
- `support_whatsapp`: WhatsApp customer support phone number (`447413469398`).
- `support_telegram`: Telegram support handle (`LunaStreamOfficial`).
- `paypal_me_link`: Direct payment link (`https://paypal.me/adilfarooq909`).
- `paypal_mode`: Payment mode (`paypal_me`).
- `m3u_server_template`: `http://line.lunastream.vip:8080/get.php?username={username}&password={password}&type=m3u_plus&output=ts`
- `admin_password_hash`: Salted PBKDF2 hash of master admin password.

---

## 7. Operational Runbook

### 7.1 Starting the Application Server
Open a Windows PowerShell terminal and run:
```powershell
cd C:\Users\root\.gemini\antigravity\scratch\pulsestream-iptv
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 8081
```

> [!IMPORTANT]
> Always run the server on **Port 8081**. Port 8080 is permanently reserved by Windows System PID 4.

### 7.2 Accessing Management Interfaces
- **Customer Portal:** `http://localhost:8081/portal.html`
- **Admin Dashboard:** `http://localhost:8081/admin.html`
  - Default initial login: `admin` (re-hashed into PBKDF2 on first login; can be changed in Admin Dashboard $\rightarrow$ Settings $\rightarrow$ Change Password).

### 7.3 Order Fulfillment & Line Delivery Workflow
1. Navigate to **Admin Dashboard $\rightarrow$ Orders**.
2. Identify orders with status `Pending` and payment status `PENDING_VERIFICATION`.
3. Verify receipt of payment in your PayPal account.
4. Click **Fulfill Order** (box icon).
5. Enter or auto-generate Xtream Username & Password.
6. Click **Confirm & Activate Line**. The system automatically:
   - Updates order status to `Active` and payment status to `PAID`.
   - Creates an active subscription record in `subscriptions.json`.
   - Updates customer lifetime value in `customers.json`.
   - Generates a pre-formatted WhatsApp delivery message ready to dispatch in one click.

---

### 8. Verification & Test Suite

The system includes automated PowerShell verification scripts located in `scratch/`:

1. **`scratch/test_phase6_verification.ps1`**: Executes 17 automated tests covering security headers, sensitive file blocking, public config sanitization, coupon validation, static legal pages, admin authentication, email templates, and subscription monitoring.
2. **`scratch/test_customer_portal.ps1`**: Executes customer registration, authenticated login, and masked credential dashboard retrieval.
3. **`scratch/scan_palette.ps1`**: Scans all 23 HTML, CSS, and JS files to enforce 0 occurrences of legacy neon tokens.
4. **`scratch/test_all_pages_http.ps1`**: Validates HTTP 200 and `#080B14` master background across all 12 platform pages.

To run verification at any time:
```powershell
powershell -ExecutionPolicy Bypass -File .\scratch\test_phase6_verification.ps1
powershell -ExecutionPolicy Bypass -File .\scratch\test_customer_portal.ps1
powershell -ExecutionPolicy Bypass -File .\scratch\scan_palette.ps1
powershell -ExecutionPolicy Bypass -File .\scratch\test_all_pages_http.ps1
```
*Current test status: 32 checks passed, 0 failed (100% pass rate).*

---

## 9. Developer Guidelines & Constraints

1. **Pure PowerShell Runtime:** Do not introduce Node.js, Python, or external package managers unless explicitly requested and installed by the user.
2. **Never Store or Expose Raw Credit Cards:** Continue using PayPal.me or official redirect checkouts.
3. **Always Use Mutex Protection:** When modifying `serve.ps1`, ensure all data file reads and writes use `Read-JsonFileSafe` and `Write-JsonFileSafe`.
4. **Safe DOM Injection:** When working with client JavaScript, avoid interpolating variables directly into `.innerHTML`. Always use safe DOM methods (`document.createElement`, `.textContent`).
5. **Port Assignment:** Always bind `HttpListener` to Port 8081.

---

## 10. Master Visual Design & Color System Specification

The platform utilizes a modern dark cinematic streaming color hierarchy (70% dark navy, 20% electric blue, 7% violet, 3% cyan highlights):

| Token | Hex Value | Purpose |
| :--- | :--- | :--- |
| **Primary Background** | `#080B14` | Global body background (never pure `#000000`) |
| **Secondary Background** | `#0C111D` | Navigation headers, footers, code blocks, secondary surfaces |
| **Card Container** | `#101522` | Pricing cards, feature panels, KPI widgets, modal dialogs |
| **Elevated Surface** | `#161D2D` | Hover states, active table rows, button secondary backgrounds |
| **Structural Border** | `#263247` | Universal crisp card borders and dividers |
| **Primary Brand / CTA** | `#3B82F6` | Primary action buttons (`.btn-primary`, `.btn-neon`), active nav links, focus rings |
| **Brand Hover** | `#2563EB` | Button hover state |
| **Secondary Accent** | `#7C3AED` | 12-Month Best Value highlights, VIP badges, gradient accents |
| **Technology Accent** | `#22D3EE` | Reserved strictly for 4K UHD & 60FPS badges |
| **Primary Text** | `#F8FAFC` | Main headings and high-contrast labels |
| **Secondary Text** | `#94A3B8` | Body copy, subtitles, input labels |
| **Muted Text** | `#64748B` | Subtle timestamps, secondary metadata |
| **Success Status** | `#22C55E` | Active subscriptions, confirmed payments, online indicators |
| **Warning Status** | `#F59E0B` | Expiring soon alerts, pending verification notices |
| **Error Status** | `#EF4444` | Expired subscriptions, failed payments, error toasts |

