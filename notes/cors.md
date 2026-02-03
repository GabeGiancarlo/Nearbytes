# CORS Explained

## Problem: Same-Origin Policy

```
┌─────────────────────────────────────────────────────────────┐
│  Same-Origin Policy (SOP)                                    │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Browser rule:                                               │
│    JavaScript can ONLY access resources from the SAME origin│
│                                                              │
│  Origin = Protocol + Domain + Port                          │
│                                                              │
│  Same origin examples:                                       │
│    ✅ http://example.com/page1 → http://example.com/api    │
│    ✅ https://mysite.com/app → https://mysite.com/data      │
│                                                              │
│  Different origin examples:                                 │
│    ❌ http://example.com → https://example.com (protocol)   │
│    ❌ example.com → api.example.com (subdomain)             │
│    ❌ localhost:5173 → localhost:3000 (port)               │
└─────────────────────────────────────────────────────────────┘
```

## What Does SOP Prevent?

SOP blocks JavaScript from READING cross-origin data, but it does NOT block you from SEEING it in your browser.

**Scenario: Your Website Uses Google Maps**

Counterfactual: What if Google Maps didnt send CORS headers and SOP would block Javascript from reading the response?

```
┌─────────────────────────────────────────────────────────────┐
│  Your Website: https://myrestaurant.com                     │
│  Google Maps API: https://maps.googleapis.com               │
│  ⚠️ Different origins!                                      │
└─────────────────────────────────────────────────────────────┘
```

**What SOP BLOCKS (JavaScript Access):**

```javascript
// Your website: myrestaurant.com
// JavaScript trying to fetch Google Maps data

fetch('https://maps.googleapis.com/maps/api/geocode/json?address=NYC')
  .then(response => response.json())  // ❌ BLOCKED HERE!
  .then(data => {
    // ❌ This code NEVER runs
    console.log('Coordinates:', data.results[0].geometry.location);
    // ❌ Cannot extract data programmatically
    // ❌ Cannot process the response in JavaScript
  })
  .catch(error => {
    // ✅ Error: "CORS policy: No 'Access-Control-Allow-Origin' header"
  });
```

**What happens:**
- Browser sends the request ✅
- Google Maps server responds ✅
- Browser receives the response ✅
- **JavaScript cannot read the response data** ❌
- Response is marked as "opaque" - you know it exists but can't access it

**What SOP Does NOT Block (Visual Display):**

You CAN still see Google Maps in your browser!** Here's how:

**Method 1**: Using an `<iframe>` (Embedded Map)

```html
<!-- Your website: myrestaurant.com -->
<iframe 
  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d..."
  width="600" 
  height="450">
</iframe>
```

```
┌─────────────────────────────────────────────────────────────┐
│  How This Works:                                             │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  1. Browser loads iframe from Google Maps                   │
│  2. Google Maps renders INSIDE the iframe                    │
│  3. You SEE the map visually                                 │
│  4. ✅ SOP allows this! (iframe is a separate document)     │
│                                                              │
│  ⚠️ But: JavaScript on your site CANNOT access the iframe's │
│     content (that would be blocked by SOP)                   │
└─────────────────────────────────────────────────────────────┘
```

**Method 2**: Using `<img>` Tag (Static Map Image)

```html
<!-- Your website: myrestaurant.com -->
<img src="https://maps.googleapis.com/maps/api/staticmap?center=NYC&zoom=13&size=600x300" />
```

```
┌─────────────────────────────────────────────────────────────┐
│  How This Works:                                             │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  1. Browser requests image from Google Maps                  │
│  2. Google Maps returns image (PNG/JPG)                     │
│  3. Browser displays image                                   │
│  4. ✅ SOP allows this! (images are "simple" resources)     │
│                                                              │
│  ⚠️ But: JavaScript CANNOT read the image pixels            │
│     (would need canvas, which SOP blocks)                    │
└─────────────────────────────────────────────────────────────┘
```

**Method 3**: Using `<script>` Tag (JSONP - Old Workaround)

```html
<!-- Your website: myrestaurant.com -->
<script src="https://maps.googleapis.com/maps/api/js?callback=initMap"></script>

<script>
function initMap(data) {
  // ✅ This works! (but only because Google allows it)
  // Google wraps data in a function call
  console.log('Map data:', data);
}
</script>
```

