param(
    [int]$Port = 8080,
    [string]$Folder = $PSScriptRoot
)

if ($env:PORT -and ($Port -eq 8080 -or -not $Port)) {
    $Port = [int]$env:PORT
}

if (-not $Folder) { $Folder = (Get-Location).Path }
$DataFolder = Join-Path $Folder "data"
if (-not (Test-Path $DataFolder)) { New-Item -ItemType Directory -Path $DataFolder -Force | Out-Null }

$MimeTypes = @{
    ".html"        = "text/html; charset=utf-8"
    ".css"         = "text/css; charset=utf-8"
    ".js"          = "application/javascript; charset=utf-8"
    ".json"        = "application/json; charset=utf-8"
    ".png"         = "image/png"
    ".jpg"         = "image/jpeg"
    ".jpeg"        = "image/jpeg"
    ".svg"         = "image/svg+xml"
    ".ico"         = "image/x-icon"
    ".webp"        = "image/webp"
    ".m3u"         = "audio/x-mpegurl"
    ".m3u8"        = "application/vnd.apple.mpegurl"
    ".xml"         = "application/xml; charset=utf-8"
    ".txt"         = "text/plain; charset=utf-8"
    ".webmanifest" = "application/manifest+json; charset=utf-8"
}

# --- Security & Auth Functions ---
$script:Sessions = @{}
$script:CustomerSessions = @{}
$script:LoginAttempts = @{}
$script:DataMutexes = @{}
$script:ActiveVisitors = @{}

function Get-DataMutex([string]$filename) {
    if (-not $script:DataMutexes[$filename]) {
        $script:DataMutexes[$filename] = New-Object System.Threading.Mutex($false, "LunaStream_$filename")
    }
    return $script:DataMutexes[$filename]
}

function Read-JsonFileSafe([string]$filename, $defaultVal) {
    $mutex = Get-DataMutex $filename
    try {
        $mutex.WaitOne(5000) | Out-Null
        $p = Join-Path $DataFolder $filename
        if (Test-Path $p) {
            try {
                $raw = Get-Content $p -Raw -Encoding utf8
                if ($raw -and $raw.Trim()) {
                    return ($raw | ConvertFrom-Json)
                }
            } catch {}
        }
        return $defaultVal
    } finally {
        $mutex.ReleaseMutex()
    }
}

function Write-JsonFileSafe([string]$filename, $data) {
    $mutex = Get-DataMutex $filename
    try {
        $mutex.WaitOne(5000) | Out-Null
        $p = Join-Path $DataFolder $filename
        $json = ""
        if ($null -eq $data) {
            $json = "null"
        } elseif ($data -is [System.Collections.IEnumerable] -and -not ($data -is [string]) -and -not ($data -is [System.Collections.IDictionary])) {
            $arr = [System.Collections.ArrayList]@($data)
            if ($arr.Count -eq 0) {
                $json = "[]"
            } elseif ($arr.Count -eq 1) {
                $json = "[`n" + ($arr[0] | ConvertTo-Json -Depth 10) + "`n]"
            } else {
                $json = $arr | ConvertTo-Json -Depth 10
            }
        } else {
            $json = $data | ConvertTo-Json -Depth 10
        }
        [System.IO.File]::WriteAllText($p, $json, [System.Text.Encoding]::UTF8)
    } finally {
        $mutex.ReleaseMutex()
    }
}

function New-SecurePassword([int]$length = 12) {
    $bytes = New-Object byte[] $length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $chars = 'abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    $result = ''
    foreach ($b in $bytes) { $result += $chars[$b % $chars.Length] }
    return $result
}

function New-SecureId([string]$prefix, [int]$numLength = 5) {
    $bytes = New-Object byte[] $numLength
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $num = ''
    foreach ($b in $bytes) { $num += ($b % 10).ToString() }
    return "$prefix$num"
}

function Get-PasswordHash([string]$password) {
    $salt = New-Object byte[] 16
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($salt)
    $derive = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($password, $salt, 10000)
    $hash = $derive.GetBytes(32)
    $saltB64 = [Convert]::ToBase64String($salt)
    $hashB64 = [Convert]::ToBase64String($hash)
    return "${saltB64}:${hashB64}"
}

function Test-PasswordHash([string]$password, [string]$storedHash) {
    if (-not $storedHash -or -not $storedHash.Contains(':')) { 
        return ($password -eq $storedHash)  # Legacy plaintext fallback
    }
    $parts = $storedHash.Split(':')
    $salt = [Convert]::FromBase64String($parts[0])
    $expectedHash = [Convert]::FromBase64String($parts[1])
    $derive = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($password, $salt, 10000)
    $actualHash = $derive.GetBytes(32)
    $match = $true
    for ($i = 0; $i -lt $actualHash.Length; $i++) {
        if ($actualHash[$i] -ne $expectedHash[$i]) { $match = $false }
    }
    return $match
}

function New-SessionToken() {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
}

function Test-AdminAuth($request) {
    $authHeader = $request.Headers["Authorization"]
    if (-not $authHeader -or -not $authHeader.StartsWith("Bearer ")) { return $false }
    $token = $authHeader.Substring(7).Trim()
    if ($script:Sessions.ContainsKey($token)) {
        $session = $script:Sessions[$token]
        $elapsed = (Get-Date) - $session.created_at
        if ($elapsed.TotalHours -lt 8) { return $true }
        $script:Sessions.Remove($token)
    }
    return $false
}

function Test-CustomerAuth($request) {
    $authHeader = $request.Headers["Authorization"]
    if (-not $authHeader -or -not $authHeader.StartsWith("Bearer ")) { return $false }
    $token = $authHeader.Substring(7).Trim()
    if ($script:CustomerSessions.ContainsKey($token)) {
        $session = $script:CustomerSessions[$token]
        $elapsed = (Get-Date) - $session.created_at
        if ($elapsed.TotalHours -lt 24) { return $true }
        $script:CustomerSessions.Remove($token)
    }
    return $false
}

function Test-RateLimit([string]$ip, [int]$maxAttempts = 5, [int]$cooldownMinutes = 15) {
    if (-not $script:LoginAttempts[$ip]) {
        $script:LoginAttempts[$ip] = @{ count = 0; first_attempt = Get-Date }
    }
    $entry = $script:LoginAttempts[$ip]
    $elapsed = (Get-Date) - $entry.first_attempt
    if ($elapsed.TotalMinutes -gt $cooldownMinutes) {
        $script:LoginAttempts[$ip] = @{ count = 0; first_attempt = Get-Date }
        return $true
    }
    if ($entry.count -ge $maxAttempts) { return $false }
    return $true
}

