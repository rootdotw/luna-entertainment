# LUNA STREAM IPTV — ENVIRONMENT & CONFIGURATION SETUP

> **DOCUMENT STATUS:** OFFICIAL CONFIGURATION SPECIFICATION  
> **APPLICATION:** Luna Stream IPTV Platform  
> **PROJECT REPOSITORY ROOT:** `C:\Users\root\.gemini\antigravity\scratch\pulsestream-iptv`  
> **PRIMARY CONFIGURATION STORE:** `data/settings.json` & PowerShell Runtime Parameters  
> **SECURITY NOTICE:** This document contains **no actual secret values**. Only placeholders and structural schemas are provided.

---

## 1. Overview of Configuration Architecture

Luna Stream currently uses a two-tier configuration system:

1. **CLI Runtime Parameters:** Passed directly to `serve.ps1` at execution time (e.g. `-Port 8081`).
2. **Persistent Configuration Store (`data/settings.json`):** A JSON document containing system settings, operational toggles, wholesale costs, marketing copy, and payment integration credentials.

For production deployment (Docker, systemd, Windows Services, or cloud environments), standard environment variables (e.g. `PORT`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`) can be mapped directly to these configuration keys.

---

## 2. Master Configuration & Environment Variables Directory

### 2.1 Server & Network Runtime

| Environment Variable | JSON Key (`settings.json`) | Type | Status | Default Value | Code References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `PORT` / `LUNA_PORT` | `N/A` (CLI Param) | Integer | **Required** | `8080` (Run with `8081`) | `serve.ps1` (Lines 1–4, 112–119) | The TCP port bound by `System.Net.HttpListener`. Port `8080` is reserved by Windows System PID 4; port `8081` must be passed via `-Port 8081`. |
| `FOLDER` / `LUNA_ROOT` | `N/A` (CLI Param) | String | Optional | `$PSScriptRoot` | `serve.ps1` (Lines 1–6, 987) | Absolute or relative filesystem path to the web root serving HTML/CSS/JS assets. |
| `LUNA_DATA_DIR` | `N/A` (Derived) | String | Optional | `Join-Path $Folder "data"` | `serve.ps1` (Lines 7–8) | Directory storing all database files (`orders.json`, `settings.json`, etc.). |

---

### 2.2 Administrative Security & Access Control

| Environment Variable | JSON Key (`settings.json`) | Type | Status | Default Fallback | Code References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ADMIN_PASSWORD` | `admin_password` | String | **Required** *(Secret)* | Auto-hashed on first run | `serve.ps1` (Lines 160–175), `admin.html` (Line 52) | Master administrative password. Stored initially in plaintext or PBKDF2 format (`salt_b64:hash_b64`). The server automatically hashes plaintext on first successful login. |
| `AUTH_TOKEN` | `auth_token` | String | Optional *(Legacy)* | `ps_sec_token_99281a8b` | `serve.ps1` (Lines 160–185), `settings.json` | Legacy static administrative token. Active authentication has been upgraded to dynamic 32-byte session tokens generated in memory. |
| `SESSION_TIMEOUT_HOURS` | `session_timeout_hours` | Integer | Optional | `8` | `serve.ps1` (Line 125) | Duration in hours before an administrative session token expires in server memory. |
| `MAX_LOGIN_ATTEMPTS` | `max_login_attempts` | Integer | Optional | `5` | `serve.ps1` (Line 135) | Maximum consecutive failed login attempts before an IP address is blocked. |
| `LOGIN_COOLDOWN_MINUTES` | `login_cooldown_minutes` | Integer | Optional | `15` | `serve.ps1` (Line 135) | Cooldown duration in minutes after `MAX_LOGIN_ATTEMPTS` is triggered. |

---

### 2.3 Payment Gateway (PayPal Integration)

| Environment Variable | JSON Key (`settings.json`) | Type | Status | Default Fallback | Code References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `PAYPAL_MODE` | `paypal_mode` | String | **Required** | `"paypal_me"` | `serve.ps1` (Lines 315, 956), `checkout.js` (Line 78) | Determines active checkout flow: `"paypal_me"` (opens PayPal.me in new tab) or `"rest_api"` (PayPal Smart Buttons v2). Set to `"paypal_me"`. |
| `PAYPAL_ME_LINK` | `paypal_me_link` | String | **Required** | `"https://paypal.me/..."` | `serve.ps1` (Line 955), `checkout.js` (Line 855), `admin.js` (Line 1058) | Direct payment URL where customers send subscription funds. |
| `PAYPAL_EMAIL` | `paypal_email` | String | Optional | Merchant email | `serve.ps1` (Line 954), `checkout.js` (Line 60), `admin.js` (Line 1057) | Merchant email address for PayPal payment notifications and fallback verification. |
| `PAYPAL_CLIENT_ID` | `paypal_client_id` | String | Optional *(When in REST mode)* | REST API Client ID | `serve.ps1` (Lines 317, 390, 473), `checkout.js` (Line 670), `admin.js` (Line 1018) | Public OAuth 2.0 Client ID provided by PayPal Developer Dashboard. Used to load PayPal JS SDK. |
| `PAYPAL_CLIENT_SECRET` | `paypal_client_secret` | String | Optional *(Secret)* | REST API Client Secret | `serve.ps1` (Lines 318, 391, 474) | Private OAuth 2.0 Client Secret. **Never exposed to the frontend**. Used server-side to generate access tokens and capture orders. |
| `PAYPAL_ENVIRONMENT` | `paypal_environment` | String | Optional | `"live"` | `serve.ps1` (Lines 319, 402, 475), `checkout.js` (Line 670) | Gateway environment mode: `"live"` (`api-m.paypal.com`) or `"sandbox"` (`api-m.sandbox.paypal.com`). |
| `PAYPAL_INSTRUCTIONS` | `paypal_instructions` | String | Optional | Custom guide text | `serve.ps1` (Line 957), `checkout.html` (Line 565) | Instructions displayed to customers inside the PayPal payment modal. |

---

### 2.4 IPTV Streaming Infrastructure & Line Server

| Environment Variable | JSON Key (`settings.json`) | Type | Status | Default Fallback | Code References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `M3U_SERVER_TEMPLATE` | `m3u_server_template` | String | **Required** | `"http://line.lunastream.vip:8080/get.php?username={username}&password={password}&type=m3u_plus&output=ts"` | `serve.ps1` (Lines 150–155), `portal.js` (Line 120), `admin.js` (Line 696) | Template string for compiling M3U Plus playlist download URLs. Contains dynamic placeholders `{username}` and `{password}`. |
| `XTREAM_SERVER_URL` | `xtream_server_url` | String | **Required** | `"http://line.lunastream.vip:8080"` | `serve.ps1` (Line 231), `portal.js` (Line 120), `admin.js` (Line 667) | Base domain/IP and port of the Xtream Codes compatible streaming line server. |

---

### 2.5 Customer Support & Communication Channels

| Environment Variable | JSON Key (`settings.json`) | Type | Status | Default Fallback | Code References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `SUPPORT_WHATSAPP` | `support_whatsapp` | String | **Required** | International phone format | `serve.ps1` (Line 960), `main.js`, `checkout.js`, `admin.js`, all HTML files | Direct WhatsApp contact number (without `+` or spaces, e.g. `447413469398`) for support and customer delivery links. |
| `SUPPORT_TELEGRAM` | `support_telegram` | String | Optional | Telegram username | `serve.ps1` (Line 960), `main.js`, `checkout.js`, all HTML files | Direct Telegram username or channel identifier (without `@`, e.g. `LunaStreamOfficial`). |
| `SUPPORT_EMAIL` | `support_email` | String | Optional | `"support@lunastream.vip"` | `contact.html` (Line 193) | Contact desk email address displayed on the public support page. |
| `BRAND_NAME` | `brand_name` | String | Optional | `"Luna Stream IPTV"` | `serve.ps1` (Line 167), `checkout.js`, all HTML pages | Brand identity title rendered across navigation bars, metadata, and invoice receipts. |

---

### 2.6 Wholesale Accounting & Reseller Margins

| Environment Variable | JSON Key (`settings.json`) | Type | Status | Default Fallback | Code References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `SUPPLIER_COST_PER_CREDIT` | `supplier_cost_per_credit` | Float | Optional | `21.40` | `serve.ps1` (Line 944), `admin.js` (Line 211) | Wholesale unit cost in local currency (GBP) incurred per IPTV line credit from your supplier. Used to calculate Net Margin. |
| `SUPPLIER_PANEL_URL` | `supplier_panel_url` | String | Optional | Reseller panel URL | `serve.ps1` (Line 945), `admin.js` (Line 825) | Quick-launcher link to the wholesale provider's portal (e.g. Xtream UI / ZapX panel) from inside `admin.html`. |
| `RENEWAL_DISCOUNT_PERCENT`| `renewal_discount_percent`| Integer | Optional | `15` | `serve.ps1` (Line 946), `portal.js` (Line 185), `admin.js` (Line 725) | Percentage discount applied when generating renewal payment links for existing subscribers. |

---

### 2.7 Marketing & Sales Announcement Banner

| Environment Variable | JSON Key (`settings.json`) | Type | Status | Default Fallback | Code References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ANNOUNCEMENT_ENABLED` | `announcement_enabled` | Boolean | Optional | `true` | `serve.ps1` (Line 947), `main.js` (Line 375), `admin.js` (Line 898) | Master visibility toggle for the site-wide marquee sale banner. |
| `ANNOUNCEMENT_BADGE` | `announcement_badge` | String | Optional | `"🔥 50% FLASH SALE"` | `serve.ps1` (Line 948), `main.js` (Line 380), `admin.js` (Line 901) | Glowing badge text displayed on the announcement ticker. |
| `ANNOUNCEMENT_TEXT` | `announcement_text` | String | Optional | Promotional copy | `serve.ps1` (Line 949), `main.js` (Line 381), `admin.js` (Line 902) | Headline promotional message displayed in the scrolling banner. |
| `ANNOUNCEMENT_DISCOUNT_PERCENT` | `announcement_discount_percent` | Integer | Optional | `50` | `serve.ps1` (Line 950), `main.js`, `admin.js` (Line 903) | Nominal discount percentage advertised in promotional copy. |
| `ANNOUNCEMENT_PROMO_CODE` | `announcement_promo_code` | String | Optional | `"LUNA20"` | `serve.ps1` (Line 951), `main.js`, `admin.js` (Line 904) | Coupon code promoted in the announcement banner. |
| `ANNOUNCEMENT_TARGET_PLAN` | `announcement_target_plan` | String | Optional | `"12m"` | `serve.ps1` (Line 952), `admin.js` (Line 905) | Subscription tier code targeted by the promotion (`3m`, `6m`, `12m`). |
| `ANNOUNCEMENT_LINK_TEXT` | `announcement_link_text` | String | Optional | `"Claim 50% OFF →"` | `serve.ps1` (Line 953), `main.js` (Line 382), `admin.js` (Line 906) | Call-to-action link text on the announcement banner. |
| `ANNOUNCEMENT_LINK_URL` | `announcement_link_url` | String | Optional | Pre-filled checkout URL | `serve.ps1` (Line 954), `main.js` (Line 383), `admin.js` (Line 907) | Destination URL when clicking the announcement CTA button. |

---

### 2.8 Future Integration Variables (Phase 5 & 6 Roadmap)

The following variables are planned for Phase 5 (Email Automation) and Stripe card processing. They are not yet active in `settings.json`:

| Environment Variable | Planned Store | Type | Status | Description |
| :--- | :--- | :--- | :--- | :--- |
| `SMTP_HOST` | `settings.json` / Env | String | Optional | Hostname of SMTP mail server (e.g. `smtp.sendgrid.net`, `smtp.gmail.com`). |
| `SMTP_PORT` | `settings.json` / Env | Integer | Optional | SMTP server port (`587` for TLS, `465` for SSL). |
| `SMTP_USER` | `settings.json` / Env | String | Optional | SMTP username or API key. |
| `SMTP_PASS` | `settings.json` / Env | String *(Secret)* | Optional | SMTP password or secret API key. |
| `SMTP_FROM_EMAIL` | `settings.json` / Env | String | Optional | Sender address for automated customer emails (e.g. `orders@lunastream.vip`). |
| `STRIPE_PUBLISHABLE_KEY`| `settings.json` / Env | String | Optional | Stripe publishable key (`pk_live_...`) for client-side card tokenization. |
| `STRIPE_SECRET_KEY` | `settings.json` / Env | String *(Secret)* | Optional | Stripe secret key (`sk_live_...`) for server-side payment charges. |

---

## 3. Configuration Templates (No Secrets)

### 3.1 Sample `.env.example`
Create a `.env` file in the project root if using a modern runner or process manager:

```ini
# ==============================================================================
# LUNA STREAM IPTV — ENVIRONMENT CONFIGURATION TEMPLATE
# DO NOT COMMIT REAL SECRET VALUES TO PUBLIC REPOSITORIES
# ==============================================================================

# Server Network Configuration
PORT=8081
LUNA_ROOT=.

# Admin Security Credentials
ADMIN_PASSWORD=CHANGE_ME_TO_A_STRONG_PASSWORD
SESSION_TIMEOUT_HOURS=8
MAX_LOGIN_ATTEMPTS=5
LOGIN_COOLDOWN_MINUTES=15

# Customer Support Contacts (No '+' or spaces in phone numbers)
SUPPORT_WHATSAPP=44XXXXXXXXXX
SUPPORT_TELEGRAM=YourTelegramHandle
SUPPORT_EMAIL=support@yourdomain.com
BRAND_NAME=Luna Stream IPTV

# PayPal Integration
PAYPAL_MODE=paypal_me
PAYPAL_ME_LINK=https://paypal.me/YourPayPalUsername
PAYPAL_EMAIL=your_paypal_business@email.com
PAYPAL_ENVIRONMENT=live
PAYPAL_CLIENT_ID=YOUR_PAYPAL_REST_CLIENT_ID_HERE
PAYPAL_CLIENT_SECRET=YOUR_PAYPAL_REST_CLIENT_SECRET_HERE

# IPTV Line Infrastructure
XTREAM_SERVER_URL=http://line.yourdomain.com:8080
M3U_SERVER_TEMPLATE=http://line.yourdomain.com:8080/get.php?username={username}&password={password}&type=m3u_plus&output=ts

# Wholesale Accounting
SUPPLIER_COST_PER_CREDIT=21.40
SUPPLIER_PANEL_URL=https://panel.example.com
RENEWAL_DISCOUNT_PERCENT=15

# Marketing Banner
ANNOUNCEMENT_ENABLED=true
ANNOUNCEMENT_BADGE=🔥 FLASH SALE
ANNOUNCEMENT_TEXT=USE CODE 'LUNA20' FOR 20% OFF ALL PASSES
ANNOUNCEMENT_DISCOUNT_PERCENT=20
ANNOUNCEMENT_PROMO_CODE=LUNA20
ANNOUNCEMENT_TARGET_PLAN=12m
ANNOUNCEMENT_LINK_TEXT=Claim Deal →
ANNOUNCEMENT_LINK_URL=checkout.html?plan=12m&promo=LUNA20&discount=20
```

---

### 3.2 PowerShell Environment Initialization Script (`setup-env.ps1`)
To launch the server with specific environment overrides in PowerShell:

```powershell
<#
.SYNOPSIS
    Luna Stream IPTV Environment Initializer
.DESCRIPTION
    Sets process-level environment variables and launches serve.ps1 on port 8081.
#>

$env:PORT = "8081"
$env:BRAND_NAME = "Luna Stream IPTV"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Starting Luna Stream Server on Port $env:PORT... " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Launch server with execution policy bypass
& powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port [int]$env:PORT
```

---

## 4. Operational Checklist Before Deployment

Before going live on a production domain, verify:
- [ ] `admin_password` in `data/settings.json` is updated from the default `admin`.
- [ ] `paypal_me_link` matches your active PayPal recipient username.
- [ ] `support_whatsapp` contains your active WhatsApp business line in international format without `+` or spaces.
- [ ] `support_telegram` matches your official support handle.
- [ ] `xtream_server_url` and `m3u_server_template` point to your live IPTV streaming host.
- [ ] Port `8081` is open on your firewall or routed behind a reverse proxy (e.g. Nginx, IIS, or Cloudflare Tunnel).