```
┌─────────────────────────────────────────────────────────────┐
│  How This Works:                                             │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  1. Browser loads script from Google Maps                   │
│  2. Script executes (SOP allows script tags)                 │
│  3. Script calls your callback function                      │
│  4. ✅ Works, but hacky and limited                         │
│                                                              │
│  ⚠️ Only works for GET requests                             │
│  ⚠️ Security risk (executes arbitrary code)                 │
│  ⚠️ This is why CORS was invented!                           │
└─────────────────────────────────────────────────────────────┘
```

**Summary: What SOP Blocks vs Allows**

```
┌─────────────────────────────────────────────────────────────┐
│  SOP Blocks (JavaScript Access):                            │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  ❌ fetch() to different origin                              │
│  ❌ XMLHttpRequest to different origin                      │
│  ❌ Reading iframe content from different origin            │
│  ❌ Reading canvas pixels from different origin image       │
│  ❌ Accessing localStorage/cookies from different origin     │
│                                                              │
│  ⚠️ All programmatic access to cross-origin data            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  SOP Allows (Visual Display):                               │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  ✅ <img> tags from any origin                              │
│  ✅ <iframe> tags from any origin                           │
│  ✅ <link> tags (CSS) from any origin                        │
│  ✅ <script> tags from any origin                            │
│  ✅ <video>, <audio> from any origin                        │
│                                                              │
│  ⚠️ You can SEE these resources                             │
│  ⚠️ But JavaScript cannot READ them                         │
└─────────────────────────────────────────────────────────────┘
```

## The NearBytes Project

```
┌─────────────────────────────────────────────────────────────┐
│  Your Setup                                                  │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  UI Server: http://localhost:5173                           │
│  API Server: http://localhost:3000                          │
│                                                              │
│  ⚠️ Different ports = Different origins!                    │
└─────────────────────────────────────────────────────────────┘
```

Without CORS Browser would block requests from the frontend to the backend:

```javascript
// Your UI code (running on localhost:5173)
fetch('http://localhost:3000/files', {
  headers: { 'x-nearbytes-secret': 'secret' }
})
.then(response => response.json())
.then(files => {
  // ❌ BROWSER BLOCKS THIS!
  // Error: "CORS policy: No 'Access-Control-Allow-Origin' header"
})
```

Why This Happens:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser's Thinking                                          │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  "JavaScript is running on: localhost:5173"                 │
│  "Trying to access: localhost:3000"                         │
│  "Different ports = Different origins"                        │
│  "❌ BLOCKED by Same-Origin Policy!"                        │
└─────────────────────────────────────────────────────────────┘
```

Solution (with CORS):

```typescript:src/server/app.ts
cors({
  origin: 'http://localhost:5173',  // You explicitly allow your UI
})
```

```
┌─────────────────────────────────────────────────────────────┐
│  With CORS                                                   │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Browser: "JavaScript on localhost:5173 wants localhost:3000"│
│  Server: "Access-Control-Allow-Origin: http://localhost:5173" │
│  Browser: "✅ Match! I'll allow it"                         │
└─────────────────────────────────────────────────────────────┘
```

## Real-World Architecture:

```
┌─────────────────────────────────────────────────────────────┐
│  Modern Web App Architecture                                 │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Frontend (React/Vue/Svelte):                               │
│    - Served from: https://app.mysite.com                    │
│    - Or: https://cdn.mysite.com                             │
│    - Or: AWS CloudFront CDN                                 │
│                                                              │
│  Backend API:                                               │
│    - Running on: https://api.mysite.com                     │
│    - Or: https://backend.mysite.com                         │
│                                                              │
│  ⚠️ Different subdomains = Different origins!             │
│  ⚠️ Without CORS: Frontend can't call backend!            │
└─────────────────────────────────────────────────────────────┘
```

Example: E-commerce Site

```javascript
// Frontend: https://shop.example.com
// Backend: https://api.example.com