function Add-AuditLog([string]$action, [string]$actor, [string]$details) {
    $log = [System.Collections.ArrayList]@(Read-JsonFileSafe "audit_log.json" @())
    $entry = @{
        id = New-SecureId 'AUD-'
        action = $action
        actor = $actor
        details = $details
        timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $log.Insert(0, $entry)
    if ($log.Count -gt 1000) { $log.RemoveRange(1000, ($log.Count - 1000)) }
    Write-JsonFileSafe "audit_log.json" $log
}

function Initialize-DefaultData() {
    $s = Read-JsonFileSafe "settings.json" $null
    if (-not $s) {
        $s = @{
            admin_password = Get-PasswordHash "admin"
            auth_token = "ps_sec_token_99281a8b"
            brand_name = "Luna Stream IPTV"
            m3u_server_template = "http://line.lunaentertainment.online:8080/get.php?username={username}&password={password}&type=m3u_plus&output=ts"
            xtream_server_url = "http://line.lunaentertainment.online:8080"
            support_whatsapp = "447413469398"
            support_telegram = "LunaStreamOfficial"
            paypal_email = "wasifali740@gmail.com"
            paypal_me_link = "https://paypal.me/adilfarooq909"
            paypal_mode = "paypal_me"
            paypal_instructions = "Send exact amount to paypal.me/adilfarooq909. 256-Bit SSL Instant Verification."
            announcement_enabled = $false
        }
        Write-JsonFileSafe "settings.json" $s
    }
}
Initialize-DefaultData

# --- Server-Side Pricing Catalog (Authoritative & Dynamic) ---
$script:PRICING_CATALOG = @{
    '3m' = @{
        '1' = @{ GBP = 25.00; EUR = 30.00; USD = 35.00 }
        '2' = @{ GBP = 35.00; EUR = 40.00; USD = 49.00 }
        '3' = @{ GBP = 49.00; EUR = 59.00; USD = 69.00 }
        '5' = @{ GBP = 79.00; EUR = 95.00; USD = 109.00 }
    }
    '6m' = @{
        '1' = @{ GBP = 40.00; EUR = 47.00; USD = 55.00 }
        '2' = @{ GBP = 59.00; EUR = 69.00; USD = 79.00 }
        '3' = @{ GBP = 79.00; EUR = 95.00; USD = 109.00 }
        '5' = @{ GBP = 129.00; EUR = 149.00; USD = 179.00 }
    }
    '12m' = @{
        '1' = @{ GBP = 65.00; EUR = 76.00; USD = 89.00 }
        '2' = @{ GBP = 99.00; EUR = 115.00; USD = 135.00 }
        '3' = @{ GBP = 129.00; EUR = 149.00; USD = 179.00 }
        '5' = @{ GBP = 199.00; EUR = 229.00; USD = 269.00 }
    }
}

function Update-MemoryPricingCatalog($catalog) {
    if (-not $catalog -or -not $catalog.plans) { return }
    $plans = $catalog.plans
    foreach ($pProp in $plans.PSObject.Properties) {
        $planKey = $pProp.Name
        $pVal = $pProp.Value
        if (-not $script:PRICING_CATALOG.ContainsKey($planKey)) {
            $script:PRICING_CATALOG[$planKey] = @{}
        }
        if ($pVal.pricing) {
            foreach ($devProp in $pVal.pricing.PSObject.Properties) {
                $dKey = $devProp.Name
                if (-not $script:PRICING_CATALOG[$planKey].ContainsKey($dKey)) {
                    $script:PRICING_CATALOG[$planKey][$dKey] = @{}
                }
                foreach ($cProp in $devProp.Value.PSObject.Properties) {
                    $cKey = $cProp.Name
                    $script:PRICING_CATALOG[$planKey][$dKey][$cKey] = [double]$cProp.Value
                }
            }
        }
    }
}

function Get-PricingCatalog {
    $catalog = Read-JsonFileSafe "pricing.json" $null
    if ($catalog) {
        Update-MemoryPricingCatalog $catalog
        return $catalog
    }
    return $null
}

function Get-ValidatedPrice([string]$planId, [int]$devices, [string]$currency) {
    $devKey = [string]$devices
    $catalog = Get-PricingCatalog
    if ($catalog -and $catalog.plans) {
        $plan = $catalog.plans.PSObject.Properties[$planId]
        if ($plan -and $plan.Value) {
            $pObj = $plan.Value
            if ($pObj.pricing) {
                $devProp = $pObj.pricing.PSObject.Properties[$devKey]
                if ($devProp -and $devProp.Value) {
                    $currProp = $devProp.Value.PSObject.Properties[$currency]
                    if ($currProp -and $currProp.Value -ne $null) {
                        return [double]$currProp.Value
                    }
                }
            }
        }
    }
    if (-not $script:PRICING_CATALOG[$planId]) { return $null }
    if (-not $script:PRICING_CATALOG[$planId][$devKey]) { return $null }
    if (-not $script:PRICING_CATALOG[$planId][$devKey][$currency]) { return $null }
    return [double]$script:PRICING_CATALOG[$planId][$devKey][$currency]
}

function Get-PlanDurationMonths([string]$planId) {
    $catalog = Get-PricingCatalog
    if ($catalog -and $catalog.plans) {
        $planProp = $catalog.plans.PSObject.Properties[$planId]
        if ($planProp -and $planProp.Value) {
            $p = $planProp.Value
            $base = if ($p.duration_months) { [int]$p.duration_months } else { 12 }
            $extra = if ($p.extra_months) { [int]$p.extra_months } else { 0 }
            return ($base + $extra)
        }
    }
    switch ($planId) {
        '3m' { return 3 }
        '6m' { return 6 }
        default { return 12 }
    }
}

function Get-M3UUrl([string]$username, [string]$password) {
    $settings = Read-JsonFileSafe 'settings.json' @{}
    $template = $settings.m3u_server_template
    if (-not $template) { $template = 'http://line.lunastream.vip:8080/get.php?username={username}&password={password}&type=m3u_plus&output=ts' }
    return $template.Replace('{username}', $username).Replace('{password}', $password)
}

function Invoke-DataMigration {
    $versionFile = Join-Path $DataFolder "migration_version.txt"
    if ((Test-Path $versionFile) -and ((Get-Content $versionFile -Raw).Trim() -eq "v2")) {
        return
    }

    Write-Host "Starting Data Migration to v2..."

    # Backup data files
    $jsonFiles = Get-ChildItem -Path $DataFolder -Filter "*.json"
    foreach ($file in $jsonFiles) {
        Copy-Item -Path $file.FullName -Destination "$($file.FullName).bak" -Force
    }

    $orders = @(Read-JsonFileSafe "orders.json" @())
    $customers = [System.Collections.ArrayList]@(Read-JsonFileSafe "customers.json" @())
    $subscriptions = [System.Collections.ArrayList]@(Read-JsonFileSafe "subscriptions.json" @())
    $payments = [System.Collections.ArrayList]@(Read-JsonFileSafe "payments.json" @())
    $coupons = [System.Collections.ArrayList]@(Read-JsonFileSafe "coupons.json" @())

    $migratedCustomers = 0
    $migratedSubscriptions = 0
    $migratedPayments = 0

    $customerMap = @{} # email -> customer object

    # Step 1: Customers
    foreach ($order in $orders) {
        $email = $order.customer_email
        if (-not $email) { continue }
        if (-not $customerMap.ContainsKey($email)) {
            $customer = @{
                id = 'CUS-' + (New-SecureId '' 8)
                email = $email
                name = if ($order.customer_name) { $order.customer_name } else { "Customer" }
                phone = if ($order.customer_phone) { $order.customer_phone } else { "" }
                password_hash = ''
                created_at = if ($order.created_at) { $order.created_at } else { (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") }
                tags = @()
                lifetime_value = 0.0
                notes = ''
                status = 'active'
            }
            $customerMap[$email] = $customer
            $customers.Add($customer) | Out-Null
            $migratedCustomers++
        }
        
        if ($order.status -eq "Active" -and $order.payment_status -eq "PAID") {
            $amt = 0.0
            [double]::TryParse([string]($order.total_amount), [ref]$amt) | Out-Null
            $customerMap[$email].lifetime_value += $amt
        }
    }

    # Step 2: Subscriptions and Payments
    foreach ($order in $orders) {
        $email = $order.customer_email
        $customerId = if ($email -and $customerMap.ContainsKey($email)) { $customerMap[$email].id } else { "" }
        if (-not $customerId) { continue }

        if ($order.status -eq "Active" -and $order.payment_status -eq "PAID") {
            $start = if ($order.paid_at) { $order.paid_at } else { $order.created_at }
            $dur = if ($order.duration_months) { [int]$order.duration_months } else { 12 }
            $dtStart = [DateTime]::Parse($start)
            $end = $dtStart.AddMonths($dur).ToString("yyyy-MM-ddTHH:mm:ssZ")
            
            $sub = @{
                id = 'SUB-' + (Get-Date).ToString('yyyy') + '-' + (New-SecureId '' 5)
                customer_id = $customerId
                order_id = $order.id
                plan_id = $order.plan_id
                plan_title = $order.plan_title
                devices_count = $order.devices_count
                status = 'ACTIVE'
                start_date = $start
                end_date = $end
                xtream_username = $order.xtream_username
                xtream_password = $order.xtream_password
                m3u_url = $order.m3u_url
                created_at = if ($order.paid_at) { $order.paid_at } else { $order.created_at }
                updated_at = if ($order.updated_at) { $order.updated_at } else { $order.created_at }
            }
            $subscriptions.Add($sub) | Out-Null
            $migratedSubscriptions++
        }

        if ($order.payment_status -eq "PAID") {
            $amt = 0.0
            [double]::TryParse([string]($order.total_amount), [ref]$amt) | Out-Null
            
            $pay = @{
                id = 'PAY-' + (Get-Date).ToString('yyyyMMdd') + '-' + (New-SecureId '' 5)
                order_id = $order.id
                customer_id = $customerId
                provider = 'paypal_me'
                provider_transaction_id = if ($order.paypal_capture_id) { $order.paypal_capture_id } else { "" }
                amount = $amt
                currency = if ($order.currency) { $order.currency } else { "USD" }
                status = 'CONFIRMED'
                created_at = if ($order.paid_at) { $order.paid_at } else { $order.created_at }
                confirmed_at = if ($order.paid_at) { $order.paid_at } else { $order.created_at }
                failure_reason = ''
                refund_status = 'NONE'
            }
            $payments.Add($pay) | Out-Null
            $migratedPayments++
        }
    }

    Write-JsonFileSafe "customers.json" $customers
    Write-JsonFileSafe "subscriptions.json" $subscriptions
    Write-JsonFileSafe "payments.json" $payments

    $defaultCoupon = @{
        id = "COUP-001"
        code = "LUNA20"
        discount_type = "percentage"
        discount_value = 20
        valid_from = "2026-01-01"
        valid_until = "2027-12-31"
        usage_limit = 1000
        times_used = 0
        allowed_plans = @("3m", "6m", "12m")
        min_order_amount = 0
        active = $true
    }
    
    $couponExists = $false
    foreach ($c in $coupons) {
        if ($c.code -eq "LUNA20") { $couponExists = $true; break }
    }
    if (-not $couponExists) {
        $coupons.Add($defaultCoupon) | Out-Null
        Write-JsonFileSafe "coupons.json" $coupons
    }

    Set-Content -Path $versionFile -Value "v2" -Encoding UTF8
    Write-Host "Migration Summary: $migratedCustomers customers, $migratedSubscriptions subscriptions, $migratedPayments payments migrated."
}

function Send-JsonResponse($response, [int]$statusCode, $data) {
    try {
        $response.StatusCode = $statusCode
        $response.ContentType = "application/json; charset=utf-8"
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
        
        $json = ""
        if ($null -eq $data) {
            $json = "null"
        } elseif ($data -is [System.Collections.IEnumerable] -and -not ($data -is [string]) -and -not ($data -is [System.Collections.IDictionary])) {
            $arr = [System.Collections.ArrayList]@($data)
            if ($arr.Count -eq 0) {
                $json = "[]"
            } elseif ($arr.Count -eq 1) {
                $json = "[" + ($arr[0] | ConvertTo-Json -Depth 10 -Compress) + "]"
            } else {
                $json = $arr | ConvertTo-Json -Depth 10 -Compress
            }
        } else {
            $json = $data | ConvertTo-Json -Depth 10 -Compress
            if (-not $json) { $json = "{}" }
        }
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.OutputStream.Close()
        $response.Close()
    } catch {}
}

# --- Email Notification System ---
function Set-ObjectProperty($obj, [string]$propName, $val) {
    if ($null -eq $obj) { return }
    if ($obj.PSObject.Properties[$propName]) {
        $obj.$propName = $val
    } else {
        $obj | Add-Member -NotePropertyName $propName -NotePropertyValue $val -Force
    }
}

function Send-EmailNotification([string]$templateKey, [string]$toEmail, [hashtable]$variables) {
    try {
        $templates = Read-JsonFileSafe "email_templates.json" @{}
        if (-not $templates.$templateKey) {
            return @{ success = $false; message = "Template $templateKey not found" }
        }

        $tmpl = $templates.$templateKey
        $subject = [string]$tmpl.subject
        $body = [string]$tmpl.body_text

        foreach ($k in $variables.Keys) {
            $val = [string]$variables[$k]
            $subject = $subject.Replace("{{$k}}", $val)
            $body = $body.Replace("{{$k}}", $val)
        }

        $settings = Read-JsonFileSafe "settings.json" @{}
        $emlId = New-SecureId "EML-" 6
        $sentStatus = "LOGGED_ONLY"

        if ($settings.smtp_enabled -eq $true -and $settings.smtp_server) {
            try {
                $portNum = if ($settings.smtp_port) { [int]$settings.smtp_port } else { 587 }
                $smtpClient = New-Object System.Net.Mail.SmtpClient([string]$settings.smtp_server, $portNum)
                if ($settings.smtp_user -and $settings.smtp_pass) {
                    $smtpClient.Credentials = New-Object System.Net.NetworkCredential([string]$settings.smtp_user, [string]$settings.smtp_pass)
                }
                $smtpClient.EnableSsl = if ($null -ne $settings.smtp_ssl) { [bool]$settings.smtp_ssl } else { $true }
                $fromAddr = if ($settings.smtp_from) { [string]$settings.smtp_from } else { "support@lunastream.vip" }
                $mailMsg = New-Object System.Net.Mail.MailMessage($fromAddr, $toEmail, $subject, $body)
                $smtpClient.Send($mailMsg)
                $sentStatus = "SENT"
            } catch {
                $sentStatus = "FAILED: $($_.Exception.Message)"
            }
        }

        # Log dispatch to email_log.json
        $log = [System.Collections.ArrayList]@(Read-JsonFileSafe "email_log.json" @())
        $entry = @{
            id = $emlId
            template = $templateKey
            recipient = $toEmail
            subject = $subject
            body = $body
            status = $sentStatus
            timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        }
        $log.Insert(0, $entry)
        if ($log.Count -gt 500) { $log.RemoveRange(500, ($log.Count - 500)) }
        Write-JsonFileSafe "email_log.json" $log

        return @{ success = $true; id = $emlId; status = $sentStatus; subject = $subject }
    } catch {
        return @{ success = $false; message = $_.Exception.Message }
    }
}

# --- Subscription Expiry Monitoring ---
$script:LastExpiryCheck = $null

function Invoke-ExpiryCheck([switch]$force) {
    $now = Get-Date
    if (-not $force -and $null -ne $script:LastExpiryCheck) {
        $elapsed = ($now - $script:LastExpiryCheck).TotalMinutes
        if ($elapsed -lt 30) { return @{ skipped = $true; elapsed_mins = $elapsed } }
    }
    $script:LastExpiryCheck = $now

    $subs = [System.Collections.ArrayList]@(Read-JsonFileSafe "subscriptions.json" @())
    $modified = $false
    $expiredCount = 0
    $expiringSoonCount = 0
    $today = $now.Date

    for ($i = 0; $i -lt $subs.Count; $i++) {
        $s = $subs[$i]
        if (-not $s.end_date) { continue }
        $endDate = $null
        try { $endDate = ([DateTime]::Parse($s.end_date)).Date } catch { continue }

        if ($s.status -eq 'ACTIVE' -or $s.status -eq 'EXPIRING_SOON') {
            $daysLeft = ($endDate - $today).Days
            if ($endDate -lt $today) {
                $s.status = 'EXPIRED'
                $s.updated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                $modified = $true
                $expiredCount++
                Add-AuditLog "SUBSCRIPTION_EXPIRED" "SYSTEM" "Subscription $($s.id) marked EXPIRED (ended on $($s.end_date))"
            } elseif ($endDate -le $today.AddDays(7) -and $s.status -eq 'ACTIVE') {
                $s.status = 'EXPIRING_SOON'
                $s.updated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                $modified = $true
                $expiringSoonCount++
                Add-AuditLog "SUBSCRIPTION_EXPIRING_SOON" "SYSTEM" "Subscription $($s.id) expiring soon (ends on $($s.end_date))"
            }

            # Automated Expiry Reminders
            $customers = @(Read-JsonFileSafe "customers.json" @())
            $cust = $customers | Where-Object { $_.id -eq $s.customer_id } | Select-Object -First 1
            if ($cust -and $cust.email) {
                if ($daysLeft -le 7 -and $daysLeft -gt 3 -and -not $s.reminder_7d_sent) {
                    Send-EmailNotification "EXPIRY_REMINDER_7D" $cust.email @{
                        customer_name = $cust.name
                        subscription_id = $s.id
                        end_date = $s.end_date
                    } | Out-Null
                    $s.reminder_7d_sent = $true
                    $modified = $true
                } elseif ($daysLeft -le 3 -and $daysLeft -gt 1 -and -not $s.reminder_3d_sent) {
                    Send-EmailNotification "EXPIRY_REMINDER_3D" $cust.email @{
                        customer_name = $cust.name
                        subscription_id = $s.id
                        end_date = $s.end_date
                    } | Out-Null
                    $s.reminder_3d_sent = $true
                    $modified = $true
                } elseif ($daysLeft -le 1 -and $daysLeft -ge 0 -and -not $s.reminder_1d_sent) {
                    Send-EmailNotification "EXPIRY_REMINDER_1D" $cust.email @{
                        customer_name = $cust.name
                        end_date = $s.end_date
                    } | Out-Null
                    $s.reminder_1d_sent = $true
                    $modified = $true
                }
            }
        }
    }

    if ($modified) {
        Write-JsonFileSafe "subscriptions.json" $subs
    }

    return @{ checked = $subs.Count; expired = $expiredCount; expiring_soon = $expiringSoonCount }
}

# --- IPTV Reseller Panel Engine (Xtream UI / 1-Stream / Zapx / andy-pro.uk) ---
function Invoke-IptvPanelApi([string]$action, [hashtable]$params) {
    try {
        $settings = Read-JsonFileSafe "settings.json" @{}
        $bypass = ($params -and $params.ContainsKey("__bypass_enabled_check") -and $params["__bypass_enabled_check"])
        if (-not $settings.iptv_panel_enabled -and -not $bypass) {
            return @{ success = $false; error = "IPTV Panel integration is disabled in Settings" }
        }

        $panelUrl = if ($settings.iptv_panel_url) { [string]$settings.iptv_panel_url.Trim().TrimEnd('/') } else { "" }
        if ($params -and $params.ContainsKey("__panel_url") -and [string]$params["__panel_url"].Trim()) {
            $panelUrl = [string]$params["__panel_url"].Trim().TrimEnd('/')
        }
        if (-not $panelUrl) {
            return @{ success = $false; error = "IPTV Panel URL is not configured (e.g. http://andy-pro.uk)" }
        }
        if (-not $panelUrl.StartsWith("http://") -and -not $panelUrl.StartsWith("https://")) {
            $panelUrl = "http://" + $panelUrl
        }

        $username = if ($settings.iptv_panel_username) { [string]$settings.iptv_panel_username.Trim() } else { "" }
        if ($params -and $params.ContainsKey("__panel_username") -and [string]$params["__panel_username"].Trim()) {
            $username = [string]$params["__panel_username"].Trim()
        }

        $password = if ($settings.iptv_panel_password) { [string]$settings.iptv_panel_password.Trim() } else { "" }
        if ($params -and $params.ContainsKey("__panel_password") -and [string]$params["__panel_password"].Trim()) {
            $password = [string]$params["__panel_password"].Trim()
        }

        if (-not $username -or -not $password) {
            return @{ success = $false; error = "IPTV Panel reseller username and password must be configured" }
        }

        $apiEndpoint = "$panelUrl/api.php"
        
        $queryItems = [System.Collections.ArrayList]@()
        $queryItems.Add("action=$([System.Uri]::EscapeDataString($action))") | Out-Null
        $queryItems.Add("username=$([System.Uri]::EscapeDataString($username))") | Out-Null
        $queryItems.Add("password=$([System.Uri]::EscapeDataString($password))") | Out-Null

        if ($params) {
            foreach ($k in $params.Keys) {
                if ($k.StartsWith("__")) { continue }
                $val = [string]$params[$k]
                $queryItems.Add("$([System.Uri]::EscapeDataString($k))=$([System.Uri]::EscapeDataString($val))") | Out-Null
            }
        }

        $queryString = $queryItems -join "&"
        $fullUri = "$apiEndpoint?$queryString"

        try {
            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
            $jsonObj = Invoke-RestMethod -Uri $fullUri -Method Get -TimeoutSec 15 -UserAgent "LunaStream-IPTV-Provisioner/1.0" -ErrorAction Stop
            return @{
                success = $true
                data = $jsonObj
            }
        } catch {
            return @{ success = $false; error = "Panel request failed: $($_.Exception.Message)" }
        }
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function New-IptvPanelLine([string]$planId, [int]$devices = 1, [string]$customerEmail = "", [string]$customUsername = "", [string]$customPassword = "") {
    try {
        $settings = Read-JsonFileSafe "settings.json" @{}
        
        # Package ID mapping from settings
        $pkgId = ""
        if ($planId -eq "3m") { $pkgId = [string]$settings.iptv_panel_package_3m }
        elseif ($planId -eq "6m") { $pkgId = [string]$settings.iptv_panel_package_6m }
        elseif ($planId -eq "12m") { $pkgId = [string]$settings.iptv_panel_package_12m }
        elseif ($planId -eq "trial") { $pkgId = [string]$settings.iptv_panel_package_trial }

        $uName = if ($customUsername) { $customUsername } else { "luna_" + (New-SecurePassword 8).ToLower() }
        $uPass = if ($customPassword) { $customPassword } else { New-SecurePassword 12 }

        # Internal Fallback if panel not active or package not mapped
        if (-not $settings.iptv_panel_enabled -or -not $pkgId) {
            $m3u = Get-M3UUrl $uName $uPass
            return @{
                success = $true
                mode = "INTERNAL_FALLBACK"
                xtream_username = $uName
                xtream_password = $uPass
                m3u_url = $m3u
                panel_user_id = ""
                message = "Generated internally (IPTV Panel disabled or package unmapped)"
            }
        }

        $apiParams = @{
            package = $pkgId
            username = $uName
            password = $uPass
            max_connections = $devices
            notes = if ($customerEmail) { "LunaStream:$customerEmail" } else { "LunaStream" }
        }

        $apiRes = Invoke-IptvPanelApi "user_create" $apiParams
        if (-not $apiRes.success) {
            $m3u = Get-M3UUrl $uName $uPass
            Add-AuditLog "PANEL_PROVISION_FAILED" "System" "Panel user_create failed: $($apiRes.error). Falling back to internal credentials."
            return @{
                success = $true
                mode = "FALLBACK_ON_ERROR"
                xtream_username = $uName
                xtream_password = $uPass
                m3u_url = $m3u
                panel_user_id = ""
                warning = "Panel error: $($apiRes.error)"
            }
        }

        $data = $apiRes.data
        $panelUserId = ""
        if ($data.result -eq $false -or $data.status -eq "error") {
            $err = if ($data.message) { $data.message } else { "Panel rejected user creation" }
            $m3u = Get-M3UUrl $uName $uPass
            Add-AuditLog "PANEL_PROVISION_FAILED" "System" "Panel error: $err. Falling back to internal line."
            return @{
                success = $true
                mode = "FALLBACK_ON_ERROR"
                xtream_username = $uName
                xtream_password = $uPass
                m3u_url = $m3u
                panel_user_id = ""
                warning = $err
            }
        }

        if ($data.user_id) { $panelUserId = [string]$data.user_id }
        elseif ($data.id) { $panelUserId = [string]$data.id }

        if ($data.username) { $uName = [string]$data.username }
        if ($data.password) { $uPass = [string]$data.password }

        $m3u = Get-M3UUrl $uName $uPass
        Add-AuditLog "PANEL_LINE_CREATED" "System" "Line $uName (ID: $panelUserId) created on panel for $customerEmail"

        return @{
            success = $true
            mode = "PANEL_PROVISIONED"
            xtream_username = $uName
            xtream_password = $uPass
            m3u_url = $m3u
            panel_user_id = $panelUserId
            exp_date = if ($data.exp_date) { [string]$data.exp_date } else { "" }
        }
    } catch {
        $uName = if ($customUsername) { $customUsername } else { "luna_" + (New-SecurePassword 8).ToLower() }
        $uPass = if ($customPassword) { $customPassword } else { New-SecurePassword 12 }
        $m3u = Get-M3UUrl $uName $uPass
        return @{
            success = $true
            mode = "EXCEPTION_FALLBACK"
            xtream_username = $uName
            xtream_password = $uPass
            m3u_url = $m3u
            panel_user_id = ""
            warning = $_.Exception.Message
        }
    }
}

# --- Automated Database Backup & Snapshot Engine ---
$script:BackupFolder = Join-Path $Folder "backups"
if (-not (Test-Path $script:BackupFolder)) {
    New-Item -ItemType Directory -Path $script:BackupFolder -Force | Out-Null
}
$script:LastDailyBackup = $null

function New-DatabaseBackup([switch]$manual) {
    try {
        if (-not (Test-Path $script:BackupFolder)) {
            New-Item -ItemType Directory -Path $script:BackupFolder -Force | Out-Null
        }

        $now = Get-Date
        $timestamp = $now.ToString("yyyyMMdd_HHmmss")
        $zipName = "luna_backup_$timestamp.zip"
        $zipPath = Join-Path $script:BackupFolder $zipName

        $dataFiles = Get-ChildItem -Path $DataFolder -Filter "*.json" -File
        if (-not $dataFiles -or $dataFiles.Count -eq 0) {
            return @{ success = $false; message = "No data files found to backup" }
        }

        $stagingDir = Join-Path $script:BackupFolder "staging_$timestamp"
        if (-not (Test-Path $stagingDir)) { New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null }

        try {
            foreach ($df in $dataFiles) {
                $targetCopy = Join-Path $stagingDir $df.Name
                Copy-Item -Path $df.FullName -Destination $targetCopy -Force
            }
            $meta = @{
                backup_id = $zipName
                created_at = $now.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                type = if ($manual) { "MANUAL_ADMIN" } else { "AUTOMATED_DAILY" }
                files = @($dataFiles | ForEach-Object { $_.Name })
            }
            $metaJson = $meta | ConvertTo-Json -Depth 5
            [System.IO.File]::WriteAllText((Join-Path $stagingDir "backup_metadata.json"), $metaJson, [System.Text.Encoding]::UTF8)

            if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
            Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipPath -Force
        } finally {
            if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
        }

        $fileItem = Get-Item $zipPath
        $sizeBytes = $fileItem.Length
        $sizeKb = [Math]::Round($sizeBytes / 1024, 1)

        $actor = if ($manual) { "Admin" } else { "SYSTEM" }
        Add-AuditLog "BACKUP_CREATED" $actor "Created backup $zipName ($sizeKb KB)"
        $script:LastDailyBackup = $now

        Invoke-BackupRetentionCleanup 30 | Out-Null

        return @{
            success = $true
            filename = $zipName
            size_bytes = $sizeBytes
            size_kb = $sizeKb
            created_at = $now.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        }
    } catch {
        return @{ success = $false; message = $_.Exception.Message }
    }
}

function Invoke-BackupRetentionCleanup([int]$retentionDays = 30) {
    try {
        if (-not (Test-Path $script:BackupFolder)) { return 0 }
        $cutoff = (Get-Date).AddDays(-$retentionDays)
        $backups = Get-ChildItem -Path $script:BackupFolder -Filter "*.zip" -File
        $deleted = 0
        foreach ($b in $backups) {
            if ($b.LastWriteTime -lt $cutoff) {
                Remove-Item $b.FullName -Force
                $deleted++
                Add-AuditLog "BACKUP_PRUNED" "SYSTEM" "Deleted backup $($b.Name) older than $retentionDays days"
            }
        }
        return $deleted
    } catch {
        return 0
    }
}

function Get-DatabaseBackupsList() {
    if (-not (Test-Path $script:BackupFolder)) { return @() }
    $files = Get-ChildItem -Path $script:BackupFolder -Filter "*.zip" -File | Sort-Object LastWriteTime -Descending
    $list = @()
    foreach ($f in $files) {
        $sizeKb = [Math]::Round($f.Length / 1024, 1)
        $list += @{
            filename = $f.Name
            size_bytes = $f.Length
            size_formatted = "$sizeKb KB"
            created_at = $f.LastWriteTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        }
    }
    return $list
}

function Send-StaticFile($response, [string]$filePath, [string]$mime) {
    try {
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.StatusCode = 200
            $response.ContentType = $mime
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.OutputStream.Close()
            $response.Close()
        } else {
            $response.StatusCode = 404
            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("<h1>404 Not Found</h1>")
            $response.ContentType = "text/html; charset=utf-8"
            $response.ContentLength64 = $notFoundBytes.Length
            $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
            $response.OutputStream.Close()
            $response.Close()
        }
    } catch {}
}

$isLinux = ($PSVersionTable.Platform -eq "Unix") -or ($PSVersionTable.OS -like "*Linux*") -or ($null -ne $env:RENDER) -or [System.Environment]::OSVersion.Platform.ToString().ToLower().Contains("unix")
$listener = New-Object System.Net.HttpListener

if ($isLinux) {
    try {
        $listener.Prefixes.Add("http://*:$Port/")
        $listener.Start()
    } catch {
        try {
            $listener = New-Object System.Net.HttpListener
            $listener.Prefixes.Add("http://+:$Port/")
            $listener.Start()
        } catch {
            $listener = New-Object System.Net.HttpListener
            $listener.Prefixes.Add("http://0.0.0.0:$Port/")
            $listener.Start()
        }
    }
} else {
    try {
        $listener.Prefixes.Add("http://localhost:$Port/")
        $listener.Prefixes.Add("http://127.0.0.1:$Port/")
        $listener.Start()
    } catch {
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://127.0.0.1:$Port/")
        $listener.Start()
    }
}

Invoke-DataMigration
Invoke-ExpiryCheck -force

$listenHost = if ($isLinux) { "0.0.0.0" } else { "localhost" }
Write-Host "=================================================="
Write-Host "Luna Stream IPTV - High Performance Backend Server"
Write-Host "Listening at: http://${listenHost}:$Port/"
Write-Host "=================================================="

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        try {
            $method = $request.HttpMethod.ToUpper()
            $rawUrl = $request.Url.AbsolutePath
            $urlPath = $rawUrl.TrimStart('/')
            $queryParams = $request.QueryString

            if ($method -eq "OPTIONS") {
                $response.StatusCode = 204
                $response.AddHeader("Access-Control-Allow-Origin", "*")
                $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
                $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
                $response.OutputStream.Close()
                $response.Close()
                continue
            }

            # Read Body (Always UTF-8)
            $bodyStr = ""
            if ($request.HasEntityBody -and $request.ContentLength64 -gt 0) {
                $buffer = New-Object byte[] $request.ContentLength64
                $totalRead = 0
                while ($totalRead -lt $request.ContentLength64) {
                    $bytesRead = $request.InputStream.Read($buffer, $totalRead, $request.ContentLength64 - $totalRead)
                    if ($bytesRead -le 0) { break }
                    $totalRead += $bytesRead
                }
                $bodyStr = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $totalRead)
            }

            $bodyJson = $null
            if ($bodyStr) {
                try { $bodyJson = $bodyStr | ConvertFrom-Json } catch {}
            }
            $bodyObj = $bodyJson

            # Route Handling
            if ($urlPath.StartsWith("api/")) {
                $apiRoute = $urlPath.Substring(4)

                # Auth Login
                if ($apiRoute -eq "auth/login" -and $method -eq "POST") {
                    $ip = $request.RemoteEndPoint.Address.ToString()
                    if (-not (Test-RateLimit $ip)) {
                        Send-JsonResponse $response 429 @{ success = $false; message = "Too many attempts" }
                        continue
                    }
                    $settings = Read-JsonFileSafe "settings.json" @{}
                    $providedPass = if ($bodyJson) { $bodyJson.password } else { "" }
                    $targetPass = if ($settings.admin_password) { $settings.admin_password } else { "admin" }
                    
                    if (Test-PasswordHash $providedPass $targetPass) {
                        if (-not $settings.admin_password -or -not $settings.admin_password.Contains(':')) {
                            $settings.admin_password = Get-PasswordHash $providedPass
                            if (-not $settings.brand_name) { $settings.brand_name = "Luna Stream IPTV" }
                            if (-not $settings.support_whatsapp) { $settings.support_whatsapp = "447413469398" }
                            if (-not $settings.support_telegram) { $settings.support_telegram = "LunaStreamOfficial" }
                            if (-not $settings.paypal_me_link) { $settings.paypal_me_link = "https://paypal.me/adilfarooq909" }
                            if (-not $settings.paypal_mode) { $settings.paypal_mode = "paypal_me" }
                            Write-JsonFileSafe "settings.json" $settings
                        }
                        $token = New-SessionToken
                        $script:Sessions[$token] = @{ created_at = Get-Date; ip = $ip }
                        $script:LoginAttempts[$ip].count = 0
                        Add-AuditLog "LOGIN" "Admin" "Successful login from $ip"
                        
                        Send-JsonResponse $response 200 @{
                            success = $true
                            token = $token
                            brand = $settings.brand_name
                        }
                    } else {
                        $script:LoginAttempts[$ip].count++
                        Send-JsonResponse $response 401 @{
                            success = $false
                            message = "Invalid master password"
                        }
                    }
                }
                # Auth Verify
                elseif ($apiRoute -eq "auth/verify" -and $method -eq "POST") {
                    $token = if ($bodyJson) { $bodyJson.token } else { "" }
                    if ($script:Sessions.ContainsKey($token)) {
                        $session = $script:Sessions[$token]
                        $elapsed = (Get-Date) - $session.created_at
                        if ($elapsed.TotalHours -lt 8) {
                            Send-JsonResponse $response 200 @{ valid = $true }
                        } else {
                            $script:Sessions.Remove($token)
                            Send-JsonResponse $response 401 @{ valid = $false }
                        }
                    } else {
                        Send-JsonResponse $response 401 @{ valid = $false }
                    }
                }
                # Public Config
                elseif ($apiRoute -eq "public/config" -and $method -eq "GET") {
                    $settings = Read-JsonFileSafe "settings.json" @{}
                    Send-JsonResponse $response 200 @{
                        brand_name = $settings.brand_name
                        support_whatsapp = $settings.support_whatsapp
                        support_telegram = $settings.support_telegram
                        paypal_me_link = $settings.paypal_me_link
                        paypal_mode = $settings.paypal_mode
                        paypal_instructions = $settings.paypal_instructions
                    }
                }
                # Public Pricing Catalog
                elseif ($apiRoute -eq "public/pricing" -and $method -eq "GET") {
                    $catalog = Get-PricingCatalog
                    if ($catalog) {
                        Send-JsonResponse $response 200 $catalog
                    } else {
                        Send-JsonResponse $response 500 @{ success = $false; message = "Pricing catalog unavailable" }
                    }
                }
                # Admin Pricing (GET)
                elseif ($apiRoute -eq "admin/pricing" -and $method -eq "GET") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $catalog = Get-PricingCatalog
                    Send-JsonResponse $response 200 @{ success = $true; pricing = $catalog }
                }
                # Admin Pricing (POST Update)
                elseif ($apiRoute -eq "admin/pricing" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $pricingPayload = if ($bodyObj.pricing) { $bodyObj.pricing } else { $bodyObj }
                    if (-not $pricingPayload -or -not $pricingPayload.plans) {
                        Send-JsonResponse $response 400 @{ success = $false; message = "Invalid pricing payload: 'plans' required" }
                        continue
                    }
                    Write-JsonFileSafe "pricing.json" $pricingPayload
                    Update-MemoryPricingCatalog $pricingPayload
                    Add-AuditLog "PRICING_UPDATE" "Admin" "Updated plan prices, discount cuts, and bonus extra months"
                    Send-JsonResponse $response 200 @{ success = $true; message = "Pricing updated successfully"; pricing = $pricingPayload }
                }
                # Public Sports Fixtures
                elseif ($apiRoute -eq "sports/fixtures" -and $method -eq "GET") {
                    $fixtures = Read-JsonFileSafe "sports_fixtures.json" $null
                    $todayStr = (Get-Date).ToString("yyyy-MM-dd")
                    if (-not $fixtures -or $fixtures.generated_date -ne $todayStr) {
                        $genScript = Join-Path $Folder "scripts\generate_sports_fixtures.py"
                        if (Test-Path $genScript) {
                            try {
                                & python $genScript | Out-Null
                                $fixtures = Read-JsonFileSafe "sports_fixtures.json" $null
                            } catch {}
                        }
                    }
                    if ($fixtures) {
                        Send-JsonResponse $response 200 $fixtures
                    } else {
                        Send-JsonResponse $response 500 @{ success = $false; message = "Fixtures unavailable" }
                    }
                }
                # Admin Sports Refresh
                elseif ($apiRoute -eq "admin/sports/refresh" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $genScript = Join-Path $Folder "scripts\generate_sports_fixtures.py"
                    if (Test-Path $genScript) {
                        try {
                            & python $genScript | Out-Null
                        } catch {}
                    }
                    $fixtures = Read-JsonFileSafe "sports_fixtures.json" $null
                    Add-AuditLog "SPORTS_REFRESH" "Admin" "Refreshed sports fixtures schedule"
                    Send-JsonResponse $response 200 $fixtures
                }

                # Admin Stats
                elseif ($apiRoute -eq "admin/stats" -and $method -eq "GET") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $orders = @(Read-JsonFileSafe "orders.json" @())
                    $visitors = @(Read-JsonFileSafe "visitors.json" @())
                    $leads = @(Read-JsonFileSafe "leads.json" @())
                    $trials = @(Read-JsonFileSafe "trials.json" @())

                    $rev = 0.0
                    $activeCount = 0
                    $pendingCount = 0
                    foreach ($o in $orders) {
                        if ($o.status -eq "Active") {
                            $activeCount++
                            $amtVal = 0.0
                            [double]::TryParse([string]($o.total_amount), [ref]$amtVal) | Out-Null
                            $rev += $amtVal
                        } elseif ($o.status -eq "Pending") {
                            $pendingCount++
                        }
                    }

                    $uniqueVisitors = ($visitors | Select-Object -ExpandProperty session_id -Unique).Count
                    if ($uniqueVisitors -eq 0) { $uniqueVisitors = 1 }
                    $conversion = [Math]::Round(($orders.Count / $uniqueVisitors) * 100, 1)

                    Send-JsonResponse $response 200 @{
                        total_revenue = [Math]::Round($rev, 2)
                        active_subscriptions = $activeCount
                        pending_orders = $pendingCount
                        total_orders = $orders.Count
                        total_visitors = $visitors.Count
                        total_leads = $leads.Count
                        pending_trials = @($trials | Where-Object { $_.status -eq "Pending" }).Count
                        conversion_rate = $conversion
                    }
                }
                # Admin Orders
                elseif ($apiRoute -eq "admin/orders") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $orders = [System.Collections.ArrayList]@(Read-JsonFileSafe "orders.json" @())
                    if ($method -eq "GET") {
                        Send-JsonResponse $response 200 $orders
                    } elseif ($method -eq "POST") {
                        $newId = "LUNA-" + (Get-Date).ToString("yyyyMMdd") + "-" + (New-SecureId "" 5)
                        $uName = if ($bodyJson.xtream_username) { $bodyJson.xtream_username } else { "luna_" + (New-SecureId "" 8) }
                        $uPass = if ($bodyJson.xtream_password) { $bodyJson.xtream_password } else { New-SecurePassword 12 }
                        $m3u = if ($bodyJson.m3u_url) { $bodyJson.m3u_url } else { Get-M3UUrl $uName $uPass }
                        
                        $amt = 79.99
                        if ($bodyJson.total_amount) { [double]::TryParse([string]$bodyJson.total_amount, [ref]$amt) | Out-Null }

                        $newOrder = @{
                            id = $newId
                            customer_name = if ($bodyJson.customer_name) { $bodyJson.customer_name } else { "Direct Subscriber" }
                            customer_email = if ($bodyJson.customer_email) { $bodyJson.customer_email } else { "" }
                            customer_phone = if ($bodyJson.customer_phone) { $bodyJson.customer_phone } else { "" }
                            plan_id = if ($bodyJson.plan_id) { $bodyJson.plan_id } else { "12m" }
                            plan_title = if ($bodyJson.plan_title) { $bodyJson.plan_title } else { "12 Months Ultimate Pass" }
                            duration_months = if ($bodyJson.duration_months) { [int]$bodyJson.duration_months } else { 12 }
                            devices_count = if ($bodyJson.devices_count) { [int]$bodyJson.devices_count } else { 1 }
                            currency = if ($bodyJson.currency) { $bodyJson.currency } else { "USD" }
                            total_amount = $amt
                            payment_method = if ($bodyJson.payment_method) { $bodyJson.payment_method } else { "Manual Admin Entry" }
                            adult_included = if ($null -ne $bodyJson.adult_included) { [bool]$bodyJson.adult_included } else { $false }
                            server_region = if ($bodyJson.server_region) { $bodyJson.server_region } else { "Global Dynamic CDN" }
                            device_type = if ($bodyJson.device_type) { $bodyJson.device_type } else { "Amazon FireStick 4K" }
                            status = if ($bodyJson.status) { $bodyJson.status } else { "Active" }
                            m3u_url = $m3u
                            xtream_username = $uName
                            xtream_password = $uPass
                            notes = if ($bodyJson.notes) { $bodyJson.notes } else { "Created via Admin Panel" }
                            created_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                            updated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                        }
                        $orders.Insert(0, $newOrder)
                        Write-JsonFileSafe "orders.json" $orders
                        
                        $customers = [System.Collections.ArrayList]@(Read-JsonFileSafe "customers.json" @())
                        $targetCustomer = $null
                        $email = $newOrder.customer_email
                        if ($email) {
                            foreach ($c in $customers) {
                                if ($c.email -eq $email) { $targetCustomer = $c; break }
                            }
                        }
                        if (-not $targetCustomer -and $email) {
                            $targetCustomer = @{
                                id = 'CUS-' + (New-SecureId '' 8)
                                email = $email
                                name = $newOrder.customer_name
                                phone = $newOrder.customer_phone
                                password_hash = ''
                                created_at = $newOrder.created_at
                                tags = @()
                                lifetime_value = 0.0
                                notes = ''
                                status = 'active'
                            }
                            $customers.Insert(0, $targetCustomer)
                            Write-JsonFileSafe "customers.json" $customers
                        }
                        if ($targetCustomer) {
                            $payments = [System.Collections.ArrayList]@(Read-JsonFileSafe "payments.json" @())
                            $newPay = @{
                                id = 'PAY-' + (Get-Date).ToString('yyyyMMdd') + '-' + (New-SecureId '' 5)
                                order_id = $newOrder.id
                                customer_id = $targetCustomer.id
                                provider = 'manual'
                                provider_transaction_id = ''
                                amount = $amt
                                currency = $newOrder.currency
                                status = if ($newOrder.status -eq 'Active') { 'CONFIRMED' } else { 'PENDING' }
                                created_at = $newOrder.created_at
                                confirmed_at = if ($newOrder.status -eq 'Active') { $newOrder.created_at } else { '' }
                                failure_reason = ''
                                refund_status = 'NONE'
                            }
                            $payments.Insert(0, $newPay)
                            Write-JsonFileSafe "payments.json" $payments
                        }
                        Add-AuditLog "CREATE_ORDER" "Admin" "Created order $($newOrder.id)"
                        
                        Send-JsonResponse $response 201 $newOrder
                    } elseif ($method -eq "PATCH") {
                        $targetId = $bodyJson.id
                        $updatedOrder = $null
                        $statusChangedToActive = $false
                        for ($i = 0; $i -lt $orders.Count; $i++) {
                            if ($orders[$i].id -eq $targetId) {
                                if ($bodyJson.status) { 
                                    if ($orders[$i].status -ne "Active" -and $bodyJson.status -eq "Active") {
                                        $statusChangedToActive = $true
                                    }
                                    $orders[$i].status = $bodyJson.status 
                                }
                                if ($bodyJson.m3u_url) { $orders[$i].m3u_url = $bodyJson.m3u_url }
                                if ($bodyJson.xtream_username) { $orders[$i].xtream_username = $bodyJson.xtream_username }
                                if ($bodyJson.xtream_password) { $orders[$i].xtream_password = $bodyJson.xtream_password }
                                if ($null -ne $bodyJson.notes) { $orders[$i].notes = $bodyJson.notes }
                                $orders[$i].updated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                                $updatedOrder = $orders[$i]
                                break
                            }
                        }
                        Write-JsonFileSafe "orders.json" $orders
                        
                        if ($statusChangedToActive -and $updatedOrder) {
                            $customers = [System.Collections.ArrayList]@(Read-JsonFileSafe "customers.json" @())
                            $subscriptions = [System.Collections.ArrayList]@(Read-JsonFileSafe "subscriptions.json" @())
                            $payments = [System.Collections.ArrayList]@(Read-JsonFileSafe "payments.json" @())
                            
                            $cId = ""
                            $email = $updatedOrder.customer_email
                            foreach ($c in $customers) {
                                if ($c.email -eq $email) {
                                    $cId = $c.id
                                    $amt = 0.0
                                    [double]::TryParse([string]($updatedOrder.total_amount), [ref]$amt) | Out-Null
                                    $c.lifetime_value += $amt
                                    break
                                }
                            }
                            if ($cId) {
                                Write-JsonFileSafe "customers.json" $customers
                                
                                $start = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                                $dur = if ($updatedOrder.duration_months) { [int]$updatedOrder.duration_months } else { 12 }
                                $end = (Get-Date).ToUniversalTime().AddMonths($dur).ToString("yyyy-MM-ddTHH:mm:ssZ")
                                
                                # Check if IPTV Panel auto-provisioning is active and line credentials not set
                                $settings = Read-JsonFileSafe "settings.json" @{}
                                if ($settings.iptv_panel_enabled -and $settings.iptv_panel_auto_fulfill_orders -and (-not $updatedOrder.xtream_username -or -not $updatedOrder.xtream_password)) {
                                    $panelLine = New-IptvPanelLine $updatedOrder.plan_id $updatedOrder.devices_count $updatedOrder.customer_email
                                    $updatedOrder.xtream_username = $panelLine.xtream_username
                                    $updatedOrder.xtream_password = $panelLine.xtream_password
                                    $updatedOrder.m3u_url = $panelLine.m3u_url
                                }

                                $sub = @{
                                    id = 'SUB-' + (Get-Date).ToString('yyyy') + '-' + (New-SecureId '' 5)
                                    customer_id = $cId
                                    order_id = $updatedOrder.id
                                    plan_id = $updatedOrder.plan_id
                                    plan_title = $updatedOrder.plan_title
                                    devices_count = $updatedOrder.devices_count
                                    status = 'ACTIVE'
                                    start_date = $start
                                    end_date = $end
                                    xtream_username = $updatedOrder.xtream_username
                                    xtream_password = $updatedOrder.xtream_password
                                    m3u_url = $updatedOrder.m3u_url
                                    created_at = $start
                                    updated_at = $start
                                }
                                $subscriptions.Insert(0, $sub)
                                Write-JsonFileSafe "subscriptions.json" $subscriptions
                                
                                foreach ($p in $payments) {
                                    if ($p.order_id -eq $updatedOrder.id) {
                                        $p.status = 'CONFIRMED'
                                        $p.confirmed_at = $start
                                        break
                                    }
                                }
                                Write-JsonFileSafe "payments.json" $payments

                                # Dispatch Automated Notifications: Payment Confirmed & Line Credentials
                                if ($updatedOrder.customer_email) {
                                    $settings = Read-JsonFileSafe "settings.json" @{}
                                    $srvUrl = if ($settings.m3u_server_template -match 'https?://[^/]+') { $matches[0] } else { "http://line.lunastream.vip:8080" }
                                    $endFormatted = if ($end) { ([DateTime]::Parse($end)).ToString("yyyy-MM-dd") } else { "12 Months" }

                                    Send-EmailNotification "PAYMENT_CONFIRMED" $updatedOrder.customer_email @{
                                        customer_name = $updatedOrder.customer_name
                                        order_id = $updatedOrder.id
                                        amount = $updatedOrder.total_amount
                                        currency = $updatedOrder.currency
                                    } | Out-Null

                                    Send-EmailNotification "CREDENTIALS_DELIVERED" $updatedOrder.customer_email @{
                                        customer_name = $updatedOrder.customer_name
                                        order_id = $updatedOrder.id
                                        plan_title = $updatedOrder.plan_title
                                        end_date = $endFormatted
                                        server_url = $srvUrl
                                        xtream_username = $updatedOrder.xtream_username
                                        xtream_password = $updatedOrder.xtream_password
                                        m3u_url = $updatedOrder.m3u_url
                                    } | Out-Null
                                }
                            }
                        }
                        
                        Add-AuditLog "UPDATE_ORDER" "Admin" "Updated order $targetId"
                        Send-JsonResponse $response 200 @{ success = $true; order = $updatedOrder }
                    } elseif ($method -eq "DELETE") {
                        $targetId = $bodyJson.id
                        $filtered = @($orders | Where-Object { $_.id -ne $targetId })
                        Write-JsonFileSafe "orders.json" $filtered
                        Send-JsonResponse $response 200 @{ success = $true }
                    }
                }
                # Admin Trials
                elseif ($apiRoute -eq "admin/trials") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $trials = [System.Collections.ArrayList]@(Read-JsonFileSafe "trials.json" @())
                    if ($method -eq "GET") {
                        Send-JsonResponse $response 200 $trials
                    } elseif ($method -eq "PATCH") {
                        $targetId = $bodyJson.id
                        $targetTrial = $null
                        for ($i = 0; $i -lt $trials.Count; $i++) {
                            if ($trials[$i].id -eq $targetId) {
                                if ($bodyJson.status) { $trials[$i].status = $bodyJson.status }
                                if ($bodyJson.test_line_credentials) { $trials[$i].test_line_credentials = $bodyJson.test_line_credentials }
                                $targetTrial = $trials[$i]
                                break
                            }
                        }
                        Write-JsonFileSafe "trials.json" $trials

                        # Trigger Automated Trial Dispatched Email
                        if ($targetTrial -and ($bodyJson.status -eq "Dispatched" -or $bodyJson.status -eq "Active" -or $bodyJson.test_line_credentials)) {
                            if ($targetTrial.email) {
                                $settings = Read-JsonFileSafe "settings.json" @{}
                                $srvUrl = if ($settings.m3u_server_template -match 'https?://[^/]+') { $matches[0] } else { "http://line.lunastream.vip:8080" }
                                $uName = if ($targetTrial.xtream_username) { $targetTrial.xtream_username } else { "trial_" + (New-SecureId "" 4) }
                                $uPass = if ($targetTrial.xtream_password) { $targetTrial.xtream_password } else { (New-SecurePassword 8) }
                                $m3u = Get-M3UUrl $uName $uPass
                                Send-EmailNotification "TRIAL_DISPATCHED" $targetTrial.email @{
                                    customer_name = $targetTrial.name
                                    device_type = if ($targetTrial.device) { $targetTrial.device } else { "Streaming Device" }
                                    server_url = $srvUrl
                                    xtream_username = $uName
                                    xtream_password = $uPass
                                    m3u_url = $m3u
                                } | Out-Null
                            }
                        }

                        Send-JsonResponse $response 200 @{ success = $true }
                    }
                }
                # Admin Leads
                elseif ($apiRoute -eq "admin/leads" -and $method -eq "GET") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $leads = @(Read-JsonFileSafe "leads.json" @())
                    Send-JsonResponse $response 200 $leads
                }
                # Admin Visitors (Full stream & active live sessions)
                elseif (($apiRoute -eq "admin/visitors" -or $apiRoute -eq "admin/visitors/live") -and $method -eq "GET") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }

                    # Prune sessions older than 2 minutes (120s)
                    $cutoff = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - 120
                    $activeList = [System.Collections.ArrayList]@()
                    $staleKeys = @()

                    foreach ($k in $script:ActiveVisitors.Keys) {
                        $v = $script:ActiveVisitors[$k]
                        if ($v.last_seen_epoch -ge $cutoff) {
                            $activeList.Add($v) | Out-Null
                        } else {
                            $staleKeys += $k
                        }
                    }
                    foreach ($sk in $staleKeys) {
                        $script:ActiveVisitors.Remove($sk)
                    }

                    $visitors = @(Read-JsonFileSafe "visitors.json" @())

                    Send-JsonResponse $response 200 @{
                        success = $true
                        active_count = $activeList.Count
                        active_visitors = $activeList
                        visitors = $visitors
                        total_count = $visitors.Count
                    }
                }
                # Admin Settings
                elseif ($apiRoute -eq "admin/settings") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $settings = Read-JsonFileSafe "settings.json" @{}
                    if ($method -eq "GET") {
                        $safeSettings = [ordered]@{}
                        foreach ($p in $settings.PSObject.Properties) {
                            if ($p.Name -ne 'paypal_client_secret' -and $p.Name -ne 'admin_password' -and $p.Name -ne 'smtp_pass' -and $p.Name -ne 'iptv_panel_password') {
                                $safeSettings[$p.Name] = $p.Value
                            }
                        }
                        $safeSettings['has_smtp_pass'] = ($null -ne $settings.smtp_pass -and [string]$settings.smtp_pass.Trim() -ne "")
                        $safeSettings['has_iptv_panel_pass'] = ($null -ne $settings.iptv_panel_password -and [string]$settings.iptv_panel_password.Trim() -ne "")
                        Send-JsonResponse $response 200 $safeSettings
                    } elseif ($method -eq "PATCH") {
                        if ($null -ne $bodyJson.smtp_enabled) { Set-ObjectProperty $settings 'smtp_enabled' ([bool]$bodyJson.smtp_enabled) }
                        if ($null -ne $bodyJson.smtp_server) { Set-ObjectProperty $settings 'smtp_server' ([string]$bodyJson.smtp_server) }
                        if ($null -ne $bodyJson.smtp_port) { Set-ObjectProperty $settings 'smtp_port' ([int]$bodyJson.smtp_port) }
                        if ($null -ne $bodyJson.smtp_user) { Set-ObjectProperty $settings 'smtp_user' ([string]$bodyJson.smtp_user) }
                        if ($null -ne $bodyJson.smtp_pass -and [string]$bodyJson.smtp_pass.Trim() -ne "") { Set-ObjectProperty $settings 'smtp_pass' ([string]$bodyJson.smtp_pass) }
                        if ($null -ne $bodyJson.smtp_from) { Set-ObjectProperty $settings 'smtp_from' ([string]$bodyJson.smtp_from) }
                        if ($null -ne $bodyJson.smtp_ssl) { Set-ObjectProperty $settings 'smtp_ssl' ([bool]$bodyJson.smtp_ssl) }
                        if ($null -ne $bodyJson.supplier_cost_per_credit) { Set-ObjectProperty $settings 'supplier_cost_per_credit' ([double]$bodyJson.supplier_cost_per_credit) }
                        if ($null -ne $bodyJson.supplier_panel_url) { Set-ObjectProperty $settings 'supplier_panel_url' ([string]$bodyJson.supplier_panel_url) }
                        if ($null -ne $bodyJson.renewal_discount_percent) { Set-ObjectProperty $settings 'renewal_discount_percent' ([int]$bodyJson.renewal_discount_percent) }
                        if ($null -ne $bodyJson.announcement_enabled) { Set-ObjectProperty $settings 'announcement_enabled' ([bool]$bodyJson.announcement_enabled) }
                        if ($null -ne $bodyJson.announcement_badge) { Set-ObjectProperty $settings 'announcement_badge' ([string]$bodyJson.announcement_badge) }
                        if ($null -ne $bodyJson.announcement_text) { Set-ObjectProperty $settings 'announcement_text' ([string]$bodyJson.announcement_text) }
                        if ($null -ne $bodyJson.announcement_discount_percent) { Set-ObjectProperty $settings 'announcement_discount_percent' ([int]$bodyJson.announcement_discount_percent) }
                        if ($null -ne $bodyJson.announcement_promo_code) { Set-ObjectProperty $settings 'announcement_promo_code' ([string]$bodyJson.announcement_promo_code) }
                        if ($null -ne $bodyJson.announcement_link_text) { Set-ObjectProperty $settings 'announcement_link_text' ([string]$bodyJson.announcement_link_text) }
                        if ($null -ne $bodyJson.announcement_link_url) { Set-ObjectProperty $settings 'announcement_link_url' ([string]$bodyJson.announcement_link_url) }

                        # Synchronize announcement promo code with coupons.json
                        $promoCodeToSync = if ($null -ne $bodyJson.announcement_promo_code) { [string]$bodyJson.announcement_promo_code.Trim().ToUpper() } elseif ($settings.announcement_promo_code) { [string]$settings.announcement_promo_code.Trim().ToUpper() } else { "" }
                        if ($promoCodeToSync) {
                            $discPercent = if ($null -ne $bodyJson.announcement_discount_percent) { [int]$bodyJson.announcement_discount_percent } elseif ($null -ne $settings.announcement_discount_percent) { [int]$settings.announcement_discount_percent } else { 20 }
                            $bannerActive = if ($null -ne $bodyJson.announcement_enabled) { [bool]$bodyJson.announcement_enabled } elseif ($null -ne $settings.announcement_enabled) { [bool]$settings.announcement_enabled } else { $true }
                            
                            $couponsList = [System.Collections.ArrayList]@(Read-JsonFileSafe "coupons.json" @())
                            $existingCoup = $null
                            for ($ci = 0; $ci -lt $couponsList.Count; $ci++) {
                                if ($couponsList[$ci].code -and $couponsList[$ci].code.ToString().Trim().ToUpper() -eq $promoCodeToSync) {
                                    $existingCoup = $couponsList[$ci]
                                    break
                                }
                            }
                            if ($existingCoup) {
                                $existingCoup.discount_value = $discPercent
                                $existingCoup.discount_type = "percentage"
                                $existingCoup.active = $bannerActive
                            } else {
                                $newCoup = @{
                                    id = "COUP-" + (New-SecureId "" 5)
                                    code = $promoCodeToSync
                                    discount_type = "percentage"
                                    discount_value = $discPercent
                                    valid_from = (Get-Date).ToString("yyyy-01-01")
                                    valid_until = (Get-Date).AddYears(2).ToString("yyyy-MM-dd")
                                    usage_limit = 0
                                    times_used = 0
                                    allowed_plans = @("3m", "6m", "12m")
                                    min_order_amount = 0
                                    active = $bannerActive
                                }
                                $couponsList.Insert(0, $newCoup)
                            }
                            Write-JsonFileSafe "coupons.json" $couponsList
                        }
                        if ($null -ne $bodyJson.paypal_email) { Set-ObjectProperty $settings 'paypal_email' ([string]$bodyJson.paypal_email) }
                        if ($null -ne $bodyJson.paypal_me_link) { Set-ObjectProperty $settings 'paypal_me_link' ([string]$bodyJson.paypal_me_link) }
                        if ($null -ne $bodyJson.paypal_mode) { Set-ObjectProperty $settings 'paypal_mode' ([string]$bodyJson.paypal_mode) }
                        if ($null -ne $bodyJson.paypal_instructions) { Set-ObjectProperty $settings 'paypal_instructions' ([string]$bodyJson.paypal_instructions) }
                        if ($null -ne $bodyJson.iptv_panel_enabled) { Set-ObjectProperty $settings 'iptv_panel_enabled' ([bool]$bodyJson.iptv_panel_enabled) }
                        if ($null -ne $bodyJson.iptv_panel_type) { Set-ObjectProperty $settings 'iptv_panel_type' ([string]$bodyJson.iptv_panel_type) }
                        if ($null -ne $bodyJson.iptv_panel_url) { Set-ObjectProperty $settings 'iptv_panel_url' ([string]$bodyJson.iptv_panel_url) }
                        if ($null -ne $bodyJson.iptv_panel_username) { Set-ObjectProperty $settings 'iptv_panel_username' ([string]$bodyJson.iptv_panel_username) }
                        if ($null -ne $bodyJson.iptv_panel_password -and [string]$bodyJson.iptv_panel_password.Trim() -ne "") { Set-ObjectProperty $settings 'iptv_panel_password' ([string]$bodyJson.iptv_panel_password) }
                        if ($null -ne $bodyJson.iptv_panel_package_3m) { Set-ObjectProperty $settings 'iptv_panel_package_3m' ([string]$bodyJson.iptv_panel_package_3m) }
                        if ($null -ne $bodyJson.iptv_panel_package_6m) { Set-ObjectProperty $settings 'iptv_panel_package_6m' ([string]$bodyJson.iptv_panel_package_6m) }
                        if ($null -ne $bodyJson.iptv_panel_package_12m) { Set-ObjectProperty $settings 'iptv_panel_package_12m' ([string]$bodyJson.iptv_panel_package_12m) }
                        if ($null -ne $bodyJson.iptv_panel_package_trial) { Set-ObjectProperty $settings 'iptv_panel_package_trial' ([string]$bodyJson.iptv_panel_package_trial) }
                        if ($null -ne $bodyJson.iptv_panel_auto_fulfill_orders) { Set-ObjectProperty $settings 'iptv_panel_auto_fulfill_orders' ([bool]$bodyJson.iptv_panel_auto_fulfill_orders) }
                        if ($null -ne $bodyJson.iptv_panel_auto_fulfill_trials) { Set-ObjectProperty $settings 'iptv_panel_auto_fulfill_trials' ([bool]$bodyJson.iptv_panel_auto_fulfill_trials) }
                        Write-JsonFileSafe "settings.json" $settings
                        Add-AuditLog "SETTINGS_UPDATE" "Admin" "Settings updated"
                        Send-JsonResponse $response 200 @{ success = $true }
                    }
                }
                                # Admin: Test SMTP Connection & Send Test Email
                elseif ($apiRoute -eq "admin/test-email" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $settings = Read-JsonFileSafe "settings.json" @{}
                    $toEmail = if ($bodyJson.to_email) { [string]$bodyJson.to_email } else { $settings.smtp_from }
                    if (-not $toEmail) { $toEmail = "support@lunastream.vip" }

                    if (-not $settings.smtp_enabled -or -not $settings.smtp_server) {
                        Send-JsonResponse $response 400 @{
                            success = $false
                            message = "SMTP is currently disabled or SMTP server is not configured in Settings."
                        }
                        continue
                    }

                    try {
                        $portNum = if ($settings.smtp_port) { [int]$settings.smtp_port } else { 587 }
                        $smtpClient = New-Object System.Net.Mail.SmtpClient([string]$settings.smtp_server, $portNum)
                        if ($settings.smtp_user -and $settings.smtp_pass) {
                            $smtpClient.Credentials = New-Object System.Net.NetworkCredential([string]$settings.smtp_user, [string]$settings.smtp_pass)
                        }
                        $smtpClient.EnableSsl = if ($null -ne $settings.smtp_ssl) { [bool]$settings.smtp_ssl } else { $true }
                        $fromAddr = if ($settings.smtp_from) { [string]$settings.smtp_from } else { "support@lunastream.vip" }
                        $testSubj = 'Luna Stream IPTV - SMTP Diagnostic Test Passed'
                        $testBody = "Hello Admin,`n`nThis is a diagnostic test email confirming that your SMTP server connection and TLS handshake for Luna Stream IPTV are working successfully!`n`nTimestamp: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))`nSMTP Server: $($settings.smtp_server)`nPort: $portNum`nSender: $fromAddr`n`nAll automated customer notifications are active and delivering live.`n`nWarm regards,`nLuna Stream Engineering"
                        $mailMsg = New-Object System.Net.Mail.MailMessage($fromAddr, $toEmail, $testSubj, $testBody)
                        $smtpClient.Send($mailMsg)
                        Add-AuditLog "SMTP_TEST_SENT" "Admin" "Sent test email to $($toEmail)"
                        Send-JsonResponse $response 200 @{
                            success = $true
                            message = "Test email successfully dispatched to $($toEmail)"
                        }
                    } catch {
                        $errEx = $_.Exception.Message
                        Add-AuditLog "SMTP_TEST_FAILED" "Admin" "Failed test email to $($toEmail) - $errEx"
                        Send-JsonResponse $response 500 @{
                            success = $false
                            message = "SMTP Connection Failed: $errEx"
                        }
                    }
                }
                # Admin: Resend Order Notification
                elseif ($apiRoute -eq "admin/orders/resend-email" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $orderId = [string]$bodyJson.order_id
                    $tmplKey = if ($bodyJson.template_key) { [string]$bodyJson.template_key } else { "CREDENTIALS_DELIVERED" }
                    $orders = @(Read-JsonFileSafe "orders.json" @())
                    $target = $orders | Where-Object { $_.id -eq $orderId } | Select-Object -First 1
                    if (-not $target) {
                        Send-JsonResponse $response 404 @{ success = $false; message = "Order not found" }
                        continue
                    }
                    $settings = Read-JsonFileSafe "settings.json" @{}
                    $srvUrl = if ($settings.m3u_server_template -match 'https?://[^/]+') { $matches[0] } else { "http://line.lunastream.vip:8080" }
                    $res = Send-EmailNotification $tmplKey $target.customer_email @{
                        customer_name = $target.customer_name
                        order_id = $target.id
                        plan_title = $target.plan_title
                        devices_count = $target.devices_count
                        total_amount = $target.total_amount
                        amount = $target.total_amount
                        currency = $target.currency
                        end_date = if ($target.end_date) { $target.end_date } else { "12 Months" }
                        server_url = $srvUrl
                        xtream_username = $target.xtream_username
                        xtream_password = $target.xtream_password
                        m3u_url = $target.m3u_url
                    }
                    Add-AuditLog "EMAIL_RESENT" "Admin" "Resent $tmplKey for order $orderId to $($target.customer_email)"
                    Send-JsonResponse $response 200 @{ success = $true; dispatch = $res }
                }
                                # Admin: Test IPTV Panel Connection & Credits
                elseif ($apiRoute -eq "admin/iptv-panel/test" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    
                    $settings = Read-JsonFileSafe "settings.json" @{}
                    $testUrl = if ($bodyJson.url) { [string]$bodyJson.url } else { $settings.iptv_panel_url }
                    $testUser = if ($bodyJson.username) { [string]$bodyJson.username } else { $settings.iptv_panel_username }
                    $testPass = if ($bodyJson.password) { [string]$bodyJson.password } else { $settings.iptv_panel_password }
                    
                    if (-not $testUrl -or -not $testUser) {
                        Send-JsonResponse $response 400 @{ success = $false; message = "Panel URL and reseller username are required." }
                        continue
                    }

                    $testParams = @{
                        "__bypass_enabled_check" = $true
                        "__panel_url" = $testUrl
                        "__panel_username" = $testUser
                        "__panel_password" = $testPass
                    }
                    $res = Invoke-IptvPanelApi "user_info" $testParams
                    if (-not $res.success) {
                        $res2 = Invoke-IptvPanelApi "get_credits" $testParams
                        if ($res2.success) { $res = $res2 }
                    }

                    if ($res.success) {
                        $credits = "N/A"
                        if ($null -ne $res.data.credits) { $credits = [string]$res.data.credits }
                        elseif ($null -ne $res.data.credit) { $credits = [string]$res.data.credit }
                        elseif ($null -ne $res.data.balance) { $credits = [string]$res.data.balance }

                        Add-AuditLog "PANEL_TEST" "Admin" "IPTV Panel connection test successful (Credits: $credits)"
                        Send-JsonResponse $response 200 @{
                            success = $true
                            message = "Connected successfully to IPTV Panel!"
                            credits = $credits
                            data = $res.data
                        }
                    } else {
                        Add-AuditLog "PANEL_TEST_FAILED" "Admin" "IPTV Panel test failed: $($res.error)"
                        Send-JsonResponse $response 400 @{
                            success = $false
                            message = "Connection failed: $($res.error)"
                        }
                    }
                }
                # Admin: Fetch Packages from IPTV Panel
                elseif ($apiRoute -eq "admin/iptv-panel/packages" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $res = Invoke-IptvPanelApi "get_packages" @{ "__bypass_enabled_check" = $true }
                    if ($res.success) {
                        Send-JsonResponse $response 200 @{ success = $true; packages = $res.data }
                    } else {
                        Send-JsonResponse $response 400 @{ success = $false; message = "Failed to fetch packages: $($res.error)" }
                    }
                }
                # Admin: On-Demand Provision Line on IPTV Panel
                elseif ($apiRoute -eq "admin/subscriptions/provision-panel" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $subId = [string]$bodyJson.subscription_id
                    $orderId = [string]$bodyJson.order_id
                    $planId = if ($bodyJson.plan_id) { [string]$bodyJson.plan_id } else { "12m" }
                    $devices = if ($bodyJson.devices_count) { [int]$bodyJson.devices_count } else { 1 }

                    $lineRes = New-IptvPanelLine $planId $devices $bodyJson.customer_email $bodyJson.xtream_username $bodyJson.xtream_password

                    if ($subId) {
                        $subs = [System.Collections.ArrayList]@(Read-JsonFileSafe "subscriptions.json" @())
                        for ($i = 0; $i -lt $subs.Count; $i++) {
                            if ($subs[$i].id -eq $subId) {
                                $subs[$i].xtream_username = $lineRes.xtream_username
                                $subs[$i].xtream_password = $lineRes.xtream_password
                                $subs[$i].m3u_url = $lineRes.m3u_url
                                if ($lineRes.panel_user_id) {
                                    Set-ObjectProperty $subs[$i] "panel_user_id" $lineRes.panel_user_id
                                }
                                break
                            }
                        }
                        Write-JsonFileSafe "subscriptions.json" $subs
                    }

                    if ($orderId) {
                        $orders = [System.Collections.ArrayList]@(Read-JsonFileSafe "orders.json" @())
                        for ($i = 0; $i -lt $orders.Count; $i++) {
                            if ($orders[$i].id -eq $orderId) {
                                $orders[$i].xtream_username = $lineRes.xtream_username
                                $orders[$i].xtream_password = $lineRes.xtream_password
                                $orders[$i].m3u_url = $lineRes.m3u_url
                                break
                            }
                        }
                        Write-JsonFileSafe "orders.json" $orders
                    }

                    Add-AuditLog "PANEL_MANUAL_PROVISION" "Admin" "Line $($lineRes.xtream_username) provisioned via panel (Mode: $($lineRes.mode))"
                    Send-JsonResponse $response 200 $lineRes
                }
                # Admin: List Database Backups
                elseif ($apiRoute -eq "admin/backups" -and $method -eq "GET") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $list = @(Get-DatabaseBackupsList)
                    Send-JsonResponse $response 200 $list
                }
                # Admin: Create Manual Backup
                elseif ($apiRoute -eq "admin/backups/create" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $res = New-DatabaseBackup -manual
                    if ($res.success) {
                        Send-JsonResponse $response 200 $res
                    } else {
                        Send-JsonResponse $response 500 $res
                    }
                }
                # Admin: Download Backup File (.zip)
                elseif ($apiRoute -eq "admin/backups/download" -and $method -eq "GET") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $fileName = [string]$queryParams["file"]
                    if (-not $fileName -or $fileName.Contains("..") -or $fileName.Contains("/") -or $fileName.Contains("\") -or -not $fileName.EndsWith(".zip")) {
                        Send-JsonResponse $response 400 @{ success = $false; message = "Invalid backup file name" }
                        continue
                    }
                    $zipFullPath = Join-Path $script:BackupFolder $fileName
                    if (-not (Test-Path $zipFullPath -PathType Leaf)) {
                        Send-JsonResponse $response 404 @{ success = $false; message = "Backup file not found" }
                        continue
                    }

                    try {
                        $bytes = [System.IO.File]::ReadAllBytes($zipFullPath)
                        $response.StatusCode = 200
                        $response.ContentType = "application/zip"
                        $response.AddHeader("Content-Disposition", "attachment; filename=`"$fileName`"")
                        $response.ContentLength64 = $bytes.Length
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                        $response.OutputStream.Close()
                        $response.Close()
                        continue
                    } catch {
                        Send-JsonResponse $response 500 @{ success = $false; message = "Download error: $($_.Exception.Message)" }
                        continue
                    }
                }
                # Admin: Delete Backup
                elseif ($apiRoute -eq "admin/backups" -and $method -eq "DELETE") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $fileName = [string]$bodyJson.filename
                    if (-not $fileName -or $fileName.Contains("..") -or $fileName.Contains("/") -or $fileName.Contains("\") -or -not $fileName.EndsWith(".zip")) {
                        Send-JsonResponse $response 400 @{ success = $false; message = "Invalid backup file name" }
                        continue
                    }
                    $zipFullPath = Join-Path $script:BackupFolder $fileName
                    if (Test-Path $zipFullPath -PathType Leaf) {
                        Remove-Item $zipFullPath -Force
                        Add-AuditLog "BACKUP_DELETED" "Admin" "Deleted backup file $fileName"
                        Send-JsonResponse $response 200 @{ success = $true }
                    } else {
                        Send-JsonResponse $response 404 @{ success = $false; message = "Backup file not found" }
                    }
                }
                # Admin Change Password
                elseif ($apiRoute -eq "admin/change-password" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $settings = Read-JsonFileSafe "settings.json" @{}
                    $current = $bodyJson.current_password
                    $newPass = $bodyJson.new_password
                    if (Test-PasswordHash $current $settings.admin_password) {
                        $settings.admin_password = Get-PasswordHash $newPass
                        Write-JsonFileSafe "settings.json" $settings
                        Add-AuditLog "PASSWORD_CHANGE" "Admin" "Admin password changed"
                        Send-JsonResponse $response 200 @{ success = $true }
                    } else {
                        Send-JsonResponse $response 400 @{ success = $false; message = "Invalid current password" }
                    }
                }
                # PayPal Client Token Generation
                elseif ($apiRoute -eq "paypal/client-token" -and $method -eq "GET") {
                    $settings = Read-JsonFileSafe "settings.json" @{}
                    $cId = if ($settings.paypal_client_id) { $settings.paypal_client_id.Trim() } else { "sb" }
                    $cSec = if ($settings.paypal_client_secret) { $settings.paypal_client_secret.Trim() } else { "" }
                    $pEnv = if ($settings.paypal_environment) { $settings.paypal_environment } else { "live" }

                    $clientToken = $null
                    if ($cSec -and $cId -ne "sb") {
                        try {
                            $baseApi = if ($pEnv -eq "sandbox") { "https://api-m.sandbox.paypal.com" } else { "https://api-m.paypal.com" }
                            $pair = "${cId}:${cSec}"
                            $bytes = [System.Text.Encoding]::UTF8.GetBytes($pair)
                            $b64 = [Convert]::ToBase64String($bytes)
                            
                            $tokRes = Invoke-RestMethod -Uri "$baseApi/v1/oauth2/token" -Method Post -Headers @{ "Authorization" = "Basic $b64" } -Body "grant_type=client_credentials" -ContentType "application/x-www-form-urlencoded"
                            $accTok = $tokRes.access_token
                            
                            $genRes = Invoke-RestMethod -Uri "$baseApi/v1/identity/generate-token" -Method Post -Headers @{ "Authorization" = "Bearer $accTok"; "Content-Type" = "application/json" }
                            $clientToken = $genRes.client_token
                        } catch {
                            Write-Host "PayPal Token Error: $_"
                        }
                    }

                    Send-JsonResponse $response 200 @{
                        clientId = $cId
                        clientToken = $clientToken
                        environment = $pEnv
                    }
                }
                # Create Customer Web Order
                elseif ($apiRoute -eq "orders" -and $method -eq "POST") {
                    $orders = [System.Collections.ArrayList]@(Read-JsonFileSafe "orders.json" @())
                    $newId = "LUNA-" + (Get-Date).ToString("yyyyMMdd") + "-" + (New-SecureId "" 5)
                    $uName = "luna_" + (New-SecurePassword 8)
                    $uPass = New-SecurePassword 12
                    $m3u = Get-M3UUrl $uName $uPass
                    
                    $amt = 0.0
                    if ($bodyJson.total_amount) { [double]::TryParse([string]$bodyJson.total_amount, [ref]$amt) | Out-Null }
                    elseif ($bodyJson.amount) { [double]::TryParse([string]$bodyJson.amount, [ref]$amt) | Out-Null }
                    elseif ($bodyJson.plan -and $bodyJson.plan.amount) { [double]::TryParse([string]$bodyJson.plan.amount, [ref]$amt) | Out-Null }
                    else { $amt = 65.00 }

                    $planId = if ($bodyJson.plan_id) { $bodyJson.plan_id } elseif ($bodyJson.plan -and $bodyJson.plan.id) { $bodyJson.plan.id } else { "12m" }
                    $devCount = if ($bodyJson.devices_count) { [int]$bodyJson.devices_count } elseif ($bodyJson.plan -and $bodyJson.plan.devices) { [int]$bodyJson.plan.devices } else { 1 }
                    $currency = if ($bodyJson.currency) { $bodyJson.currency.ToUpper() } elseif ($bodyJson.plan -and $bodyJson.plan.currency) { $bodyJson.plan.currency.ToUpper() } else { "GBP" }
                    
                    $validPrice = Get-ValidatedPrice $planId $devCount $currency
                    if (-not $validPrice) { $validPrice = 65.00 }

                    $couponCode = if ($bodyJson.coupon_code) { $bodyJson.coupon_code.ToString().Trim().ToUpper() } else { "" }
                    $discountAmt = 0.0
                    $validCoup = $null
                    if ($couponCode) {
                        $coupons = @(Read-JsonFileSafe "coupons.json" @())
                        foreach ($c in $coupons) {
                            if ($c.code -and $c.code.ToString().Trim().ToUpper() -eq $couponCode -and [bool]$c.active) {
                                $now = (Get-Date).ToString("yyyy-MM-dd")
                                if ((-not $c.valid_from -or $c.valid_from.CompareTo($now) -le 0) -and (-not $c.valid_until -or $c.valid_until.CompareTo($now) -ge 0)) {
                                    if ($c.usage_limit -le 0 -or $c.times_used -lt $c.usage_limit) {
                                        if (-not $c.allowed_plans -or $c.allowed_plans.Count -eq 0 -or $c.allowed_plans -contains $planId) {
                                            if ($validPrice -ge $c.min_order_amount) {
                                                $validCoup = $c
                                                break
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if ($validCoup) {
                            if ($validCoup.discount_type -eq 'percentage') {
                                $discountAmt = [Math]::Round($validPrice * ([double]$validCoup.discount_value / 100.0), 2)
                            } else {
                                $discountAmt = [double]$validCoup.discount_value
                            }
                            if ($discountAmt -gt $validPrice) { $discountAmt = $validPrice }
                        }
                    }

                    $expectedFinalPrice = [Math]::Round([Math]::Max(0.0, $validPrice - $discountAmt), 2)
                    
                    # Verify submitted price matches expected final price or base price
                    $matchesFinal = [Math]::Abs($amt - $expectedFinalPrice) -le 0.05
                    $matchesBase = [Math]::Abs($amt - $validPrice) -le 0.05
                    if (-not $matchesFinal -and -not $matchesBase) {
                        Send-JsonResponse $response 400 @{ success = $false; message = 'Price mismatch. Please refresh and try again.' }
                        continue
                    }

                    # Enforce final price
                    $amt = $expectedFinalPrice
                    if ($validCoup) {
                        $validCoup.times_used++
                        Write-JsonFileSafe "coupons.json" $coupons
                    }

                    $cfgDur = Get-PlanDurationMonths $planId
                    $reqDur = if ($bodyJson.duration_months) { [int]$bodyJson.duration_months } else { $cfgDur }
                    $orderDuration = if ($reqDur -lt $cfgDur) { $cfgDur } else { $reqDur }

                    $newOrder = @{
                        id = $newId
                        customer_name = if ($bodyJson.customer_name) { $bodyJson.customer_name } else { "Subscriber" }
                        customer_email = if ($bodyJson.customer_email) { $bodyJson.customer_email } else { "" }
                        customer_phone = if ($bodyJson.customer_phone) { $bodyJson.customer_phone } else { "" }
                        plan_id = $planId
                        plan_title = if ($bodyJson.plan_title) { $bodyJson.plan_title } else { "12 Months Ultimate Pass" }
                        duration_months = $orderDuration
                        devices_count = $devCount
                        currency = $currency
                        total_amount = $amt
                        coupon_code = if ($discountAmt -gt 0) { $couponCode } else { "" }
                        payment_method = if ($bodyJson.payment_method) { $bodyJson.payment_method } else { "Web Order Request" }
                        payment_status = "PENDING"
                        status = "Pending"
                        adult_included = if ($null -ne $bodyJson.adult_included) { [bool]$bodyJson.adult_included } else { $false }
                        server_region = if ($bodyJson.server_region) { $bodyJson.server_region } else { "Global Dynamic CDN" }
                        device_type = if ($bodyJson.device_type) { $bodyJson.device_type } else { "Amazon FireStick 4K" }
                        xtream_username = $uName
                        xtream_password = $uPass
                        m3u_url = $m3u
                        created_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                        updated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                    }
                    $orders.Insert(0, $newOrder)
                    Write-JsonFileSafe "orders.json" $orders

                    # Look up or create customer
                    $customers = [System.Collections.ArrayList]@(Read-JsonFileSafe "customers.json" @())
                    $targetCustomer = $null
                    $email = $newOrder.customer_email
                    if ($email) {
                        foreach ($c in $customers) {
                            if ($c.email -eq $email) { $targetCustomer = $c; break }
                        }
                    }
                    if (-not $targetCustomer -and $email) {
                        $targetCustomer = @{
                            id = 'CUS-' + (New-SecureId '' 8)
                            email = $email
                            name = $newOrder.customer_name
                            phone = $newOrder.customer_phone
                            password_hash = ''
                            created_at = $newOrder.created_at
                            tags = @()
                            lifetime_value = 0.0
                            notes = ''
                            status = 'active'
                        }
                        $customers.Insert(0, $targetCustomer)
                        Write-JsonFileSafe "customers.json" $customers
                    }

                    # Create payment record
                    if ($targetCustomer) {
                        $payments = [System.Collections.ArrayList]@(Read-JsonFileSafe "payments.json" @())
                        $newPay = @{
                            id = 'PAY-' + (Get-Date).ToString('yyyyMMdd') + '-' + (New-SecureId '' 5)
                            order_id = $newOrder.id
                            customer_id = $targetCustomer.id
                            provider = if ($newOrder.payment_method) { $newOrder.payment_method } else { 'paypal_me' }
                            provider_transaction_id = ''
                            amount = $amt
                            currency = $currency
                            status = 'PENDING'
                            created_at = $newOrder.created_at
                            confirmed_at = ''
                            failure_reason = ''
                            refund_status = 'NONE'
                        }
                        $payments.Insert(0, $newPay)
                        Write-JsonFileSafe "payments.json" $payments
                    }

                    Add-AuditLog "CREATE_ORDER" "System" "Web order $($newOrder.id) created"

                    # Trigger Automated Order Received Email
                    if ($newOrder.customer_email) {
                        Send-EmailNotification "ORDER_RECEIVED" $newOrder.customer_email @{
                            customer_name = $newOrder.customer_name
                            order_id = $newOrder.id
                            plan_title = $newOrder.plan_title
                            devices_count = $newOrder.devices_count
                            total_amount = $newOrder.total_amount
                            currency = $newOrder.currency
                        } | Out-Null
                    }

                    Send-JsonResponse $response 201 @{
                        success = $true
                        order = $newOrder
                    }
                }
                # Create PayPal Order (Server-Side REST v2)
                elseif ($apiRoute -eq "orders/create-paypal-order" -and $method -eq "POST") {
                    $settings = Read-JsonFileSafe "settings.json" @{}
                    $cId = if ($settings.paypal_client_id) { $settings.paypal_client_id.Trim() } else { "sb" }
                    $cSec = if ($settings.paypal_client_secret) { $settings.paypal_client_secret.Trim() } else { "" }
                    $pEnv = if ($settings.paypal_environment) { $settings.paypal_environment } else { "live" }

                    $draftPlanId = if ($bodyJson.plan_id) { $bodyJson.plan_id } else { "12m" }
                    $draftDevCount = if ($bodyJson.devices_count) { [int]$bodyJson.devices_count } else { 1 }
                    $curr = if ($bodyJson.currency) { $bodyJson.currency.ToUpper() } else { "GBP" }
                    
                    $validPrice = Get-ValidatedPrice $draftPlanId $draftDevCount $curr
                    if (-not $validPrice) { $validPrice = 65.00 }

                    $couponCode = if ($bodyJson.coupon_code) { $bodyJson.coupon_code.ToString().Trim().ToUpper() } else { "" }
                    $discountAmt = 0.0
                    $validCoup = $null
                    if ($couponCode) {
                        $coupons = @(Read-JsonFileSafe "coupons.json" @())
                        foreach ($c in $coupons) {
                            if ($c.code -and $c.code.ToString().Trim().ToUpper() -eq $couponCode -and [bool]$c.active) {
                                $now = (Get-Date).ToString("yyyy-MM-dd")
                                if ((-not $c.valid_from -or $c.valid_from.CompareTo($now) -le 0) -and (-not $c.valid_until -or $c.valid_until.CompareTo($now) -ge 0)) {
                                    if ($c.usage_limit -le 0 -or $c.times_used -lt $c.usage_limit) {
                                        if (-not $c.allowed_plans -or $c.allowed_plans.Count -eq 0 -or $c.allowed_plans -contains $draftPlanId) {
                                            if ($validPrice -ge $c.min_order_amount) {
                                                $validCoup = $c
                                                break
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if ($validCoup) {
                            if ($validCoup.discount_type -eq 'percentage') {
                                $discountAmt = [Math]::Round($validPrice * ([double]$validCoup.discount_value / 100.0), 2)
                            } else {
                                $discountAmt = [double]$validCoup.discount_value
                            }
                            if ($discountAmt -gt $validPrice) { $discountAmt = $validPrice }
                        }
                    }

                    $amt = [Math]::Round([Math]::Max(0.0, $validPrice - $discountAmt), 2)
                    $amtStr = $amt.ToString("F2", [System.Globalization.CultureInfo]::InvariantCulture)

                    $ppOrderId = ""
                    if ($cSec -and $cId -ne "sb") {
                        try {
                            $baseApi = if ($pEnv -eq "sandbox") { "https://api-m.sandbox.paypal.com" } else { "https://api-m.paypal.com" }
                            $pair = "${cId}:${cSec}"
                            $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($pair))
                            $tokRes = Invoke-RestMethod -Uri "$baseApi/v1/oauth2/token" -Method Post -Headers @{ "Authorization" = "Basic $b64" } -Body "grant_type=client_credentials" -ContentType "application/x-www-form-urlencoded"
                            $accTok = $tokRes.access_token

                            $orderBody = @{
                                intent = "CAPTURE"
                                purchase_units = @(
                                    @{
                                        reference_id = "LUNA-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                                        description = "$($bodyJson.plan_title) - Luna Stream IPTV"
                                        amount = @{
                                            currency_code = $curr
                                            value = $amtStr
                                        }
                                    }
                                )
                            } | ConvertTo-Json -Depth 5

                            $orderRes = Invoke-RestMethod -Uri "$baseApi/v2/checkout/orders" -Method Post -Headers @{
                                "Authorization" = "Bearer $accTok"
                                "Content-Type" = "application/json"
                                "PayPal-Request-Id" = ([System.Guid]::NewGuid().ToString())
                            } -Body $orderBody
                            $ppOrderId = $orderRes.id
                        } catch {
                            Write-Host "PayPal Create Order API Error: $_"
                        }
                    }

                    if (-not $ppOrderId) {
                        $ppOrderId = "ORD-PP-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + "-" + (Get-Random -Minimum 100 -Maximum 999)
                    }

                    $orders = [System.Collections.ArrayList]@(Read-JsonFileSafe "orders.json" @())
                    $localId = "LUNA-" + (Get-Date).ToString("yyyyMMdd") + "-" + (New-SecureId "" 5)
                    $draftPlanId = if ($bodyJson.plan_id) { $bodyJson.plan_id } else { "12m" }
                    $cfgDur = Get-PlanDurationMonths $draftPlanId
                    $reqDur = if ($bodyJson.duration_months) { [int]$bodyJson.duration_months } else { $cfgDur }
                    $orderDuration = if ($reqDur -lt $cfgDur) { $cfgDur } else { $reqDur }

                    $draftOrder = @{
                        id = $localId
                        paypal_order_id = $ppOrderId
                        customer_name = if ($bodyJson.customer_name) { $bodyJson.customer_name } else { "Customer" }
                        customer_email = if ($bodyJson.customer_email) { $bodyJson.customer_email } else { "" }
                        customer_phone = if ($bodyJson.customer_phone) { $bodyJson.customer_phone } else { "" }
                        plan_id = $draftPlanId
                        plan_title = if ($bodyJson.plan_title) { $bodyJson.plan_title } else { "12 Months Ultimate Pass" }
                        duration_months = $orderDuration
                        devices_count = if ($bodyJson.devices_count) { [int]$bodyJson.devices_count } else { 1 }
                        currency = $curr
                        total_amount = $amt
                        coupon_code = if ($validCoup) { $validCoup.code } else { "" }
                        payment_method = "PayPal / Card"
                        payment_status = "CREATED"
                        adult_included = if ($null -ne $bodyJson.adult_included) { [bool]$bodyJson.adult_included } else { $false }
                        server_region = if ($bodyJson.server_region) { $bodyJson.server_region } else { "Global Dynamic CDN" }
                        device_type = if ($bodyJson.device_type) { $bodyJson.device_type } else { "Amazon FireStick 4K" }
                        status = "Pending"
                        created_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                        updated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                    }
                    $orders.Insert(0, $draftOrder)
                    Write-JsonFileSafe "orders.json" $orders

                    Send-JsonResponse $response 200 @{
                        success = $true
                        orderID = $ppOrderId
                        localOrderId = $localId
                    }
                }
                # Capture PayPal Order (Server-Side REST v2)
                elseif ($apiRoute -match "^orders/(.+)/capture$" -and $method -eq "POST") {
                    $targetOrderId = $Matches[1]
                    $settings = Read-JsonFileSafe "settings.json" @{}
                    $cId = if ($settings.paypal_client_id) { $settings.paypal_client_id.Trim() } else { "sb" }
                    $cSec = if ($settings.paypal_client_secret) { $settings.paypal_client_secret.Trim() } else { "" }
                    $pEnv = if ($settings.paypal_environment) { $settings.paypal_environment } else { "live" }

                    $isCompleted = $false
                    $captureId = ""

                    if ($cSec -and $cId -ne "sb" -and -not $targetOrderId.StartsWith("ORD-PP-")) {
                        try {
                            $baseApi = if ($pEnv -eq "sandbox") { "https://api-m.sandbox.paypal.com" } else { "https://api-m.paypal.com" }
                            $pair = "${cId}:${cSec}"
                            $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($pair))
                            $tokRes = Invoke-RestMethod -Uri "$baseApi/v1/oauth2/token" -Method Post -Headers @{ "Authorization" = "Basic $b64" } -Body "grant_type=client_credentials" -ContentType "application/x-www-form-urlencoded"
                            $accTok = $tokRes.access_token

                            $capRes = Invoke-RestMethod -Uri "$baseApi/v2/checkout/orders/$targetOrderId/capture" -Method Post -Headers @{ "Authorization" = "Bearer $accTok"; "Content-Type" = "application/json" }
                            if ($capRes.status -eq "COMPLETED") {
                                $isCompleted = $true
                                if ($capRes.purchase_units -and $capRes.purchase_units[0].payments.captures) {
                                    $captureId = $capRes.purchase_units[0].payments.captures[0].id
                                }
                            }
                        } catch {
                            Write-Host "PayPal Capture API Error: $_"
                        }
                    }

                    if ($isCompleted) {
                        $orders = [System.Collections.ArrayList]@(Read-JsonFileSafe "orders.json" @())
                        $updatedOrder = $null
                        for ($i = 0; $i -lt $orders.Count; $i++) {
                            if ($orders[$i].paypal_order_id -eq $targetOrderId -or $orders[$i].id -eq $targetOrderId) {
                                $orders[$i] | Add-Member -NotePropertyName "status" -NotePropertyValue "Active" -Force
                                $orders[$i] | Add-Member -NotePropertyName "payment_status" -NotePropertyValue "PAID" -Force
                                $orders[$i] | Add-Member -NotePropertyName "paypal_capture_id" -NotePropertyValue $captureId -Force
                                $orders[$i] | Add-Member -NotePropertyName "paid_at" -NotePropertyValue (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") -Force
                                $orders[$i] | Add-Member -NotePropertyName "updated_at" -NotePropertyValue (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") -Force
                                if (-not $orders[$i].xtream_username) {
                                    $uName = "luna_" + (New-SecurePassword 8)
                                    $uPass = New-SecurePassword 12
                                    $m3u = Get-M3UUrl $uName $uPass
                                    $orders[$i] | Add-Member -NotePropertyName "xtream_username" -NotePropertyValue $uName -Force
                                    $orders[$i] | Add-Member -NotePropertyName "xtream_password" -NotePropertyValue $uPass -Force
                                    $orders[$i] | Add-Member -NotePropertyName "m3u_url" -NotePropertyValue $m3u -Force
                                }
                                $updatedOrder = $orders[$i]
                                break
                            }
                        }
                        Write-JsonFileSafe "orders.json" $orders

                        Send-JsonResponse $response 200 @{
                            success = $true
                            status = "COMPLETED"
                            captureID = $captureId
                            order = $updatedOrder
                        }
                    } else {
                        Send-JsonResponse $response 400 @{
                            success = $false
                            status = "FAILED"
                            message = "PayPal capture failed"
                        }
                    }
                }
                # Confirm Direct PayPal Order (Return from PayPal tab)
                elseif ($apiRoute -eq "orders/confirm-direct" -and $method -eq "POST") {
                    $orders = [System.Collections.ArrayList]@(Read-JsonFileSafe "orders.json" @())
                    $tOrdId = $bodyJson.orderID
                    $tEmail = $bodyJson.email
                    $targetOrder = $null
                    $capId = "CAP-DIR-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

                    for ($i = 0; $i -lt $orders.Count; $i++) {
                        if (($tOrdId -and ($orders[$i].id -eq $tOrdId -or $orders[$i].paypal_order_id -eq $tOrdId)) -or ($tEmail -and $orders[$i].customer_email -eq $tEmail)) {
                            $orders[$i] | Add-Member -NotePropertyName "payment_status" -NotePropertyValue "PENDING_VERIFICATION" -Force
                            $orders[$i] | Add-Member -NotePropertyName "paypal_capture_id" -NotePropertyValue $capId -Force
                            $orders[$i] | Add-Member -NotePropertyName "updated_at" -NotePropertyValue (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ") -Force
                            if (-not $orders[$i].xtream_username) {
                                $uName = "luna_" + (New-SecurePassword 8)
                                $uPass = New-SecurePassword 12
                                $m3u = Get-M3UUrl $uName $uPass
                                $orders[$i] | Add-Member -NotePropertyName "xtream_username" -NotePropertyValue $uName -Force
                                $orders[$i] | Add-Member -NotePropertyName "xtream_password" -NotePropertyValue $uPass -Force
                                $orders[$i] | Add-Member -NotePropertyName "m3u_url" -NotePropertyValue $m3u -Force
                            }
                            $targetOrder = $orders[$i]
                            break
                        }
                    }

                    if (-not $targetOrder) {
                        Send-JsonResponse $response 404 @{
                            success = $false
                            message = "Order not found"
                        }
                        continue
                    }

                    Write-JsonFileSafe "orders.json" $orders
                    Send-JsonResponse $response 200 @{
                        success = $true
                        status = "PENDING_VERIFICATION"
                        order = $targetOrder
                    }
                }
                # Check Order Payment Status
                elseif ($apiRoute -eq "orders/check-status" -and $method -eq "GET") {
                    $orders = [System.Collections.ArrayList]@(Read-JsonFileSafe "orders.json" @())
                    $qOrdId = if ($queryParams -and $queryParams["orderID"]) { $queryParams["orderID"] } else { "" }
                    $qEmail = if ($queryParams -and $queryParams["email"]) { $queryParams["email"] } else { "" }
                    $found = $null

                    foreach ($o in $orders) {
                        if (($qOrdId -and ($o.id -eq $qOrdId -or $o.paypal_order_id -eq $qOrdId)) -or ($qEmail -and $o.customer_email -eq $qEmail)) {
                            $found = $o
                            break
                        }
                    }

                    if ($found -and ($found.payment_status -eq "PAID" -or $found.status -eq "Active")) {
                        Send-JsonResponse $response 200 @{
                            paid = $true
                            status = "PAID"
                            plan_title = $found.plan_title
                            order_id = $found.id
                            order = $found
                        }
                    } else {
                        Send-JsonResponse $response 200 @{ paid = $false; status = "PENDING" }
                    }
                }
                # Public Trial Submission
                elseif ($apiRoute -eq "trials" -and $method -eq "POST") {
                    $trials = [System.Collections.ArrayList]@(Read-JsonFileSafe "trials.json" @())
                    $newId = New-SecureId "TRL-" 5
                    $newTrial = @{
                        id = $newId
                        customer_name = if ($bodyJson.customer_name) { $bodyJson.customer_name } elseif ($bodyJson.name) { $bodyJson.name } else { "Free Trial Applicant" }
                        email = if ($bodyJson.email) { $bodyJson.email } else { "" }
                        device_type = if ($bodyJson.device_type) { $bodyJson.device_type } else { "Smart TV" }
                        country = if ($bodyJson.country) { $bodyJson.country } else { "Global" }
                        message = if ($bodyJson.message) { $bodyJson.message } else { "" }
                        status = "Pending"
                        test_line_credentials = ""
                        created_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                    }
                    $trials.Insert(0, $newTrial)
                    Write-JsonFileSafe "trials.json" $trials
                    Send-JsonResponse $response 201 @{ success = $true; trial_id = $newId }
                }
                # Real-Time Visitor & Live Page Navigation Tracking
                elseif ($apiRoute -eq "track/visit" -and $method -eq "POST") {
                    $sessId = if ($bodyJson.session_id) { [string]$bodyJson.session_id } else { "sess_anon" }
                    $visId = if ($bodyJson.visitor_id) { [string]$bodyJson.visitor_id } else { $sessId }
                    $rawPage = if ($bodyJson.page_path) { [string]$bodyJson.page_path } else { "/" }
                    $pageTitle = if ($bodyJson.page_title) { [string]$bodyJson.page_title } else { "" }
                    $deviceType = if ($bodyJson.device_type) { [string]$bodyJson.device_type } else { "Desktop" }
                    $referrer = if ($bodyJson.referrer) { [string]$bodyJson.referrer } else { "Direct" }
                    $clientIp = if ($request.RemoteEndPoint) { $request.RemoteEndPoint.Address.ToString() } else { "127.0.0.1" }
                    $isHeartbeat = [bool]$bodyJson.is_heartbeat
                    $nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                    $nowEpoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

                    # Track active session in memory
                    $isNewSession = -not $script:ActiveVisitors.ContainsKey($sessId)
                    $pageChanged = $false

                    if ($isNewSession) {
                        $history = [System.Collections.ArrayList]@()
                        $history.Add(@{
                            page = $rawPage
                            title = $pageTitle
                            time = $nowIso
                        })
                        $script:ActiveVisitors[$sessId] = @{
                            session_id = $sessId
                            visitor_id = $visId
                            current_page = $rawPage
                            page_title = $pageTitle
                            device_type = $deviceType
                            ip = $clientIp
                            referrer = $referrer
                            first_seen = $nowIso
                            last_seen = $nowIso
                            last_seen_epoch = $nowEpoch
                            history = $history
                        }
                    } else {
                        $rec = $script:ActiveVisitors[$sessId]
                        if ($rec.current_page -ne $rawPage) {
                            $pageChanged = $true
                            $rec.history.Add(@{
                                page = $rawPage
                                title = $pageTitle
                                time = $nowIso
                            })
                            $rec.current_page = $rawPage
                            $rec.page_title = $pageTitle
                        }
                        $rec.last_seen = $nowIso
                        $rec.last_seen_epoch = $nowEpoch
                    }

                    # Log to visitors.json on initial page visits and page hops (avoid duplicate heartbeats)
                    if (-not $isHeartbeat -or $isNewSession -or $pageChanged) {
                        $visitors = [System.Collections.ArrayList]@(Read-JsonFileSafe "visitors.json" @())
                        $newVis = @{
                            id = New-SecureId "VIS-" 5
                            session_id = $sessId
                            visitor_id = $visId
                            page = $rawPage
                            page_path = $rawPage
                            page_title = $pageTitle
                            referrer = $referrer
                            user_agent = if ($bodyJson.user_agent) { [string]$bodyJson.user_agent } else { "" }
                            device = $deviceType
                            device_type = $deviceType
                            ip = $clientIp
                            is_new_session = $isNewSession
                            is_page_change = $pageChanged
                            timestamp = $nowIso
                        }
                        $visitors.Insert(0, $newVis)
                        if ($visitors.Count -gt 500) {
                            $visitors.RemoveRange(500, ($visitors.Count - 500))
                        }
                        Write-JsonFileSafe "visitors.json" $visitors
                    }

                    Send-JsonResponse $response 200 @{
                        status = "tracked"
                        is_new = $isNewSession
                        page_changed = $pageChanged
                        current_page = $rawPage
                    }
                }
                # Intent Tracking
                elseif ($apiRoute -eq "track/intent" -and $method -eq "POST") {
                    $leads = [System.Collections.ArrayList]@(Read-JsonFileSafe "leads.json" @())
                    $newLead = @{
                        id = New-SecureId "LEAD-" 5
                        session_id = if ($bodyJson.session_id) { $bodyJson.session_id } else { "sess_anon" }
                        customer_name = if ($bodyJson.customer_name) { $bodyJson.customer_name } else { "Visitor Lead" }
                        customer_email = if ($bodyJson.customer_email) { $bodyJson.customer_email } else { "" }
                        selected_plan = if ($bodyJson.selected_plan) { $bodyJson.selected_plan } else { "12 Months Ultimate" }
                        devices = if ($bodyJson.devices) { [int]$bodyJson.devices } else { 1 }
                        currency = if ($bodyJson.currency) { $bodyJson.currency } else { "USD" }
                        lead_source = if ($bodyJson.lead_source) { $bodyJson.lead_source } else { "WhatsApp_Button_Click" }
                        created_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                    }
                    $leads.Insert(0, $newLead)
                    Write-JsonFileSafe "leads.json" $leads
                    Send-JsonResponse $response 200 @{ status = "lead_captured"; id = $newLead.id }
                }
                # Customer Lookup
                elseif ($apiRoute -eq "customer/lookup" -and $method -eq "POST") {
                    $orders = @(Read-JsonFileSafe "orders.json" @())
                    $q = if ($bodyJson.query) { [string]$bodyJson.query.Trim().ToLower() } else { "" }
                    $found = $null
                    if ($q) {
                        foreach ($o in $orders) {
                            $eMatch = $o.customer_email -and ($o.customer_email.ToLower() -eq $q)
                            $uMatch = $o.xtream_username -and ($o.xtream_username.ToLower() -eq $q)
                            $iMatch = $o.id -and ($o.id.ToLower() -eq $q)
                            if ($eMatch -or $uMatch -or $iMatch) {
                                $found = $o
                                break
                            }
                        }
                    }
                    if ($found) {
                        $safeOrder = @{
                            id = $found.id
                            customer_name = $found.customer_name
                            customer_email = $found.customer_email
                            plan_title = $found.plan_title
                            duration_months = $found.duration_months
                            devices_count = $found.devices_count
                            status = $found.status
                            xtream_username = $found.xtream_username
                            xtream_password = if ($found.xtream_password -and $found.xtream_password.Length -ge 2) { $found.xtream_password.Substring(0, 2) + "****" } else { "****" }
                            m3u_url = $found.m3u_url
                            created_at = $found.created_at
                            server_region = $found.server_region
                            device_type = $found.device_type
                        }
                        Send-JsonResponse $response 200 @{ success = $true; order = $safeOrder }
                    } else {
                        Send-JsonResponse $response 404 @{ success = $false; message = "No subscription line found." }
                    }
                }
                # Public Announcement
                elseif ($apiRoute -eq "announcement" -and $method -eq "GET") {
                    $settings = Read-JsonFileSafe "settings.json" @{}
                    $disc = if ($null -ne $settings.announcement_discount_percent) { [int]$settings.announcement_discount_percent } else { 20 }
                    $promo = if ($settings.announcement_promo_code) { [string]$settings.announcement_promo_code.Trim().ToUpper() } else { "LUNA20" }
                    
                    # Verify coupon status in coupons.json
                    $coupons = @(Read-JsonFileSafe "coupons.json" @())
                    $matchingCoup = $null
                    foreach ($c in $coupons) {
                        if ($c.code -and $c.code.ToString().Trim().ToUpper() -eq $promo) {
                            $matchingCoup = $c
                            break
                        }
                    }

                    $isCoupActive = $true
                    if ($matchingCoup) {
                        $isCoupActive = [bool]$matchingCoup.active
                        $now = (Get-Date).ToString("yyyy-MM-dd")
                        if ($matchingCoup.valid_from -and $matchingCoup.valid_from.CompareTo($now) -gt 0) { $isCoupActive = $false }
                        if ($matchingCoup.valid_until -and $matchingCoup.valid_until.CompareTo($now) -lt 0) { $isCoupActive = $false }
                        if ($matchingCoup.usage_limit -gt 0 -and $matchingCoup.times_used -ge $matchingCoup.usage_limit) { $isCoupActive = $false }
                        if ($matchingCoup.discount_value) { $disc = [int]$matchingCoup.discount_value }
                    } elseif ($promo) {
                        $isCoupActive = $false
                    }

                    $bannerEnabled = if ($null -ne $settings.announcement_enabled) { [bool]$settings.announcement_enabled } else { $false }
                    $trulyEnabled = $bannerEnabled -and $isCoupActive

                    $linkText = "Claim $disc% OFF →"
                    $linkUrl = "checkout.html?plan=12m&promo=$promo&discount=$disc"
                    $ann = @{
                        success = $true
                        enabled = $trulyEnabled
                        coupon_active = $isCoupActive
                        badge = if ($settings.announcement_badge) { $settings.announcement_badge } else { "PROMO" }
                        text = if ($settings.announcement_text) { $settings.announcement_text } else { "" }
                        discount_percent = $disc
                        promo_code = $promo
                        target_plan = if ($settings.announcement_target_plan) { $settings.announcement_target_plan } else { "12m" }
                        link_text = $linkText
                        link_url = $linkUrl
                    }
                    Send-JsonResponse $response 200 $ann
                }
                # PayPal Webhook
                elseif ($apiRoute -eq "paypal/webhook" -and $method -eq "POST") {
                    # TODO: Add PayPal webhook signature verification
                    Send-JsonResponse $response 200 @{ status = "received" }
                }
                # Admin Customers CRUD
                elseif ($apiRoute -eq "admin/customers") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $customers = [System.Collections.ArrayList]@(Read-JsonFileSafe "customers.json" @())
                    if ($method -eq "GET") {
                        Send-JsonResponse $response 200 $customers
                    } elseif ($method -eq "POST") {
                        $newId = "CUS-" + (New-SecureId "" 8)
                        $newCust = @{
                            id = $newId
                            name = if ($bodyJson.name) { $bodyJson.name } else { "Unknown" }
                            email = if ($bodyJson.email) { $bodyJson.email } else { "" }
                            phone = if ($bodyJson.phone) { $bodyJson.phone } else { "" }
                            password_hash = ''
                            created_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                            tags = if ($bodyJson.tags) { $bodyJson.tags } else { @() }
                            lifetime_value = 0.0
                            notes = if ($bodyJson.notes) { $bodyJson.notes } else { "" }
                            status = "active"
                        }
                        $customers.Insert(0, $newCust)
                        Write-JsonFileSafe "customers.json" $customers
                        Add-AuditLog "CREATE_CUSTOMER" "Admin" "Created customer $newId"
                        Send-JsonResponse $response 201 $newCust
                    } elseif ($method -eq "PATCH") {
                        $targetId = $bodyJson.id
                        $updated = $null
                        for ($i = 0; $i -lt $customers.Count; $i++) {
                            if ($customers[$i].id -eq $targetId) {
                                if ($null -ne $bodyJson.name) { $customers[$i].name = $bodyJson.name }
                                if ($null -ne $bodyJson.phone) { $customers[$i].phone = $bodyJson.phone }
                                if ($null -ne $bodyJson.tags) { $customers[$i].tags = $bodyJson.tags }
                                if ($null -ne $bodyJson.notes) { $customers[$i].notes = $bodyJson.notes }
                                if ($null -ne $bodyJson.status) { $customers[$i].status = $bodyJson.status }
                                $updated = $customers[$i]
                                break
                            }
                        }
                        Write-JsonFileSafe "customers.json" $customers
                        Add-AuditLog "UPDATE_CUSTOMER" "Admin" "Updated customer $targetId"
                        Send-JsonResponse $response 200 @{ success = $true; customer = $updated }
                    }
                }
                # Admin Subscriptions CRUD
                elseif ($apiRoute -eq "admin/subscriptions") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $subscriptions = [System.Collections.ArrayList]@(Read-JsonFileSafe "subscriptions.json" @())
                    if ($method -eq "GET") {
                        Invoke-ExpiryCheck -force
                        $subscriptions = [System.Collections.ArrayList]@(Read-JsonFileSafe "subscriptions.json" @())
                        Send-JsonResponse $response 200 $subscriptions
                    } elseif ($method -eq "POST") {
                        $newId = "SUB-" + (Get-Date).ToString("yyyy") + "-" + (New-SecureId "" 5)
                        $uName = if ($bodyJson.xtream_username) { $bodyJson.xtream_username } else { "luna_" + (New-SecureId "" 8) }
                        $uPass = if ($bodyJson.xtream_password) { $bodyJson.xtream_password } else { New-SecurePassword 12 }
                        $m3u = Get-M3UUrl $uName $uPass
                        $newSub = @{
                            id = $newId
                            customer_id = $bodyJson.customer_id
                            order_id = $bodyJson.order_id
                            plan_id = $bodyJson.plan_id
                            plan_title = $bodyJson.plan_title
                            devices_count = $bodyJson.devices_count
                            status = 'ACTIVE'
                            start_date = $bodyJson.start_date
                            end_date = $bodyJson.end_date
                            xtream_username = $uName
                            xtream_password = $uPass
                            m3u_url = $m3u
                            created_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                            updated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                        }
                        $subscriptions.Insert(0, $newSub)
                        Write-JsonFileSafe "subscriptions.json" $subscriptions
                        Add-AuditLog "CREATE_SUBSCRIPTION" "Admin" "Created subscription $newId"
                        Send-JsonResponse $response 201 $newSub
                    } elseif ($method -eq "PATCH") {
                        $targetId = $bodyJson.id
                        $updated = $null
                        for ($i = 0; $i -lt $subscriptions.Count; $i++) {
                            if ($subscriptions[$i].id -eq $targetId) {
                                if ($null -ne $bodyJson.status) { $subscriptions[$i].status = $bodyJson.status }
                                if ($null -ne $bodyJson.end_date) { $subscriptions[$i].end_date = $bodyJson.end_date }
                                if ($null -ne $bodyJson.xtream_username) { $subscriptions[$i].xtream_username = $bodyJson.xtream_username }
                                if ($null -ne $bodyJson.xtream_password) { $subscriptions[$i].xtream_password = $bodyJson.xtream_password }
                                if ($null -ne $bodyJson.m3u_url) { $subscriptions[$i].m3u_url = $bodyJson.m3u_url }
                                $subscriptions[$i].updated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                                $updated = $subscriptions[$i]
                                break
                            }
                        }
                        Write-JsonFileSafe "subscriptions.json" $subscriptions
                        Add-AuditLog "UPDATE_SUBSCRIPTION" "Admin" "Updated subscription $targetId"
                        Send-JsonResponse $response 200 @{ success = $true; subscription = $updated }
                    }
                }
                # Admin Payments
                elseif ($apiRoute -eq "admin/payments" -and $method -eq "GET") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $payments = @(Read-JsonFileSafe "payments.json" @())
                    Send-JsonResponse $response 200 $payments
                }
                # Admin Coupons CRUD
                elseif ($apiRoute -eq "admin/coupons") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $coupons = [System.Collections.ArrayList]@(Read-JsonFileSafe "coupons.json" @())
                    if ($method -eq "GET") {
                        Send-JsonResponse $response 200 $coupons
                    } elseif ($method -eq "POST") {
                        $newId = "COUP-" + (New-SecureId "" 5)
                        $newCoup = @{
                            id = $newId
                            code = $bodyJson.code
                            discount_type = $bodyJson.discount_type
                            discount_value = $bodyJson.discount_value
                            valid_from = $bodyJson.valid_from
                            valid_until = $bodyJson.valid_until
                            usage_limit = $bodyJson.usage_limit
                            times_used = 0
                            allowed_plans = $bodyJson.allowed_plans
                            min_order_amount = $bodyJson.min_order_amount
                            active = $true
                        }
                        $coupons.Insert(0, $newCoup)
                        Write-JsonFileSafe "coupons.json" $coupons
                        Add-AuditLog "CREATE_COUPON" "Admin" "Created coupon $newId"
                        Send-JsonResponse $response 201 $newCoup
                    } elseif ($method -eq "PATCH") {
                        $targetId = $bodyJson.id
                        $updated = $null
                        for ($i = 0; $i -lt $coupons.Count; $i++) {
                            if ($coupons[$i].id -eq $targetId) {
                                if ($null -ne $bodyJson.active) { $coupons[$i].active = [bool]$bodyJson.active }
                                if ($null -ne $bodyJson.discount_value) { $coupons[$i].discount_value = [double]$bodyJson.discount_value }
                                if ($null -ne $bodyJson.valid_until) { $coupons[$i].valid_until = $bodyJson.valid_until }
                                if ($null -ne $bodyJson.usage_limit) { $coupons[$i].usage_limit = [int]$bodyJson.usage_limit }
                                if ($null -ne $bodyJson.code) { $coupons[$i].code = $bodyJson.code.ToString().Trim().ToUpper() }
                                $updated = $coupons[$i]
                                break
                            }
                        }
                        Write-JsonFileSafe "coupons.json" $coupons
                        Add-AuditLog "UPDATE_COUPON" "Admin" "Updated coupon $targetId"

                        # Sync with settings.json if this is the banner coupon
                        if ($updated) {
                            $settings = Read-JsonFileSafe "settings.json" @{}
                            $annPromo = if ($settings.announcement_promo_code) { $settings.announcement_promo_code.ToString().Trim().ToUpper() } else { "" }
                            if ($annPromo -and $updated.code -and $annPromo -eq $updated.code.ToString().Trim().ToUpper()) {
                                if ($null -ne $bodyJson.active) {
                                    Set-ObjectProperty $settings 'announcement_enabled' ([bool]$bodyJson.active)
                                }
                                if ($null -ne $bodyJson.discount_value) {
                                    Set-ObjectProperty $settings 'announcement_discount_percent' ([int]$bodyJson.discount_value)
                                    Set-ObjectProperty $settings 'announcement_link_text' "Claim $([int]$bodyJson.discount_value)% OFF →"
                                    Set-ObjectProperty $settings 'announcement_link_url' "checkout.html?plan=12m&promo=$($updated.code)&discount=$([int]$bodyJson.discount_value)"
                                }
                                Write-JsonFileSafe "settings.json" $settings
                            }
                        }
                        Send-JsonResponse $response 200 @{ success = $true; coupon = $updated }
                    } elseif ($method -eq "DELETE") {
                        $targetId = $bodyJson.id
                        $deletedCoup = $null
                        for ($i = 0; $i -lt $coupons.Count; $i++) {
                            if ($coupons[$i].id -eq $targetId) {
                                $deletedCoup = $coupons[$i]
                                break
                            }
                        }
                        $filtered = @($coupons | Where-Object { $_.id -ne $targetId })
                        Write-JsonFileSafe "coupons.json" $filtered
                        Add-AuditLog "DELETE_COUPON" "Admin" "Deleted coupon $targetId"

                        if ($deletedCoup) {
                            $settings = Read-JsonFileSafe "settings.json" @{}
                            $annPromo = if ($settings.announcement_promo_code) { $settings.announcement_promo_code.ToString().Trim().ToUpper() } else { "" }
                            if ($annPromo -and $deletedCoup.code -and $annPromo -eq $deletedCoup.code.ToString().Trim().ToUpper()) {
                                Set-ObjectProperty $settings 'announcement_enabled' $false
                                Write-JsonFileSafe "settings.json" $settings
                            }
                        }
                        Send-JsonResponse $response 200 @{ success = $true }
                    }
                }
                # Public Coupon Validation
                elseif ($apiRoute -eq "coupons/validate" -and $method -eq "POST") {
                    $coupons = @(Read-JsonFileSafe "coupons.json" @())
                    $code = if ($bodyJson.code) { $bodyJson.code.ToString().Trim().ToUpper() } else { "" }
                    $planId = if ($bodyJson.plan_id) { $bodyJson.plan_id.ToString().Trim().ToLower() } else { "" }
                    $amt = 0.0
                    if ($bodyJson.amount) { [double]::TryParse([string]$bodyJson.amount, [ref]$amt) | Out-Null }
                    
                    $validCoup = $null
                    foreach ($c in $coupons) {
                        if ($c.code -and $c.code.ToString().Trim().ToUpper() -eq $code) {
                            $validCoup = $c
                            break
                        }
                    }

                    if (-not $validCoup) { Send-JsonResponse $response 404 @{ valid = $false; message = 'Coupon not found' }; continue }
                    if (-not [bool]$validCoup.active) { Send-JsonResponse $response 400 @{ valid = $false; message = 'Coupon is inactive' }; continue }
                    
                    $now = (Get-Date).ToString("yyyy-MM-dd")
                    if ($validCoup.valid_from -and $validCoup.valid_from.CompareTo($now) -gt 0) { Send-JsonResponse $response 400 @{ valid = $false; message = 'Coupon not yet valid' }; continue }
                    if ($validCoup.valid_until -and $validCoup.valid_until.CompareTo($now) -lt 0) { Send-JsonResponse $response 400 @{ valid = $false; message = 'Coupon expired' }; continue }
                    
                    if ($validCoup.usage_limit -gt 0 -and $validCoup.times_used -ge $validCoup.usage_limit) { Send-JsonResponse $response 400 @{ valid = $false; message = 'Usage limit reached' }; continue }
                    
                    if ($validCoup.allowed_plans -and $validCoup.allowed_plans.Count -gt 0 -and $planId -and $validCoup.allowed_plans -notcontains $planId) { Send-JsonResponse $response 400 @{ valid = $false; message = 'Not valid for this plan' }; continue }
                    
                    if ($amt -gt 0 -and $amt -lt $validCoup.min_order_amount) { Send-JsonResponse $response 400 @{ valid = $false; message = 'Order amount too low' }; continue }

                    $discAmt = 0.0
                    if ($validCoup.discount_type -eq 'percentage') {
                        $discAmt = [Math]::Round($amt * ([double]$validCoup.discount_value / 100.0), 2)
                    } else {
                        $discAmt = [double]$validCoup.discount_value
                    }
                    if ($discAmt -gt $amt) { $discAmt = $amt }
                    
                    Send-JsonResponse $response 200 @{
                        valid = $true
                        discount_type = $validCoup.discount_type
                        discount_value = $validCoup.discount_value
                        discount_amount = $discAmt
                        final_amount = $amt - $discAmt
                        code = $validCoup.code
                    }
                }
                # Admin Audit Log
                elseif ($apiRoute -eq "admin/audit-log" -and $method -eq "GET") {
                    if (-not (Test-AdminAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    $log = @(Read-JsonFileSafe "audit_log.json" @())
                    $lim = 100
                    if ($queryParams -and $queryParams["limit"]) { [int]::TryParse($queryParams["limit"], [ref]$lim) | Out-Null }
                    if ($lim -gt 0 -and $log.Count -gt $lim) { $log = $log | Select-Object -First $lim }
                    Send-JsonResponse $response 200 $log
                }
                # Customer Authentication Endpoints
                elseif ($apiRoute -eq "customer/register" -and $method -eq "POST") {
                    if (-not $bodyObj.email -or -not $bodyObj.password) { Send-JsonResponse $response 400 @{ success = $false; message = "Email and password required" }; continue }
                    $customers = @(Read-JsonFileSafe "customers.json" @())
                    if ($customers | Where-Object { $_.email -eq $bodyObj.email }) { Send-JsonResponse $response 400 @{ success = $false; message = "Email already exists" }; continue }
                    
                    $newCus = @{
                        id = New-SecureId 'CUS-' 8
                        name = $bodyObj.name
                        email = $bodyObj.email
                        phone = $bodyObj.phone
                        password_hash = Get-PasswordHash $bodyObj.password
                        tags = @()
                        lifetime_value = 0
                        created_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                    }
                    $customers += $newCus
                    Write-JsonFileSafe "customers.json" $customers
                    Send-JsonResponse $response 200 @{ success = $true; customer_id = $newCus.id }
                }
                elseif ($apiRoute -eq "customer/login" -and $method -eq "POST") {
                    if (-not $bodyObj.email -or -not $bodyObj.password) { Send-JsonResponse $response 400 @{ success = $false; message = "Email and password required" }; continue }
                    $customers = @(Read-JsonFileSafe "customers.json" @())
                    $cusMatches = @($customers | Where-Object { $_.email -eq $bodyObj.email })
                    if (-not $cusMatches) { Send-JsonResponse $response 401 @{ success = $false; message = "Invalid credentials" }; continue }
                    $cus = $cusMatches[0]
                    if (-not $cus.password_hash) { Send-JsonResponse $response 400 @{ success = $false; message = "Account not activated. Please contact support." }; continue }
                    
                    if (Test-PasswordHash $bodyObj.password $cus.password_hash) {
                        $token = New-SessionToken
                        $script:CustomerSessions[$token] = @{ customer_id = $cus.id; created_at = Get-Date }
                        Send-JsonResponse $response 200 @{ success = $true; token = $token; customer = @{ id = $cus.id; name = $cus.name; email = $cus.email } }
                    } else {
                        Send-JsonResponse $response 401 @{ success = $false; message = "Invalid credentials" }
                    }
                }
                elseif ($apiRoute -eq "customer/forgot-password" -and $method -eq "POST") {
                    if (-not $bodyObj.email) { Send-JsonResponse $response 400 @{ success = $false; message = "Email required" }; continue }
                    $customers = @(Read-JsonFileSafe "customers.json" @())
                    $found = $false
                    foreach ($c in $customers) {
                        if ($c.email -eq $bodyObj.email) {
                            $resetToken = New-SecureId '' 6
                            Set-ObjectProperty $c 'reset_token' $resetToken
                            Set-ObjectProperty $c 'reset_token_expires' ((Get-Date).AddHours(1).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"))
                            $found = $true
                            break
                        }
                    }
                    if ($found) {
                        Write-JsonFileSafe "customers.json" $customers
                        Add-AuditLog "PASSWORD_RESET_REQUESTED" "Customer" "Requested by $($bodyObj.email)"
                        Send-EmailNotification "PASSWORD_RESET" $c.email @{
                            customer_name = $c.name
                            reset_token = $resetToken
                        } | Out-Null
                    }
                    Send-JsonResponse $response 200 @{ success = $true; message = "Password reset initiated. Please check your email for the 6-digit verification code." }
                }
                elseif ($apiRoute -eq "customer/reset-password" -and $method -eq "POST") {
                    if (-not $bodyObj.email -or -not $bodyObj.reset_token -or -not $bodyObj.new_password) { Send-JsonResponse $response 400 @{ success = $false; message = "Missing fields" }; continue }
                    $customers = @(Read-JsonFileSafe "customers.json" @())
                    $found = $false
                    foreach ($c in $customers) {
                        if ($c.email -eq $bodyObj.email -and $c.reset_token -eq $bodyObj.reset_token) {
                            if ($c.reset_token_expires -and [datetime]::Parse($c.reset_token_expires) -gt (Get-Date).ToUniversalTime()) {
                                $c.password_hash = Get-PasswordHash $bodyObj.new_password
                                $c.PSObject.Properties.Remove('reset_token')
                                $c.PSObject.Properties.Remove('reset_token_expires')
                                $found = $true
                                break
                            }
                        }
                    }
                    if ($found) {
                        Write-JsonFileSafe "customers.json" $customers
                        Add-AuditLog "PASSWORD_RESET_COMPLETED" "Customer" "Completed by $($bodyObj.email)"
                        Send-JsonResponse $response 200 @{ success = $true }
                    } else {
                        Send-JsonResponse $response 400 @{ success = $false; message = "Invalid or expired reset token" }
                    }
                }
                elseif ($apiRoute -eq "customer/dashboard" -and $method -eq "GET") {
                    if (-not (Test-CustomerAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    
                    $authHeader = $request.Headers["Authorization"]
                    $token = $authHeader.Substring(7).Trim()
                    $customerId = $script:CustomerSessions[$token].customer_id
                    
                    $customers = @(Read-JsonFileSafe "customers.json" @())
                    $cusMatches = @($customers | Where-Object { $_.id -eq $customerId })
                    if (-not $cusMatches) { Send-JsonResponse $response 404 @{ success = $false; message = 'Customer not found' }; continue }
                    $cus = $cusMatches[0]
                    
                    $subs = @(Read-JsonFileSafe "subscriptions.json" @())
                    $cusSubs = @($subs | Where-Object { $_.customer_id -eq $customerId })
                    
                    foreach ($sub in $cusSubs) {
                        if ($sub.status -eq 'active' -and $sub.expires_at) {
                            $exp = [datetime]::Parse($sub.expires_at)
                            $sub | Add-Member -MemberType NoteProperty -Name "days_remaining" -Value [math]::Max(0, [math]::Round(($exp - (Get-Date).ToUniversalTime()).TotalDays)) -Force
                        }
                        if ($sub.xtream_password) {
                            $sub.xtream_password = $sub.xtream_password.Substring(0, [math]::Min(2, $sub.xtream_password.Length)) + "****"
                        }
                    }
                    
                    $orders = @(Read-JsonFileSafe "orders.json" @())
                    $cusOrders = @($orders | Where-Object { $_.customer_email -eq $cus.email })
                    foreach ($o in $cusOrders) {
                        if ($o.PSObject.Properties.Match('xtream_username').Count -gt 0) { $o.PSObject.Properties.Remove('xtream_username') }
                        if ($o.PSObject.Properties.Match('xtream_password').Count -gt 0) { $o.PSObject.Properties.Remove('xtream_password') }
                    }

                    $payments = @(Read-JsonFileSafe "payments.json" @())
                    $cusPayments = @($payments | Where-Object { $_.customer_id -eq $customerId })
                    
                    Send-JsonResponse $response 200 @{
                        customer = @{ id = $cus.id; name = $cus.name; email = $cus.email; phone = $cus.phone; tags = $cus.tags; created_at = $cus.created_at }
                        subscriptions = $cusSubs
                        orders = $cusOrders
                        payments = $cusPayments
                    }
                }
                elseif ($apiRoute -eq "customer/reveal-credentials" -and $method -eq "POST") {
                    if (-not (Test-CustomerAuth $request)) { Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }; continue }
                    
                    if (-not $bodyObj.subscription_id) { Send-JsonResponse $response 400 @{ success = $false; message = "Subscription ID required" }; continue }
                    
                    $authHeader = $request.Headers["Authorization"]
                    $token = $authHeader.Substring(7).Trim()
                    $customerId = $script:CustomerSessions[$token].customer_id
                    
                    $subs = @(Read-JsonFileSafe "subscriptions.json" @())
                    $subMatches = @($subs | Where-Object { $_.id -eq $bodyObj.subscription_id -and $_.customer_id -eq $customerId })
                    
                    if (-not $subMatches) { Send-JsonResponse $response 404 @{ success = $false; message = "Subscription not found" }; continue }
                    $sub = $subMatches[0]
                    
                    $customers = @(Read-JsonFileSafe "customers.json" @())
                    $cusMatches = @($customers | Where-Object { $_.id -eq $customerId })
                    $cusEmail = if ($cusMatches) { $cusMatches[0].email } else { "Unknown" }
                    
                    Add-AuditLog "CREDENTIALS_REVEALED" "Customer" "Credentials for subscription $($sub.id) revealed by $cusEmail"
                    
                    Send-JsonResponse $response 200 @{
                        success = $true
                        xtream_username = $sub.xtream_username
                        xtream_password = $sub.xtream_password
                        m3u_url = $sub.m3u_url
                        server_url = $sub.server_url
                    }
                }
                # Customer: Create Ticket
                elseif ($apiRoute -eq "customer/tickets" -and $method -eq "POST") {
                    if (-not (Test-CustomerAuth $request)) {
                        Send-JsonResponse $response 401 @{ success = $false; message = "Customer authentication required" }
                        continue
                    }
                    $authHeader = $request.Headers["Authorization"]
                    $token = $authHeader.Substring(7).Trim()
                    $customerId = $script:CustomerSessions[$token].customer_id

                    $customers = @(Read-JsonFileSafe "customers.json" @())
                    $cust = $customers | Where-Object { $_.id -eq $customerId } | Select-Object -First 1

                    $tickets = [System.Collections.ArrayList]@(Read-JsonFileSafe "support_tickets.json" @())
                    $nowStr = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
                    
                    $newTicket = @{
                        id = New-SecureId "TCK-" 5
                        customer_id = $customerId
                        customer_name = if ($cust) { $cust.name } else { "Customer" }
                        customer_email = if ($cust) { $cust.email } else { "" }
                        subject = if ($bodyJson.subject) { [string]$bodyJson.subject } else { "General Inquiry" }
                        category = if ($bodyJson.category) { [string]$bodyJson.category } else { "General" }
                        device = if ($bodyJson.device) { [string]$bodyJson.device } else { "Not Specified" }
                        status = "OPEN"
                        priority = if ($bodyJson.priority) { [string]$bodyJson.priority } else { "MEDIUM" }
                        created_at = $nowStr
                        updated_at = $nowStr
                        messages = @(
                            @{
                                sender = "customer"
                                sender_name = if ($cust) { $cust.name } else { "Customer" }
                                text = if ($bodyJson.message) { [string]$bodyJson.message } else { "" }
                                timestamp = $nowStr
                            }
                        )
                    }

                    $tickets.Insert(0, $newTicket)
                    Write-JsonFileSafe "support_tickets.json" $tickets
                    Add-AuditLog "TICKET_CREATED" "Customer" "New ticket $($newTicket.id) created by $($cust.email)"

                    Send-JsonResponse $response 200 @{ success = $true; ticket_id = $newTicket.id }
                }
                # Public Guest Support Ticket Submission
                elseif ($apiRoute -eq "support/tickets" -and $method -eq "POST") {
                    $tickets = [System.Collections.ArrayList]@(Read-JsonFileSafe "support_tickets.json" @())
                    $nowStr = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
                    $custName = if ($bodyJson.customer_name) { [string]$bodyJson.customer_name } elseif ($bodyJson.name) { [string]$bodyJson.name } else { "Guest Visitor" }
                    $custEmail = if ($bodyJson.customer_email) { [string]$bodyJson.customer_email } elseif ($bodyJson.email) { [string]$bodyJson.email } else { "" }
                    $subj = if ($bodyJson.subject) { [string]$bodyJson.subject } else { "Support Inquiry" }
                    $msg = if ($bodyJson.message) { [string]$bodyJson.message } else { "" }

                    $newTicket = @{
                        id = New-SecureId "TCK-" 5
                        customer_id = "GUEST"
                        customer_name = $custName
                        customer_email = $custEmail
                        subject = $subj
                        category = if ($bodyJson.category) { [string]$bodyJson.category } else { "General" }
                        device = if ($bodyJson.device) { [string]$bodyJson.device } else { "Not Specified" }
                        status = "OPEN"
                        priority = if ($bodyJson.priority) { [string]$bodyJson.priority } else { "MEDIUM" }
                        created_at = $nowStr
                        updated_at = $nowStr
                        messages = @(
                            @{
                                sender = "customer"
                                sender_name = $custName
                                text = $msg
                                timestamp = $nowStr
                            }
                        )
                    }
                    $tickets.Insert(0, $newTicket)
                    Write-JsonFileSafe "support_tickets.json" $tickets
                    Add-AuditLog "TICKET_CREATED" "Guest" "New support ticket $($newTicket.id) from $custEmail"
                    Send-JsonResponse $response 201 @{ success = $true; ticket_id = $newTicket.id }
                }
                # Customer: List My Tickets
                elseif ($apiRoute -eq "customer/tickets" -and $method -eq "GET") {
                    if (-not (Test-CustomerAuth $request)) {
                        Send-JsonResponse $response 401 @{ success = $false; message = "Customer authentication required" }
                        continue
                    }
                    $authHeader = $request.Headers["Authorization"]
                    $token = $authHeader.Substring(7).Trim()
                    $customerId = $script:CustomerSessions[$token].customer_id

                    $tickets = @(Read-JsonFileSafe "support_tickets.json" @())
                    $myTickets = @($tickets | Where-Object { $_.customer_id -eq $customerId })
                    Send-JsonResponse $response 200 $myTickets
                }
                # Customer: Reply to Ticket
                elseif ($apiRoute -eq "customer/tickets/reply" -and $method -eq "POST") {
                    if (-not (Test-CustomerAuth $request)) {
                        Send-JsonResponse $response 401 @{ success = $false; message = "Customer authentication required" }
                        continue
                    }
                    $authHeader = $request.Headers["Authorization"]
                    $token = $authHeader.Substring(7).Trim()
                    $customerId = $script:CustomerSessions[$token].customer_id

                    $ticketId = $bodyJson.ticket_id
                    $replyText = $bodyJson.message
                    $nowStr = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

                    $tickets = @(Read-JsonFileSafe "support_tickets.json" @())
                    $target = $tickets | Where-Object { $_.id -eq $ticketId -and $_.customer_id -eq $customerId } | Select-Object -First 1

                    if ($target) {
                        $msgList = [System.Collections.ArrayList]@($target.messages)
                        $msgList.Add(@{
                            sender = "customer"
                            sender_name = $target.customer_name
                            text = [string]$replyText
                            timestamp = $nowStr
                        })
                        $target.messages = $msgList
                        $target.status = "WAITING_ON_ADMIN"
                        $target.updated_at = $nowStr

                        Write-JsonFileSafe "support_tickets.json" $tickets
                        Send-JsonResponse $response 200 @{ success = $true }
                    } else {
                        Send-JsonResponse $response 404 @{ success = $false; message = "Ticket not found" }
                    }
                }
                # Admin: List All Tickets
                elseif ($apiRoute -eq "admin/tickets" -and $method -eq "GET") {
                    if (-not (Test-AdminAuth $request)) {
                        Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }
                        continue
                    }
                    $tickets = @(Read-JsonFileSafe "support_tickets.json" @())
                    Send-JsonResponse $response 200 $tickets
                }
                # Admin: Update Ticket Status / Priority
                elseif ($apiRoute -eq "admin/tickets" -and $method -eq "PATCH") {
                    if (-not (Test-AdminAuth $request)) {
                        Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }
                        continue
                    }
                    $ticketId = $bodyJson.id
                    $tickets = @(Read-JsonFileSafe "support_tickets.json" @())
                    $target = $tickets | Where-Object { $_.id -eq $ticketId } | Select-Object -First 1

                    if ($target) {
                        if ($null -ne $bodyJson.status) { $target.status = [string]$bodyJson.status }
                        if ($null -ne $bodyJson.priority) { $target.priority = [string]$bodyJson.priority }
                        $target.updated_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

                        Write-JsonFileSafe "support_tickets.json" $tickets
                        Add-AuditLog "TICKET_UPDATED" "Admin" "Ticket $ticketId updated to $($target.status)"
                        Send-JsonResponse $response 200 @{ success = $true }
                    } else {
                        Send-JsonResponse $response 404 @{ success = $false; message = "Ticket not found" }
                    }
                }
                # Admin: Reply to Ticket
                elseif ($apiRoute -eq "admin/tickets/reply" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) {
                        Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }
                        continue
                    }
                    $ticketId = $bodyJson.ticket_id
                    $replyText = $bodyJson.message
                    $newStatus = if ($bodyJson.status) { [string]$bodyJson.status } else { "WAITING_ON_CUSTOMER" }
                    $nowStr = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

                    $tickets = @(Read-JsonFileSafe "support_tickets.json" @())
                    $target = $tickets | Where-Object { $_.id -eq $ticketId } | Select-Object -First 1

                    if ($target) {
                        $msgList = [System.Collections.ArrayList]@($target.messages)
                        $msgList.Add(@{
                            sender = "admin"
                            sender_name = "Luna Stream Support"
                            text = [string]$replyText
                            timestamp = $nowStr
                        })
                        $target.messages = $msgList
                        $target.status = $newStatus
                        $target.updated_at = $nowStr

                        Write-JsonFileSafe "support_tickets.json" $tickets
                        Add-AuditLog "TICKET_REPLIED" "Admin" "Replied to ticket $ticketId"
                        Send-JsonResponse $response 200 @{ success = $true }
                    } else {
                        Send-JsonResponse $response 404 @{ success = $false; message = "Ticket not found" }
                    }
                }
                # Admin: Get Email Templates
                elseif ($apiRoute -eq "admin/email-templates" -and $method -eq "GET") {
                    if (-not (Test-AdminAuth $request)) {
                        Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }
                        continue
                    }
                    $templates = Read-JsonFileSafe "email_templates.json" @{}
                    Send-JsonResponse $response 200 $templates
                }
                # Admin: Update Email Template
                elseif ($apiRoute -eq "admin/email-templates" -and $method -eq "PATCH") {
                    if (-not (Test-AdminAuth $request)) {
                        Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }
                        continue
                    }
                    $templateKey = [string]$bodyJson.template_key
                    $templates = Read-JsonFileSafe "email_templates.json" @{}
                    if (-not $templates.$templateKey) {
                        Send-JsonResponse $response 404 @{ success = $false; message = "Template not found" }
                        continue
                    }
                    if ($null -ne $bodyJson.subject) { $templates.$templateKey.subject = [string]$bodyJson.subject }
                    if ($null -ne $bodyJson.body_text) { $templates.$templateKey.body_text = [string]$bodyJson.body_text }
                    Write-JsonFileSafe "email_templates.json" $templates
                    Add-AuditLog "EMAIL_TEMPLATE_UPDATED" "Admin" "Updated template $templateKey"
                    Send-JsonResponse $response 200 @{ success = $true; template = $templates.$templateKey }
                }
                # Admin: Preview Email Template
                elseif ($apiRoute -eq "admin/email-templates/preview" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) {
                        Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }
                        continue
                    }
                    $templateKey = [string]$bodyJson.template_key
                    $sampleVars = if ($bodyJson.variables) { $bodyJson.variables } else { @{} }
                    $templates = Read-JsonFileSafe "email_templates.json" @{}
                    if (-not $templates.$templateKey) {
                        Send-JsonResponse $response 404 @{ success = $false; message = "Template not found" }
                        continue
                    }
                    $tmpl = $templates.$templateKey
                    $subj = [string]$tmpl.subject
                    $body = [string]$tmpl.body_text
                    if ($sampleVars -is [hashtable]) {
                        foreach ($k in $sampleVars.Keys) {
                            $subj = $subj.Replace("{{$k}}", [string]$sampleVars[$k])
                            $body = $body.Replace("{{$k}}", [string]$sampleVars[$k])
                        }
                    } elseif ($sampleVars.psobject) {
                        foreach ($prop in $sampleVars.psobject.Properties) {
                            $subj = $subj.Replace("{{$($prop.Name)}}", [string]$prop.Value)
                            $body = $body.Replace("{{$($prop.Name)}}", [string]$prop.Value)
                        }
                    }
                    Send-JsonResponse $response 200 @{
                        template_key = $templateKey
                        rendered_subject = $subj
                        rendered_body = $body
                    }
                }
                # Admin: Trigger Subscription Expiry Check
                elseif ($apiRoute -eq "admin/subscriptions/check-expiry" -and $method -eq "POST") {
                    if (-not (Test-AdminAuth $request)) {
                        Send-JsonResponse $response 401 @{ success = $false; message = 'Authentication required' }
                        continue
                    }
                    $result = Invoke-ExpiryCheck -force
                    Send-JsonResponse $response 200 @{ success = $true; result = $result }
                }
                else {
                    Send-JsonResponse $response 404 @{ error = "Unknown API Endpoint" }
                }
            }
            # Static Files
            else {
                # Security: Block sensitive files
                $normalizedPath = $urlPath.Replace('\', '/').ToLower()
                if ($normalizedPath.Contains('..') -or $normalizedPath.EndsWith('.ps1') -or $normalizedPath.StartsWith('data/') -or $normalizedPath.StartsWith('data\')) {
                    $response.StatusCode = 403
                    $forbiddenBytes = [System.Text.Encoding]::UTF8.GetBytes('<h1>403 Forbidden</h1>')
                    $response.ContentType = 'text/html; charset=utf-8'
                    $response.ContentLength64 = $forbiddenBytes.Length
                    $response.OutputStream.Write($forbiddenBytes, 0, $forbiddenBytes.Length)
                    $response.OutputStream.Close()
                    $response.Close()
                    continue
                }

                if (-not $urlPath -or $urlPath -eq "" -or $urlPath -eq "/") { $urlPath = "index.html" }
                if ($urlPath -eq "admin") { $urlPath = "admin.html" }

                $filePath = Join-Path $Folder $urlPath
                if (Test-Path $filePath -PathType Leaf) {
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $mime = $MimeTypes[$ext]
                    if (-not $mime) { $mime = "application/octet-stream" }
                    Send-StaticFile $response $filePath $mime
                } elseif ($urlPath.Contains('.')) {
                    Send-StaticFile $response $filePath "text/html; charset=utf-8"
                } else {
                    Send-StaticFile $response (Join-Path $Folder "index.html") "text/html; charset=utf-8"
                }

            }
        } catch {
            Write-Host "Request error: $_"
            try {
                Send-JsonResponse $response 500 @{ error = "Internal Server Error" }
            } catch {}
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
