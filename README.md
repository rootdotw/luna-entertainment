# Luna Stream IPTV — High-Conversion Web & Operations Platform

[![QA Audit Suite](https://img.shields.io/badge/QA%20Audit-49%2F49%20Passed-emerald.svg)](scripts/verify_final_qa.py)
[![Security Status](https://img.shields.io/badge/Security-PCI--DSS%20Compliant%20%7C%20PBKDF2-blue.svg)](#security--hardening)
[![Architecture](https://img.shields.io/badge/Stack-HTML5%20%7C%20Tailwind%20%7C%20Vanilla%20ES6%2B%20%7C%20PowerShell-purple.svg)](#technology-stack)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20Docker-slate.svg)](#deployment--production)

**Luna Stream IPTV** is an enterprise-grade, high-converting, mobile-first web platform and autonomous operational backend designed for premium IPTV streaming services. Built with clean semantic HTML5, Tailwind CSS, lightweight vanilla ES6+ controllers, and a high-performance, hardened PowerShell REST backend with atomic JSON data storage.

---

## 🌟 Key Capabilities & Features

### 1. High-Converting Storefront
- **Master Landing Page (`index.html`)**:
  - Hero showcase with live supernode status, 4K streaming mockup card, and dynamic sports schedule ticker.
  - Multi-server load-balancing breakdown, AntiFreeze™ streaming technology highlights, and device compatibility grid.
  - Verified subscriber reviews, interactive FAQ accordion, and 24-hour instant Free Trial modal.
- **Dynamic Pricing Calculator (`pricing.html`)**:
  - Live currency switcher supporting **GBP (£)**, **EUR (€)**, and **USD ($)**.
  - Multi-device selector (1, 2, 3, or 5 connections) dynamically calculated from the authoritative server catalog.
  - Automatic discount percentage badges and bonus extra months pills managed directly from the Admin Dashboard.
  - 7-Day 100% money-back guarantee badge.
- **Dynamic Sports Hub (`sports.html`)**:
  - Real calendar-aware scheduling engine with live countdown clocks, tournament filters (Premier League, Champions League, UFC PPV, Formula 1, NBA, NFL), and auto-refreshing match status transitions.
- **Interactive Device Setup Guides (`setup.html`)**:
  - Step-by-step installation tutorials for FireStick/Android TV, Apple TV/iOS, Samsung/LG Smart TVs, MAG Stalker portals, and PC/Mac.
  - 1-click Downloader shortcode copy tools and network troubleshooting advice.
- **Support Hub (`contact.html`)**:
  - Direct 24-hour test line request generator, lead intent tracking, and direct WhatsApp/Telegram links.
- **Authoritative Checkout Engine (`checkout.html`)**:
  - Live order customizer with dynamic plan, device, and currency selector.
  - Asynchronous coupon validation engine with real-time active status check and percentage/fixed discount deduction.
  - Anti-tampering price verification rejecting manipulated client amounts.
  - Instant WhatsApp & Telegram pre-formatted order dispatch.
  - PayPal Smart Buttons integration with automated status verification.
- **Complete Legal Suite**:
  - Fully compliant **Terms of Service (`terms.html`)**, **Privacy Policy (`privacy.html`)**, and **Refund Policy (`refund.html`)** matching the brand's dark glassmorphic design.

### 2. Self-Service Customer Portal (`portal.html`)
- **Customer Authentication**: Secure customer registration, session login, and 6-digit email password reset flow.
- **Active Subscription Dashboard**: Visual subscription tracker displaying plan tier, device count, remaining days countdown, and expiry status (`ACTIVE`, `EXPIRING_SOON`, `EXPIRED`).
- **Credential Protection**: Streaming credentials masked by default (`••••••••`). Unmasking requires a secure backend call to `/api/customer/reveal-credentials` with audit logging and automatic 30-second re-masking.
- **1-Click Playlist Download**: In-browser `.m3u` playlist generator for instant app import.
- **Interactive Support Desk**: Submit support tickets and view full conversation history with bidirectional agent replies.

### 3. Administrative Operations Console (`admin.html`)
- **Collapsible SaaS Sidebar Navigation**: Dashboard, Orders, Customers CRM, Subscriptions, Payments, Support Tickets, Coupons, Dynamic Pricing, Trials, Leads, Visitors, and Operational Settings.
- **Today's Action Hub**: Real-time alerts highlighting unfulfilled orders, subscriptions expiring within 3 days, pending trials, and open support tickets.
- **Financial & Margin KPIs**: Real-time calculations of Gross Revenue, Wholesale Line Costs, Net Profit, Profit Margin %, Active Lines, and Visitor Conversion %.
- **Plans & Pricing Manager**:
  - Edit prices across all plans and screen counts in GBP, EUR, and USD.
  - Configure strikethrough cut prices with bulk tools (`+25% All Plans`, `+35% All Plans`, `Clear Cuts`).
  - Add bonus extra months (`+1 Month`, `+2 Months`, `+3 Months`).
  - Changes instantly synchronize with the storefront and checkout without server restarts.
- **Coupons & Promo Codes Hub**:
  - Create, edit, and 1-click toggle coupons active/inactive.
  - Automatic synchronization between promo codes and the global storefront Sale Banner.
- **Customer CRM Profile Viewer**: Complete subscriber modal displaying lifetime value, active lines, assigned credentials, order ledger, and contact tags.
- **Order Fulfillment Wizard**: Assign Xtream credentials, generate M3U URLs, activate subscriptions, confirm payments, and produce 1-click WhatsApp customer delivery messages.
- **Bidirectional Support Ticket Console**: Filter tickets by priority and status, view conversation threads, post staff replies, and update ticket statuses.
- **Transactional Email Templates**: Template editor and live sample preview for automated customer notifications (`ORDER_RECEIVED`, `CREDENTIALS_DELIVERED`, `EXPIRY_REMINDER`, `PASSWORD_RESET`).
- **One-Click Database Snapshots**: Create instant ZIP backups of all database JSON files with automated 30-day retention.
- **IPTV Reseller Panel Integration**: Connect directly to Xtream/Stalker reseller panels (Andy-Pro, XC, etc.) for automated line provisioning and credit balance monitoring.

---

## 🔒 Security & Hardening

1. **PCI-DSS Compliance**: No raw credit card numbers or sensitive payment card data are processed or stored on the server.
2. **PBKDF2 Password Hashing**: Passwords derived using `Rfc2898DeriveBytes` (HMAC-SHA256, 10,000 iterations, 16-byte random salt). Legacy plaintext passwords auto-migrate on first login.
3. **Cryptographic Bearer Sessions**: 8-hour random 32-byte tokens generated via `RNGCryptoServiceProvider` replace static authorization tokens.
4. **Brute-Force Rate Limiting**: Auth endpoints limit failed attempts to 5 per 15 minutes per IP address.
5. **Path Traversal & Sensitive File Guard**: Requests containing `..`, pointing to `.ps1` files, or attempting direct access to the `/data/` directory are rejected with `403 Forbidden`.
6. **Data Mutex Concurrency**: Named Windows mutexes (`System.Threading.Mutex`) safeguard all database JSON read/write operations against race conditions and corruption.
7. **Server-Side Price Validation**: Checkout and PayPal endpoints cross-reference submitted prices against `data/pricing.json` and `data/coupons.json`—tampered prices are rejected with HTTP 400.
8. **GDPR-Compliant Telemetry**: Cookie consent banner gates tracking; visitor logging uses non-invasive session hashes without storing personal information.

---

## 📁 Project Architecture

```
pulsestream-iptv/
├── index.html                  # Master storefront landing page
├── pricing.html                # Subscription plans & interactive calculator
├── sports.html                 # Dynamic sports hub & live countdown schedule
├── setup.html                  # Device installation guides & shortcodes
├── checkout.html               # Multi-gateway checkout & coupon engine
├── contact.html                # Support hub & 24h free trial request form
├── portal.html                 # Self-service customer account portal
├── admin.html                  # Administrative management dashboard
├── privacy.html                # Privacy policy & data processing terms
├── refund.html                 # Refund & cancellation policy
├── terms.html                  # Terms of service & acceptable use
├── favicon.ico / .png / .svg   # Multi-resolution brand icons
├── manifest.json               # Web app manifest
├── robots.txt                  # SEO crawler rules
├── sitemap.xml                 # Search engine sitemap
├── serve.ps1                   # Standalone PowerShell REST backend server
├── assets/
│   ├── css/
│   │   └── style.css           # Custom glassmorphism, focus rings, dark theme
│   └── js/
│       ├── main.js             # Navigation, trial modal, FAQ, consent banner
│       ├── pricing.js          # Dynamic pricing fetch & plan renderer
│       ├── sports.js           # Calendar-aware fixtures & countdown engine
│       ├── setup.js            # Device setup tabs & copy helpers
│       ├── checkout.js         # Order calculation & coupon validation
│       ├── portal.js           # Customer auth, line unmasking & tickets
│       ├── admin.js            # Admin console controller & API wrappers
│       └── tracker.js          # GDPR visitor telemetry
├── data/                       # Atomic JSON database (protected from HTTP)
│   ├── pricing.json            # Authoritative pricing & duration catalog
│   ├── settings.json           # Business configurations & panel keys
│   ├── customers.json          # Customer CRM profiles & hashes
│   ├── subscriptions.json      # Provisioned IPTV lines & expiry dates
│   ├── orders.json             # Order ledger
│   ├── payments.json           # Transaction records
│   ├── coupons.json            # Promo code rules & usage limits
│   ├── support_tickets.json    # Bidirectional support ticket threads
│   ├── email_templates.json    # Transactional notification templates
│   ├── sports_fixtures.json    # Cached sporting events & tournament data
│   ├── trials.json             # 24H test line submissions
│   ├── leads.json              # Captured prospect leads
│   ├── visitors.json           # Anonymous traffic telemetry
│   └── audit_log.json          # Administrative security audit trail
└── scripts/                    # Automation & QA test suite
    ├── verify_final_qa.py      # Master 49-point automated test suite
    ├── test_ticket_bidirectional.py # End-to-end support ticket test
    ├── test_coupon_sync_full.py     # Banner & coupon synchronization test
    ├── test_admin_pricing_full.py   # Admin pricing & cut prices test
    ├── test_pages_headless_chrome.py# Headless Chrome DOM render test
    └── generate_sports_fixtures.py  # Automated sports calendar generator
```

---

## 🚀 Running the Platform

### Prerequisites
- **Windows**: PowerShell 5.1 or PowerShell 7+ (pre-installed on Windows 10/11 / Server).
- **Python**: Python 3.8+ (for running automated verification suites).
- **Google Chrome**: (Optional, for headless browser DOM testing).

### Starting the Server
Open PowerShell in the project directory and execute:
```powershell
.\serve.ps1 -Port 8081
```

Once started, the server listens at:
- **Storefront**: [http://localhost:8081](http://localhost:8081)
- **Customer Portal**: [http://localhost:8081/portal.html](http://localhost:8081/portal.html)
- **Admin Dashboard**: [http://localhost:8081/admin.html](http://localhost:8081/admin.html)

### Default Admin Credentials
- **Master Password**: `admin`
- On first login, the server automatically upgrades this password to a salted PBKDF2 hash.
- To change the password, navigate to the **Settings** tab in the Admin Dashboard or use the change password dialog.

---

## 🧪 Automated Verification Suite

Run the full end-to-end regression audit at any time to verify system integrity:

```powershell
python .\scripts\verify_final_qa.py
```

### Test Suite Coverage (49/49 Passing):
1. **HTTP 200 Page Availability**: Verifies all 11 HTML pages return HTTP 200 OK.
2. **Deprecated Route Elimination**: Verifies removed routes (`/channels.html`) return HTTP 404.
3. **Static Asset Availability**: Verifies CSS, JS, favicons, and manifests load cleanly.
4. **Backend Public APIs**: Validates `/api/public/config`, `/api/sports/fixtures`, and `/api/announcement`.
5. **Link Integrity & Anchors**: Scans all 325+ links across all pages for broken targets or dead `#` links.
6. **Button Names & Accessibility**: Audits 206+ buttons for proper accessible labels and event handlers.
7. **Production JS Cleanliness**: Verifies zero `console.log` statements and zero raw `alert()` popups.
8. **Performance & CSS Standards**: Validates font preconnects, smooth scrolling, and zero render-blocking CSS imports.
9. **SEO & Metadata Completeness**: Verifies titles, OpenGraph tags, viewports, and canonical links.
10. **Dynamic Pricing & Anti-Tampering**: Confirms server pricing engine rejects manipulated prices.
11. **Security & Authentication**: Verifies 401 on unauthorized admin routes and validates Bearer token issuance.
12. **Path Traversal Guard**: Confirms direct access to `.ps1`, `/data/`, and `..` paths returns HTTP 403.
13. **Customer Journeys**: Verifies trial submissions and support ticket creation.

---

## 📄 License & Intellectual Property

Copyright &copy; 2026 Luna Stream IPTV. All rights reserved.  
Proprietary software for administrative and commercial operations.