// User clicks "Add to Cart"
fetch('https://api.example.com/cart/add', {
  method: 'POST',
  body: JSON.stringify({ productId: 123 })
})
// ❌ Without CORS: BLOCKED!
// ✅ With CORS: Works!
```

Why Separate?

```
┌─────────────────────────────────────────────────────────────┐
│  Why Separate Frontend and Backend?                         │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  ✅ Scalability:                                             │
│     - Frontend on CDN (fast, global)                        │
│     - Backend on servers (processing power)                 │
│                                                              │
│  ✅ Deployment:                                              │
│     - Update frontend without touching backend              │
│     - Scale backend independently                            │
│                                                              │
│  ✅ Security:                                                │
│     - Backend behind firewall                                │
│     - Frontend can be public                                 │
│                                                              │
│  ⚠️ But: They're on different origins!                     │
│  ⚠️ Need CORS to connect them!                             │
└─────────────────────────────────────────────────────────────┘
```

## Third-Party APIs (Maps)

The Scenario:

```
┌─────────────────────────────────────────────────────────────┐
│  Your Website Uses Google Maps                               │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Your site: https://myrestaurant.com                        │
│  Google Maps API: https://maps.googleapis.com               │
│                                                              │
│  ⚠️ Completely different domains!                          │
└─────────────────────────────────────────────────────────────┘
```

Without CORS:

```javascript
// Your website: myrestaurant.com
fetch('https://maps.googleapis.com/maps/api/geocode/json?address=NYC')
.then(response => response.json())
.then(data => {
  // ❌ BLOCKED!
  // Browser: "Different origin! Not allowed!"
})
```

With CORS (Google's Solution):

```
┌─────────────────────────────────────────────────────────────┐
│  Google Maps API Response                                   │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  HTTP/1.1 200 OK                                            │
│  Access-Control-Allow-Origin: *                             │
│                                                              │
│  ⚠️ Google allows ANY website to use their API             │
│  ⚠️ That's why you can embed maps anywhere                 │
└─────────────────────────────────────────────────────────────┘
```

## Payment Processing (Stripe)

The Scenario:

```
┌─────────────────────────────────────────────────────────────┐
│  E-commerce Checkout                                         │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Your shop: https://myshop.com                              │
│  Stripe API: https://api.stripe.com                         │
│                                                              │
│  User clicks "Pay $100"                                     │
│  Need to process payment via Stripe                         │
│                                                              │
│  ⚠️ Different domains!                                     │
└─────────────────────────────────────────────────────────────┘
```

Without CORS:

```javascript
// Your shop: myshop.com
fetch('https://api.stripe.com/v1/charges', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sk_test_...',
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: 'amount=1000&currency=usd'
})
.then(response => response.json())
.then(charge => {
  // ❌ BLOCKED!
  // Can't process payment from your website!
})
```

Without CORS, the browser blocks JavaScript from reading Stripe's response, so you can't show the user whether their payment succeeded or redirect them to the order confirmation page.

With CORS (Stripe's Solution):

```
┌─────────────────────────────────────────────────────────────┐
│  Stripe API Response                                         │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  HTTP/1.1 200 OK                                            │
│  Access-Control-Allow-Origin: *                             │
│  Access-Control-Allow-Methods: GET, POST, DELETE            │
│  Access-Control-Allow-Headers: Authorization, Content-Type  │
│                                                              │
│  ⚠️ Stripe allows cross-origin requests                     │
│  ⚠️ That's why you can process payments from your site     │
└─────────────────────────────────────────────────────────────┘
```

**Security Model Examples**:

Bank-Victim-Hacker Example:
  - Victim's browser has cookies/auth for the bank
  - Malicious site can trigger requests (SOP doesn't prevent sending requests)
  - Browser automatically sends victim's credentials (cookies)
  - ✅ Bank prevents JavaScript from reading responses by not sending CORS headers
  - ✅ Bank also uses CSRF tokens to prevent unauthorized actions

Stripe Example (Protected):
  - Requires the SHOP's secret key (sk_test_...)
  - Shop's secret key should be SERVER-SIDE only (on shop's server)
  - Malicious site can't get the shop's secret key
  - ✅ Stripe allows CORS, but shop must keep secret key server-side for security
  
## Microservices Architecture

Modern App Structure:

```
┌─────────────────────────────────────────────────────────────┐
│  Microservices Example                                       │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Frontend: https://app.company.com                          │
│                                                              │
│  Services:                                                   │
│    - Auth: https://auth.company.com                         │
│    - Users: https://users.company.com                       │
│    - Payments: https://payments.company.com                 │
│    - Notifications: https://notify.company.com             │
│                                                              │
│  ⚠️ All different origins!                                 │
│  ⚠️ Frontend needs to call all of them!                   │
└─────────────────────────────────────────────────────────────┘
```

Without CORS:

```javascript
// Frontend needs to call multiple services
Promise.all([
  fetch('https://auth.company.com/me'),        // ❌ BLOCKED
  fetch('https://users.company.com/profile'),  // ❌ BLOCKED
  fetch('https://payments.company.com/balance') // ❌ BLOCKED
])
// Nothing works!
```

With CORS:

```javascript
// Each service sets CORS headers
// Frontend can call all of them

