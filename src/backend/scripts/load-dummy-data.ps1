<#
  Seeds dummy data into HisaabKitaab through the REST API for a single, fixed
  test account. Re-run it any time you need fresh data -- parties and items
  are matched by name and only created if missing, so re-running just stacks
  more transactions on top instead of duplicating your master data.

  Order (each step depends on IDs returned by the previous one):
    1. Sign up test@test.com   POST /api/auth/signup      (public; ok if it already exists)
    2. Ensure a store exists    POST /api/stores           (basic auth)
    3. Ensure 4 parties exist   POST /api/parties          (basic auth)
    4. Ensure 20 items exist    POST /api/store-items      (basic auth)
    5. Publish ~17 entries      POST /api/event            (basic auth) across
       SALE, PURCHASE, RECEIPT, PAYMENT and EXPENSE, several with multi-line items.

  Usage:
    powershell -ExecutionPolicy Bypass -File .\load-dummy-data.ps1
    powershell -ExecutionPolicy Bypass -File .\load-dummy-data.ps1 -BaseUrl http://localhost:8080 -Email test@test.com -Password test
#>
param(
    [string]$BaseUrl  = "http://localhost:8080",
    [string]$Email    = "test@test.com",
    [string]$Password = "test",
    [string]$ContactNumber = "03000000000"
)

$ErrorActionPreference = "Stop"

