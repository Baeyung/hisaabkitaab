<#
  Loads dummy data into HisaabKitaab through the REST API.

  Order (each step depends on IDs returned by the previous one):
    1. Sign up users        POST /api/auth/signup      (public)
    2. Create their stores   POST /api/stores           (basic auth)
    3. Create parties        POST /api/parties          (basic auth)
    4. Create store items    POST /api/store-items      (basic auth)
    5. Publish SALE/PURCHASE POST /api/event            (basic auth, as the owner's EMAIL)

  Usage:
    powershell -ExecutionPolicy Bypass -File .\load-dummy-data.ps1
    powershell -ExecutionPolicy Bypass -File .\load-dummy-data.ps1 -BaseUrl http://localhost:8080 -Password password123
#>
param(
    [string]$BaseUrl  = "http://localhost:8080",
    [string]$Password = "password123"
)

$ErrorActionPreference = "Stop"

function Say  ($m) { Write-Host "`n==> $m" -ForegroundColor Blue }
function Info ($m) { Write-Host "    $m"    -ForegroundColor DarkGray }

# Build an HTTP Basic auth header for the given username.
function AuthHeader ($user) {
    $pair = "{0}:{1}" -f $user, $Password
    $b64  = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
    return @{ Authorization = "Basic $b64" }
}

# POST public (no auth). Returns the parsed response object.
function PostPublic ($path, $body) {
    Invoke-RestMethod -Method Post -Uri "$BaseUrl$path" `
        -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 6)
}

# POST with basic auth. Returns the parsed response object.
function PostAuth ($user, $path, $body) {
    Invoke-RestMethod -Method Post -Uri "$BaseUrl$path" -Headers (AuthHeader $user) `
        -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 6)
}

# ---------------------------------------------------------------------------
Say "Checking server at $BaseUrl"
try {
    Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/users" -Headers (AuthHeader "preflight") | Out-Null
} catch {
    if ($_.Exception.Response -eq $null) {
        throw "Cannot reach $BaseUrl. Is the backend running?"
    }
    # A 401/403 still means the server is up -- that's fine.
}
Info "Server reachable."

# ---------------------------------------------------------------------------
# 1. Users
# ---------------------------------------------------------------------------
Say "Creating users"

$aliEmail = "ali@example.com"
$ali = PostPublic "/api/auth/signup" @{
    name = "Ali Hassan"; contactNumber = "03001112233"; email = $aliEmail; password = $Password
}
Info "Ali Hassan  -> $($ali.id)  ($aliEmail)"

$saraEmail = "sara@example.com"
$sara = PostPublic "/api/auth/signup" @{
    name = "Sara Khan"; contactNumber = "03004445566"; email = $saraEmail; password = $Password
}
Info "Sara Khan   -> $($sara.id)  ($saraEmail)"

# ---------------------------------------------------------------------------
# 2. Stores  (one per user; /api/event resolves the owner's FIRST store)
# ---------------------------------------------------------------------------
Say "Creating stores"

$aliStore = PostAuth $aliEmail "/api/stores" @{
    ownerId = $ali.id; name = "Ali General Store"; address = "Main Bazaar, Lahore"; contact = "0421234567"
}
Info "Ali General Store -> $($aliStore.id)"

$saraStore = PostAuth $saraEmail "/api/stores" @{
    ownerId = $sara.id; name = "Sara Mart"; address = "Saddar, Karachi"; contact = "0219876543"
}
Info "Sara Mart -> $($saraStore.id)"

# ---------------------------------------------------------------------------
# 3. Parties
# ---------------------------------------------------------------------------
Say "Creating parties"

function MkParty ($user, $storeId, $name, $contact) {
    (PostAuth $user "/api/parties" @{ storeId = $storeId; name = $name; contact = $contact; address = "" }).id
}

$aliCust = MkParty $aliEmail  $aliStore.id  "Bilal Traders"       "03111111111"
$aliSupp = MkParty $aliEmail  $aliStore.id  "Usman Wholesale"     "03122222222"
Info "Ali: Bilal Traders -> $aliCust | Usman Wholesale -> $aliSupp"

$saraCust = MkParty $saraEmail $saraStore.id "Kamran Retail"       "03133333333"
$saraSupp = MkParty $saraEmail $saraStore.id "Faisal Distributors" "03144444444"
Info "Sara: Kamran Retail -> $saraCust | Faisal Distributors -> $saraSupp"

# ---------------------------------------------------------------------------
# 4. Store items
# ---------------------------------------------------------------------------
Say "Creating store items"

function MkItem ($user, $storeId, $name, $unit, $sale, $cost) {
    (PostAuth $user "/api/store-items" @{
        storeId = $storeId; name = $name; unit = $unit; salePrice = $sale; costPrice = $cost
    }).id
}