Promise.all([
  fetch('https://auth.company.com/me'),        // ✅ Works
  fetch('https://users.company.com/profile'),  // ✅ Works
  fetch('https://payments.company.com/balance') // ✅ Works
])
.then(([auth, profile, balance]) => {
  // ✅ All services accessible!
})
```

## Development vs Production

Your NearBytes Example:

```
┌─────────────────────────────────────────────────────────────┐
│  Development                                                 │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  UI: http://localhost:5173                                   │
│  API: http://localhost:3000                                  │
│                                                              │
│  ⚠️ Different ports = Need CORS                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Production                                                  │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  UI: https://nearbytes.com                                   │
│  API: https://api.nearbytes.com                              │
│                                                              │
│  ⚠️ Different subdomains = Need CORS                       │
└─────────────────────────────────────────────────────────────┘
```

Your Current Solution:

```typescript:src/server/app.ts
cors({
  origin: deps.corsOrigin,  // Can be different in dev vs prod
})
```

In development: `origin: 'http://localhost:5173'`  
In production: `origin: 'https://nearbytes.com'`

## Before CORS?

**Workaround 1: JSONP (Hacky)**

```javascript
// Instead of fetch(), use <script> tag
<script src="https://api.example.com/data?callback=handleData"></script>

function handleData(data) {
  // Got data!
}
```

Problems:
- Only works for GET requests
- Security risk (executes arbitrary JavaScript)
- Not standardized

**Workaround 2: Server-Side Proxy**

```
┌─────────────────────────────────────────────────────────────┐
│  Proxy Pattern                                               │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Frontend → Your Server → Third-Party API                   │
│                                                              │
│  JavaScript calls YOUR server (same origin)                 │
│  YOUR server calls third-party API                          │
│  YOUR server returns data to JavaScript                      │
│                                                              │
│  ⚠️ Extra server code needed                               │
│  ⚠️ Extra latency                                           │
│  ⚠️ More complex                                             │
└─────────────────────────────────────────────────────────────┘
```

**Your Vite Proxy** (Development Only):

```javascript:ui/vite.config.js
proxy: {
  '/open': { target: 'http://localhost:3000' },
  // Vite dev server acts as proxy
  // Makes requests appear same-origin
}
```

This only works in development. In production, you need CORS.

## Summary: Why CORS

```
┌─────────────────────────────────────────────────────────────┐
│  The Problems CORS Solves                                    │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  1. Frontend + Backend Separation                           │
│     - Different servers/subdomains                          │
│     - Need to communicate                                    │
│                                                              │
│  2. Third-Party APIs                                         │
│     - Google Maps, Stripe, GitHub                           │
│     - Your site needs their data                            │
│                                                              │
│  3. Microservices                                           │
│     - Multiple services                                      │
│     - Frontend calls all of them                            │
│                                                              │
│  4. Development Setup                                        │
│     - UI and API on different ports                         │
│     - Need to test locally                                   │
│                                                              │
│  5. CDN + API Separation                                    │
│     - Frontend on CDN                                        │
│     - API on servers                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

# Scaling Http Requests

Explaining why separation of frontend and backend helps scale despite HTTP overhead:

The separation doesn't make individual requests faster; it enables independent scaling and better resource use.

## Scaling Techniques

Why separation scales despite HTTP overhead:

1) Different scaling needs
```
┌─────────────────────────────────────────────────────────────┐
│  Frontend Scaling Needs                                       │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  ✅ Static files (HTML, CSS, JS, images)                     │
│  ✅ Can be cached forever                                    │
│  ✅ Served from CDN (fast, global)                          │
│  ✅ Cheap to serve (just file delivery)                      │
│                                                              │
│  Example:                                                    │
│    - 1 million users                                         │
│    - Same files for everyone                                 │
│    - CDN handles it easily                                   │
│                                                              │
│  ⚠️ Needs: Bandwidth, not CPU                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Backend Scaling Needs                                       │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  ✅ Dynamic processing                                       │
│  ✅ Database queries                                         │
│  ✅ Business logic                                           │
│  ✅ CPU-intensive operations                                 │
│                                                              │
│  Example:                                                    │
│    - 1 million users                                         │
│    - Each needs different data                               │
│    - Heavy computation per request                           │
│                                                              │
│  ⚠️ Needs: CPU, memory, database connections                 │
└─────────────────────────────────────────────────────────────┘
```