function Say  ($m) { Write-Host "`n==> $m" -ForegroundColor Blue }
function Info ($m) { Write-Host "    $m"    -ForegroundColor DarkGray }
function Die  ($m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

function AuthHeader {
    $pair = "{0}:{1}" -f $Email, $Password
    $b64  = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
    return @{ Authorization = "Basic $b64" }
}

# Calls the API and returns @{ Code = <int>; Body = <parsed object or $null> }.
# Invoke-RestMethod throws on 4xx/5xx on both Windows PowerShell 5.1 and 7+, so
# every non-2xx is recovered from the exception -- ErrorDetails.Message carries
# the response body as a string on both versions (no -SkipHttpErrorCheck, which
# only exists on 7.4+).
function Call ($method, $path, $obj) {
    $uri = "$BaseUrl$path"
    try {
        if ($null -ne $obj) {
            $json = $obj | ConvertTo-Json -Depth 8
            $result = Invoke-RestMethod -Method $method -Uri $uri -Headers (AuthHeader) `
                -ContentType "application/json" -Body $json
        } else {
            $result = Invoke-RestMethod -Method $method -Uri $uri -Headers (AuthHeader)
        }
        return @{ Code = 200; Body = $result }
    } catch {
        $code = 0
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        $parsed = $null
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            try { $parsed = $_.ErrorDetails.Message | ConvertFrom-Json } catch { $parsed = $_.ErrorDetails.Message }
        }
        return @{ Code = $code; Body = $parsed }
    }
}

function DaysAgo ($n) { (Get-Date).AddDays(-$n).ToString("yyyy-MM-dd") }

# ---------------------------------------------------------------------------
Say "Checking server at $BaseUrl"
$preflightAuth = @{ Authorization = "Basic " + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("preflight:preflight")) }
try {
    Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/parties" -Headers $preflightAuth | Out-Null
} catch {
    if (-not $_.Exception.Response) { Die "Cannot reach $BaseUrl. Is the backend running?" }
    # A 401/403 still means the server is up -- that's fine.
}
Info "Server reachable."

# ---------------------------------------------------------------------------
# 1. User (ok if it already exists -- we just fall through to auth)
# ---------------------------------------------------------------------------
Say "Signing up $Email"

$signupJson = @{ name = "Test User"; contactNumber = $ContactNumber; email = $Email; password = $Password } | ConvertTo-Json
$signupCode = 200
$signupError = $null
try {
    Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/auth/signup" -ContentType "application/json" -Body $signupJson | Out-Null
    Info "Created $Email"
} catch {
    $signupCode = 0
    if ($_.Exception.Response) { $signupCode = [int]$_.Exception.Response.StatusCode }
    $signupError = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    Info "Signup skipped (HTTP $signupCode) -- assuming $Email already exists."
}

$storesResp = Call GET "/api/stores" $null
if ($storesResp.Code -ne 200) { Die "Could not authenticate as ${Email}:${Password}. Signup said: $signupError" }
Info "Authenticated as $Email."

# ---------------------------------------------------------------------------
# 2. Store (create one if this account has none yet)
# ---------------------------------------------------------------------------
Say "Ensuring a store exists"

if (@($storesResp.Body).Count -eq 0) {
    $store = Call POST "/api/stores" @{ name = "Test Store"; address = "Main Bazaar, Lahore"; contact = "0421234567" }
    Info "Created store -> $($store.Body.id)"
} else {
    Info "Using existing store -> $($storesResp.Body[0].id) ($($storesResp.Body[0].name))"
}

# ---------------------------------------------------------------------------
# 3. Parties (get-or-create by name, so re-runs don't duplicate master data)
# ---------------------------------------------------------------------------
Say "Ensuring parties exist"

$partiesResp = Call GET "/api/parties" $null
$existingParties = @($partiesResp.Body)

function GetOrCreateParty ($name, $contact) {
    $found = $existingParties | Where-Object { $_.name -eq $name } | Select-Object -First 1
    if ($found) { return $found.id }
    (Call POST "/api/parties" @{ name = $name; contact = $contact; address = "" }).Body.id
}

$PartyBilal  = GetOrCreateParty "Bilal Traders"       "03111111111"
$PartyUsman  = GetOrCreateParty "Usman Wholesale"     "03122222222"
$PartyKamran = GetOrCreateParty "Kamran Retail"       "03133333333"
$PartyFaisal = GetOrCreateParty "Faisal Distributors" "03144444444"
Info "Bilal Traders -> $PartyBilal"
Info "Usman Wholesale -> $PartyUsman"
Info "Kamran Retail -> $PartyKamran"
Info "Faisal Distributors -> $PartyFaisal"

# ---------------------------------------------------------------------------
# 4. Store items (get-or-create by name; 20 kiryana items).
#    salePrice != costPrice on purpose -- SALE prefills a line's rate from
#    salePrice, PURCHASE from costPrice, so they must differ to tell apart.
# ---------------------------------------------------------------------------
Say "Ensuring store items exist"

$itemsResp = Call GET "/api/store-items" $null
$existingItems = @($itemsResp.Body)

function GetOrCreateItem ($name, $unit, $sale, $cost) {
    $found = $existingItems | Where-Object { $_.name -eq $name } | Select-Object -First 1
    if ($found) { return $found.id }
    (Call POST "/api/store-items" @{ name = $name; unit = $unit; salePrice = $sale; costPrice = $cost }).Body.id
}

$ItemSugar          = GetOrCreateItem "Sugar"            "kg"     120 100
$ItemFlour          = GetOrCreateItem "Flour"            "kg"     90  75
$ItemRice           = GetOrCreateItem "Rice"             "kg"     200 170
$ItemOil            = GetOrCreateItem "Cooking Oil"      "litre"  550 500
$ItemTea            = GetOrCreateItem "Tea"              "packet" 400 350
$ItemSalt           = GetOrCreateItem "Salt"             "kg"     40  30
$ItemDaalChana      = GetOrCreateItem "Daal Chana"       "kg"     180 150
$ItemDaalMasoor     = GetOrCreateItem "Daal Masoor"      "kg"     220 190
$ItemChili          = GetOrCreateItem "Red Chili Powder" "kg"     600 520
$ItemTurmeric       = GetOrCreateItem "Turmeric Powder"  "kg"     450 380
$ItemBasmati        = GetOrCreateItem "Basmati Rice"     "kg"     350 300
$ItemVermicelli     = GetOrCreateItem "Vermicelli"       "packet" 90  70
$ItemMilkPowder     = GetOrCreateItem "Milk Powder"      "kg"     950 850
$ItemButter         = GetOrCreateItem "Butter"           "kg"     850 750
$ItemGhee           = GetOrCreateItem "Ghee"             "kg"     700 620
$ItemSoap           = GetOrCreateItem "Soap"             "piece"  60  45
$ItemDetergent      = GetOrCreateItem "Detergent Powder" "kg"     250 210
$ItemMatchbox       = GetOrCreateItem "Matchbox"         "packet" 10  6
$ItemBiscuits       = GetOrCreateItem "Biscuits"         "packet" 80  60
$ItemRockSalt       = GetOrCreateItem "Rock Salt"        "kg"     150 120
Info "20 items ready (Sugar, Flour, Rice, Cooking Oil, Tea, Salt, Daal Chana, Daal Masoor,"
Info "Red Chili Powder, Turmeric Powder, Basmati Rice, Vermicelli, Milk Powder, Butter,"
Info "Ghee, Soap, Detergent Powder, Matchbox, Biscuits, Rock Salt)"

# ---------------------------------------------------------------------------
# 5. Entries -- every supported TransactionEvent, several multi-item lines,
#    a mix of fully paid / partially paid / overpaid bills, spread over the
#    last two weeks so cashbook/ledger date filters have something to show.
# ---------------------------------------------------------------------------
Say "Publishing entries"

function PublishEvent ($label, $body) {
    $resp = Call POST "/api/event" $body
    if ($resp.Code -ne 200) { Die "$label failed (HTTP $($resp.Code)): $($resp.Body | ConvertTo-Json -Compress)" }
    Info "$label ok"
}

PublishEvent "SALE-001 (Bilal Traders, paid in full)" @{
    transactionEvent = "SALE"; cashAmount = 3300; billAmount = 3300
    description = "Sugar and flour sale to Bilal Traders"; billNumber = "SALE-001"; billDate = (DaysAgo 13)
    party = @{ partyId = $PartyBilal; name = "Bilal Traders" }
    items = @(
        @{ itemId = $ItemSugar; name = "Sugar"; quantity = 20; itemSoldAt = 120 },
        @{ itemId = $ItemFlour; name = "Flour"; quantity = 10; itemSoldAt = 90 }
    )
}

PublishEvent "PUR-001 (Usman Wholesale, owe 9,500)" @{
    transactionEvent = "PURCHASE"; cashAmount = 15000; billAmount = 24500
    description = "Rice and daal chana purchase from Usman Wholesale"; billNumber = "PUR-001"; billDate = (DaysAgo 12)
    party = @{ partyId = $PartyUsman; name = "Usman Wholesale" }
    items = @(
        @{ itemId = $ItemRice; name = "Rice"; quantity = 100; itemSoldAt = 170 },
        @{ itemId = $ItemDaalChana; name = "Daal Chana"; quantity = 50; itemSoldAt = 150 }
    )
}

PublishEvent "SALE-002 (Kamran Retail, owed 950)" @{
    transactionEvent = "SALE"; cashAmount = 3000; billAmount = 3950
    description = "Cooking oil and tea sale to Kamran Retail"; billNumber = "SALE-002"; billDate = (DaysAgo 11)
    party = @{ partyId = $PartyKamran; name = "Kamran Retail" }
    items = @(
        @{ itemId = $ItemOil; name = "Cooking Oil"; quantity = 5; itemSoldAt = 550 },
        @{ itemId = $ItemTea; name = "Tea"; quantity = 3; itemSoldAt = 400 }
    )
}

PublishEvent "PUR-002 (Faisal Distributors, paid in full)" @{
    transactionEvent = "PURCHASE"; cashAmount = 12400; billAmount = 12400
    description = "Ghee purchase from Faisal Distributors"; billNumber = "PUR-002"; billDate = (DaysAgo 10)
    party = @{ partyId = $PartyFaisal; name = "Faisal Distributors" }
    items = @(@{ itemId = $ItemGhee; name = "Ghee"; quantity = 20; itemSoldAt = 620 })
}

PublishEvent "SALE-003 (Bilal Traders, owed 1,050)" @{
    transactionEvent = "SALE"; cashAmount = 5000; billAmount = 6050
    description = "Basmati rice and biscuits sale to Bilal Traders"; billNumber = "SALE-003"; billDate = (DaysAgo 9)
    party = @{ partyId = $PartyBilal; name = "Bilal Traders" }
    items = @(
        @{ itemId = $ItemBasmati; name = "Basmati Rice"; quantity = 15; itemSoldAt = 350 },
        @{ itemId = $ItemBiscuits; name = "Biscuits"; quantity = 10; itemSoldAt = 80 }
    )
}

PublishEvent "SALE-004 (Kamran Retail, paid in full)" @{
    transactionEvent = "SALE"; cashAmount = 7300; billAmount = 7300
    description = "Milk powder and butter sale to Kamran Retail"; billNumber = "SALE-004"; billDate = (DaysAgo 8)
    party = @{ partyId = $PartyKamran; name = "Kamran Retail" }
    items = @(
        @{ itemId = $ItemMilkPowder; name = "Milk Powder"; quantity = 5; itemSoldAt = 950 },
        @{ itemId = $ItemButter; name = "Butter"; quantity = 3; itemSoldAt = 850 }
    )
}

PublishEvent "PUR-003 (Faisal Distributors, owe 1,800)" @{
    transactionEvent = "PURCHASE"; cashAmount = 20000; billAmount = 21800
    description = "Turmeric and chili powder purchase from Faisal Distributors"; billNumber = "PUR-003"; billDate = (DaysAgo 8)
    party = @{ partyId = $PartyFaisal; name = "Faisal Distributors" }
    items = @(
        @{ itemId = $ItemTurmeric; name = "Turmeric Powder"; quantity = 30; itemSoldAt = 380 },
        @{ itemId = $ItemChili; name = "Red Chili Powder"; quantity = 20; itemSoldAt = 520 }
    )
}

PublishEvent "EXP-001 (electricity)" @{
    transactionEvent = "EXPENSE"; cashAmount = 1500
    description = "Shop electricity bill"; billNumber = "EXP-001"; billDate = (DaysAgo 8)
}

PublishEvent "EXP-002 (rent)" @{
    transactionEvent = "EXPENSE"; cashAmount = 15000
    description = "Monthly shop rent"; billNumber = "EXP-002"; billDate = (DaysAgo 15)
}

PublishEvent "PAY-001 (Usman Wholesale, paid 5,000)" @{
    transactionEvent = "PAYMENT"; cashAmount = 5000
    description = "Part payment to Usman Wholesale"; billNumber = "PAY-001"; billDate = (DaysAgo 6)
    party = @{ partyId = $PartyUsman; name = "Usman Wholesale" }
}

PublishEvent "SALE-005 (Kamran Retail, overpaid by 500)" @{
    transactionEvent = "SALE"; cashAmount = 4200; billAmount = 3700
    description = "Detergent and soap sale to Kamran Retail"; billNumber = "SALE-005"; billDate = (DaysAgo 5)
    party = @{ partyId = $PartyKamran; name = "Kamran Retail" }
    items = @(
        @{ itemId = $ItemDetergent; name = "Detergent Powder"; quantity = 10; itemSoldAt = 250 },
        @{ itemId = $ItemSoap; name = "Soap"; quantity = 20; itemSoldAt = 60 }
    )
}

PublishEvent "PAY-002 (Faisal Distributors, settled)" @{
    transactionEvent = "PAYMENT"; cashAmount = 1800
    description = "Final payment to Faisal Distributors"; billNumber = "PAY-002"; billDate = (DaysAgo 4)
    party = @{ partyId = $PartyFaisal; name = "Faisal Distributors" }
}

PublishEvent "RCPT-001 (Bilal Traders, settled)" @{
    transactionEvent = "RECEIPT"; cashAmount = 1050
    description = "Balance received from Bilal Traders"; billNumber = "RCPT-001"; billDate = (DaysAgo 3)
    party = @{ partyId = $PartyBilal; name = "Bilal Traders" }
}

PublishEvent "RCPT-002 (Kamran Retail, settled)" @{
    transactionEvent = "RECEIPT"; cashAmount = 950
    description = "Balance received from Kamran Retail"; billNumber = "RCPT-002"; billDate = (DaysAgo 2)
    party = @{ partyId = $PartyKamran; name = "Kamran Retail" }
}

PublishEvent "PUR-004 (Usman Wholesale, paid in full)" @{
    transactionEvent = "PURCHASE"; cashAmount = 3400; billAmount = 3400
    description = "Vermicelli and matchbox purchase from Usman Wholesale"; billNumber = "PUR-004"; billDate = (DaysAgo 2)
    party = @{ partyId = $PartyUsman; name = "Usman Wholesale" }
    items = @(
        @{ itemId = $ItemVermicelli; name = "Vermicelli"; quantity = 40; itemSoldAt = 70 },
        @{ itemId = $ItemMatchbox; name = "Matchbox"; quantity = 100; itemSoldAt = 6 }
    )
}

PublishEvent "SALE-006 (Bilal Traders, paid in full)" @{
    transactionEvent = "SALE"; cashAmount = 1700; billAmount = 1700
    description = "Salt sale to Bilal Traders"; billNumber = "SALE-006"; billDate = (DaysAgo 1)
    party = @{ partyId = $PartyBilal; name = "Bilal Traders" }
    items = @(
        @{ itemId = $ItemSalt; name = "Salt"; quantity = 5; itemSoldAt = 40 },
        @{ itemId = $ItemRockSalt; name = "Rock Salt"; quantity = 10; itemSoldAt = 150 }
    )
}

PublishEvent "EXP-003 (transport)" @{
    transactionEvent = "EXPENSE"; cashAmount = 800
    description = "Transport and delivery charges"; billNumber = "EXP-003"; billDate = (DaysAgo 1)
}

Say "Done. Log in as $Email / $Password -- 4 parties, 20 items, 17 entries loaded."