$aliSugar = MkItem $aliEmail $aliStore.id "Sugar" "kg" 120 100
$aliFlour = MkItem $aliEmail $aliStore.id "Flour" "kg" 90  75
$aliRice  = MkItem $aliEmail $aliStore.id "Rice"  "kg" 200 170
Info "Ali items: Sugar $aliSugar | Flour $aliFlour | Rice $aliRice"

$saraOil  = MkItem $saraEmail $saraStore.id "Cooking Oil" "litre"  550 500
$saraTea  = MkItem $saraEmail $saraStore.id "Tea"         "packet" 400 350
$saraSalt = MkItem $saraEmail $saraStore.id "Salt"        "kg"     40  30
Info "Sara items: Oil $saraOil | Tea $saraTea | Salt $saraSalt"

# ---------------------------------------------------------------------------
# 5. Events. SALE/PURCHASE carry a party + item; RECEIPT/PAYMENT carry a party
#    only; EXPENSE carries neither -- all are supported.
#    NOTE: the event has no storeId -- EventService resolves the owner's store
#    from the login identifier, which may be the owner's email OR contact number.
# ---------------------------------------------------------------------------
Say "Publishing events"

# Ali: SALE of 10kg sugar, bill 1200, customer paid 1000 (200 stays on party).
PostAuth $aliEmail "/api/event" @{
    transactionEvent = "SALE"; cashAmount = 1000; billAmount = 1200
    description = "Sugar sale to Bilal Traders"; billNumber = "ALI-INV-001"; billDate = "2026-07-14"
    party = @{ partyId = $aliCust;  name = "Bilal Traders" }
    item  = @{ itemId  = $aliSugar; name = "Sugar"; quantity = 10 }
} | Out-Null
Info "Ali SALE ok"

# Ali: PURCHASE of 50kg flour, bill 3750, paid in full.
PostAuth $aliEmail "/api/event" @{
    transactionEvent = "PURCHASE"; cashAmount = 3750; billAmount = 3750
    description = "Flour purchase from Usman Wholesale"; billNumber = "ALI-PUR-001"; billDate = "2026-07-13"
    party = @{ partyId = $aliSupp;  name = "Usman Wholesale" }
    item  = @{ itemId  = $aliFlour; name = "Flour"; quantity = 50 }
} | Out-Null
Info "Ali PURCHASE ok"

# Sara: SALE of 5 litre oil, bill 2750, paid in full.
PostAuth $saraEmail "/api/event" @{
    transactionEvent = "SALE"; cashAmount = 2750; billAmount = 2750
    description = "Cooking oil sale to Kamran Retail"; billNumber = "SARA-INV-001"; billDate = "2026-07-14"
    party = @{ partyId = $saraCust; name = "Kamran Retail" }
    item  = @{ itemId  = $saraOil;  name = "Cooking Oil"; quantity = 5 }
} | Out-Null
Info "Sara SALE ok"

# Sara: PURCHASE of 20 packets tea, bill 7000, paid 5000 (2000 owed).
PostAuth $saraEmail "/api/event" @{
    transactionEvent = "PURCHASE"; cashAmount = 5000; billAmount = 7000
    description = "Tea purchase from Faisal Distributors"; billNumber = "SARA-PUR-001"; billDate = "2026-07-12"
    party = @{ partyId = $saraSupp; name = "Faisal Distributors" }
    item  = @{ itemId  = $saraTea;  name = "Tea"; quantity = 20 }
} | Out-Null
Info "Sara PURCHASE ok"

# Ali: EXPENSE -- shop electricity bill (cash out only, no party/item).
PostAuth $aliEmail "/api/event" @{
    transactionEvent = "EXPENSE"; cashAmount = 800
    description = "Shop electricity bill"; billNumber = "ALI-EXP-001"; billDate = "2026-07-14"
} | Out-Null
Info "Ali EXPENSE ok"

# Ali: RECEIPT -- Bilal Traders clears the 200 they owed (cash in + party, no item).
PostAuth $aliEmail "/api/event" @{
    transactionEvent = "RECEIPT"; cashAmount = 200
    description = "Balance received from Bilal Traders"; billNumber = "ALI-RCP-001"; billDate = "2026-07-15"
    party = @{ partyId = $aliCust; name = "Bilal Traders" }
} | Out-Null
Info "Ali RECEIPT ok"

# Sara: PAYMENT -- pay Faisal Distributors the 2000 owed (cash out + party, no item).
PostAuth $saraEmail "/api/event" @{
    transactionEvent = "PAYMENT"; cashAmount = 2000
    description = "Payment to Faisal Distributors"; billNumber = "SARA-PAY-001"; billDate = "2026-07-15"
    party = @{ partyId = $saraSupp; name = "Faisal Distributors" }
} | Out-Null
Info "Sara PAYMENT ok"

Say "Done. Dummy data loaded successfully."