2) Independent scaling
```
┌─────────────────────────────────────────────────────────────┐
│  Scenario: Traffic Spike                                    │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Without Separation:                                         │
│    - Frontend + Backend on same server                       │
│    - Traffic spike → Need to scale everything                │
│    - Frontend files + API processing together                │
│    - ⚠️ Wasteful: Scaling frontend when only API is busy    │
│                                                              │
│  With Separation:                                            │
│    - Frontend: Already on CDN (handles millions)             │
│    - Backend: Scale only API servers                         │
│    - ✅ Efficient: Scale what actually needs it               │
└─────────────────────────────────────────────────────────────┘
```

3) Minimizing HTTP overhead


Your code already uses caching. Here's how to minimize HTTP overhead:

### Caching

```typescript:ui/src/lib/cache.ts
// Your code caches file listings locally
export async function getCachedFiles(volumeId: string)
```

```
┌─────────────────────────────────────────────────────────────┐
│  How Caching Reduces HTTP Requests                          │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  First Request:                                             │
│    Browser → API: GET /files                                │
│    API → Browser: File list                                 │
│    Browser: Stores in IndexedDB cache                       │
│                                                              │
│  Subsequent Requests:                                        │
│    Browser: Reads from cache (instant!)                      │
│    ⚠️ NO HTTP request needed!                               │
│                                                              │
│  ✅ HTTP overhead: Only on first request                    │
│  ✅ Subsequent requests: 0ms (local cache)                  │
└─────────────────────────────────────────────────────────────┘
```

### HTTP/2 Multiplexing

```
┌─────────────────────────────────────────────────────────────┐
│  HTTP/1.1 (Old)                                             │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Request 1: Browser → API (wait for response)              │
│  Request 2: Browser → API (wait for response)              │
│  Request 3: Browser → API (wait for response)              │
│                                                              │
│  ⚠️ Sequential: Each request waits for previous             │
│  ⚠️ Slow: 3 requests = 3x latency                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  HTTP/2 (Modern)                                            │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Request 1, 2, 3: All sent simultaneously                  │
│  Responses: All received in parallel                         │
│                                                              │
│  ✅ Parallel: All requests at once                          │
│  ✅ Fast: 3 requests ≈ 1x latency                            │
└─────────────────────────────────────────────────────────────┘
```

### Connection Reuse

```
┌─────────────────────────────────────────────────────────────┐
│  Without Connection Reuse                                     │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Request 1:                                                  │
│    - TCP handshake: 50ms                                     │
│    - TLS handshake: 100ms                                    │
│    - HTTP request: 10ms                                      │
│    Total: 160ms per request                                  │
│                                                              │
│  ⚠️ Every request pays full connection cost                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  With Connection Reuse                                       │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Request 1:                                                  │
│    - TCP handshake: 50ms                                     │
│    - TLS handshake: 100ms                                    │
│    - HTTP request: 10ms                                      │
│    Total: 160ms                                              │
│                                                              │
│  Request 2, 3, 4...:                                        │
│    - Connection already open                                  │
│    - HTTP request: 10ms                                       │
│    Total: 10ms per request                                   │
│                                                              │
│  ✅ Subsequent requests: 16x faster!                        │
└─────────────────────────────────────────────────────────────┘
```

### Batch Requests

```javascript
// Instead of multiple requests:
fetch('/files/1')  // 50ms
fetch('/files/2')  // 50ms
fetch('/files/3')  // 50ms
// Total: 150ms

// Batch into one request:
fetch('/files?ids=1,2,3')  // 50ms
// Total: 50ms (3x faster!)
```

## Performance Comparison

Monolithic (Same Server):

```
┌─────────────────────────────────────────────────────────────┐
│  Single Server Architecture                                  │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  User Request:                                               │
│    1. Browser → Server: Get HTML (10ms)                      │
│    2. Browser → Server: Get CSS (10ms)                      │
│    3. Browser → Server: Get JS (10ms)                        │
│    4. Browser → Server: Get API data (50ms)                 │
│                                                              │
│  Total: 80ms                                                 │
│                                                              │
│  ⚠️ All requests hit same server                             │
│  ⚠️ Server must handle everything                            │
│  ⚠️ Can't scale frontend independently                       │
└─────────────────────────────────────────────────────────────┘
```

Separated (Your Architecture):

```
┌─────────────────────────────────────────────────────────────┐
│  Separated Architecture                                       │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  User Request:                                               │
│    1. Browser → CDN: Get HTML (2ms, cached globally)         │
│    2. Browser → CDN: Get CSS (2ms, cached globally)         │
│    3. Browser → CDN: Get JS (2ms, cached globally)          │
│    4. Browser → API: Get data (50ms)                        │
│                                                              │
│  Total: 56ms (faster!)                                      │
│                                                              │
│  ✅ Frontend from CDN (fast, cached)                        │
│  ✅ API scales independently                                 │
│  ✅ Can cache frontend aggressively                          │
└─────────────────────────────────────────────────────────────┘
```

## When Separation Doesn't Make Sense

```
┌─────────────────────────────────────────────────────────────┐
│  When to Keep Together                                        │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  ✅ Small apps (< 1000 users)                                │
│     - HTTP overhead > scaling benefits                       │
│                                                              │
│  ✅ Server-Side Rendering (SSR)                              │
│     - HTML generated on server                                │
│     - No client-side API calls                               │
│                                                              │
│  ✅ Internal tools                                           │
│     - Low traffic                                            │
│     - Simpler deployment                                     │
│                                                              │
│  ⚠️ For most modern web apps: Separation wins               │
└─────────────────────────────────────────────────────────────┘
```

## Your NearBytes Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Your Current Setup                                           │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Frontend (localhost:5173):                                  │
│    ✅ Svelte app                                             │
│    ✅ Caches file listings (IndexedDB)                       │
│    ✅ Can be deployed to CDN                                │
│                                                              │
│  Backend (localhost:3000):                                   │
│    ✅ API server                                             │
│    ✅ Handles encryption/decryption                           │
│    ✅ Scales independently                                    │
│                                                              │
│  Performance Optimizations:                                 │
│    ✅ Caching reduces HTTP requests                          │
│    ✅ HTTP/2 multiplexing (if enabled)                        │
│    ✅ Connection reuse (browser handles)                      │
│                                                              │
│  ⚠️ HTTP overhead: Minimal due to caching                    │
│  ⚠️ Scaling benefits: Huge                                  │
└─────────────────────────────────────────────────────────────┘
```

## The Math

```
┌─────────────────────────────────────────────────────────────┐
│  Cost-Benefit Analysis                                       │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  HTTP Overhead Cost:                                         │
│    - First request: ~50ms                                    │
│    - Cached requests: 0ms                                    │
│    - Average: ~5ms (with caching)                           │
│                                                              │
│  Scaling Benefits:                                           │
│    - Frontend: CDN handles millions                         │
│    - Backend: Scale only when needed                         │
│    - Cost: Pay for what you use                              │
│                                                              │
│  ✅ Benefits >> Costs                                        │
│  ✅ Especially at scale                                      │
└─────────────────────────────────────────────────────────────┘
```

## Summary

- HTTP requests add latency, but caching, HTTP/2, and connection reuse minimize it.
- Separation enables independent scaling, CDN delivery, and better resource use.
- Your code already uses caching, which reduces HTTP overhead.
- At scale, the benefits outweigh the costs.

Separation scales because:
1. Frontend scales via CDN (cheap, fast)
2. Backend scales independently (only when needed)
3. Caching reduces HTTP requests
4. Modern protocols (HTTP/2) reduce overhead

The HTTP overhead is small compared to the scaling benefits.

# CORS Security Model

The server owner decides their CORS policy. Different services make different decisions based on their data sensitivity, use case, and security needs.

## Defense in Depth

CORS is just one security layer. Real security comes from multiple layers working together:

```
┌─────────────────────────────────────────────────────────────┐
│  Security Layers                                             │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Layer 1: CORS (Response Reading Control)                  │
│    - Controls who can READ responses via JavaScript         │
│    - Set by the SERVER (bank, Google, Stripe)              │
│    - Browser enforces it                                    │
│                                                              │
│  Layer 2: Authentication                                     │
│    - Who are you? (API keys, tokens, cookies)              │
│    - Set by the SERVER                                       │
│    - Server validates it                                     │
│                                                              │
│  Layer 3: Authorization                                      │
│    - What can you do? (permissions, roles)                 │
│    - Set by the SERVER                                       │
│    - Server validates it                                     │
│                                                              │
│  Layer 4: CSRF Protection                                    │
│    - Is this request legitimate? (CSRF tokens)             │
│    - Set by the SERVER                                       │
│    - Server validates it                                     │
│                                                              │
│  ⚠️ CORS is just ONE layer                                  │
│  ⚠️ All layers work together                                 │
└─────────────────────────────────────────────────────────────┘
```

## Different Approaches, Different Reasons

**Bank: No CORS**

```
┌─────────────────────────────────────────────────────────────┐
│  Bank's Security Model                                      │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Data: Highly sensitive (account balances, transactions)    │
│  Authentication: Cookies (automatically sent by browser)     │
│  Risk: CSRF attacks if CORS allowed                        │
│                                                              │
│  Decision: No CORS                                         │
│    ✅ Prevents JavaScript from reading responses            │
│    ✅ Reduces attack surface                                │
│    ✅ Works with cookie-based auth                          │
│                                                              │
│  Trade-off:                                                  │
│    ❌ Can't build modern web apps that call bank API        │
│    ✅ But banks usually have their own apps anyway          │
└─────────────────────────────────────────────────────────────┘
```

**Google Maps: CORS with ***

```
┌─────────────────────────────────────────────────────────────┐
│  Google Maps Security Model                                 │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Data: Public (map tiles, geocoding)                        │
│  Authentication: API key (in URL or header)                │
│  Risk: Low (data is public anyway)                          │
│                                                              │
│  Decision: CORS with *                                       │
│    ✅ Anyone can use the API                                 │
│    ✅ Enables wide adoption                                  │
│    ✅ Data is public anyway                                  │
│                                                              │
│  Trade-off:                                                  │
│    ⚠️ Anyone can read responses                             │
│    ✅ But data is public, so that's fine                    │
└─────────────────────────────────────────────────────────────┘
```

**Stripe: CORS with * + Authentication**

```
┌─────────────────────────────────────────────────────────────┐
│  Stripe Security Model                                      │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Data: Sensitive (payment processing)                       │
│  Authentication: Secret keys (server-side only)             │
│  Risk: Medium (if secret keys leaked)                       │
│                                                              │
│  Decision: CORS with * + Strong Authentication             │
│    ✅ Allows shops to integrate easily                     │
│    ✅ Requires secret keys (server-side)                    │
│    ✅ Enables business model                                │
│                                                              │
│  Trade-off:                                                  │
│    ⚠️ CORS is open                                           │
│    ✅ But authentication provides security                   │
│    ✅ Defense in depth: CORS + Auth + Rate limiting        │
└─────────────────────────────────────────────────────────────┘
```

## Decision Factors

```
┌─────────────────────────────────────────────────────────────┐
│  What Influences CORS Decisions?                           │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  1. Data Sensitivity                                         │
│     - Sensitive (bank accounts) → No CORS                   │
│     - Public (maps, weather) → CORS with *                │
│     - Mixed (payments) → CORS + authentication              │
│                                                              │
│  2. Use Case                                                 │
│     - Internal tool → Specific origins only                  │
│     - Public API → CORS with * or specific origins         │
│     - Partner API → Specific partner origins                │
│                                                              │
│  3. Authentication Model                                     │
│     - Cookies → Often no CORS (CSRF risk)                   │
│     - API keys → CORS OK (keys server-side)                 │
│     - Tokens → CORS OK (tokens in headers)                  │
│                                                              │
│  4. Business Model                                           │
│     - Need adoption → Open CORS                             │
│     - Need security → Restricted CORS                     │
│     - Need both → CORS + strong auth                        │
└─────────────────────────────────────────────────────────────┘
```

## Key Insight

CORS doesn't provide security by itself - it's part of a security strategy. The decision depends on:

- **Data sensitivity** - How sensitive is the data?
- **Use case** - Who needs to access this?
- **Authentication model** - How will users authenticate?
- **Business needs** - Do we need wide adoption or maximum security?
- **Risk tolerance** - What's acceptable risk?

Each service makes its own decision based on these factors. There's no one-size-fits-all answer. CORS works together with authentication, authorization, CSRF protection, and other security layers to provide defense in depth.