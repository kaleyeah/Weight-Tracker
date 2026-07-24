# Compound Fitness — Native Bridge Architecture

**Version:** 1.0
**Status:** Proposed
**Scope:** The boundary between the PWA and the native iOS/Android wrappers. This document designs the **bridge contract and data flow first** — not screens.

---

## 1. Goals & Constraints

1. **The PWA is the product.** It owns 100% of the UI, navigation, and business logic and fills the entire screen edge to edge.
2. **The native shell is thin.** It handles only what the web platform cannot: OS permissions, background execution, and native-only APIs (HealthKit, Health Connect, push, Bluetooth, biometrics, camera).
3. **One clean boundary.** The web app never touches a native API directly. It talks to a single, small, versioned JavaScript bridge.
4. **Modular by construction.** Adding a future native capability (Apple Watch, Live Activities, CarPlay…) must require **new** native code and **new** web feature code — never edits to the transport, the wrapper, or existing capabilities.
5. **Runs everywhere.** The exact same web build must run in a plain desktop/mobile browser with **no bridge present** and degrade gracefully.

The design tension is real: "a *small* bridge" wants a handful of ergonomic methods, while "never touch web code again" wants something generic. We resolve it by **layering**: a single generic transport primitive at the bottom, with self-describing capabilities and thin typed façades on top. Adding a capability changes neither the transport nor the wrapper glue.

---

## 2. The Boundary — What Lives Where

| Concern | Native Shell | PWA |
| --- | --- | --- |
| Screens, navigation, charts, logging, AI chat, coach portal | | ✅ |
| Business logic, state, formatting, trend math | | ✅ |
| OS permission prompts (Health, notifications, Bluetooth, camera) | ✅ | requests via bridge |
| HealthKit / Health Connect reads & observers | ✅ | consumes via bridge |
| Background sync while app is suspended/killed | ✅ | consumes results |
| Push notification registration & token | ✅ | requests via bridge |
| Biometric unlock (Face ID / fingerprint) | ✅ | requests via bridge |
| Secure storage of native tokens / keys | ✅ | |
| Talking to the backend API | ✅ (background only) + ✅ (web, foreground) | ✅ |

**Rule of thumb:** the shell is a set of *drivers*. It exposes capabilities and emits events. It contains no product logic and no UI beyond a full-bleed WebView and a launch/splash screen.

---

## 3. The Transport — One Primitive

Everything crosses the boundary through a **single message channel** with a request/response + events envelope. Health, notifications, biometrics, and every future capability are just **string-addressed methods** on top of this one channel. That is what keeps the transport fixed while capabilities grow.

### 3.1 Injected surface

The native layer injects exactly one global before first paint:

```js
window.CompoundNative = {
  version: "1.0.0",       // bridge protocol version (semver)
  platform: "ios",        // "ios" | "android"
  invoke(method, params), // -> Promise<data>   (request/response)
  on(event, handler),     // -> unsubscribe fn   (native -> web push)
};
```

That is the **entire** injected API. It never grows when a capability is added.

### 3.2 Message envelopes

**Request (web → native)**

```json
{ "id": "c_42", "kind": "invoke", "method": "health.read", "params": { "types": ["heartRate"], "since": "2026-07-01T00:00:00Z" }, "ts": 1750000000000 }
```

**Response (native → web)**

```json
{ "id": "c_42", "kind": "result", "ok": true, "data": { "samples": [ ... ] } }
```

```json
{ "id": "c_42", "kind": "error", "ok": false, "error": { "code": "PERMISSION_DENIED", "message": "Health read not authorized", "details": { "type": "heartRate" } } }
```

**Event (native → web, unsolicited)**

```json
{ "kind": "event", "event": "health.sync.completed", "data": { "imported": 128, "at": "2026-07-24T12:00:00Z" } }
```

Envelopes are versioned by `CompoundNative.version`. A method may also carry its own capability version (§7).

### 3.3 Web-side implementation (`bridge.js`, ~80 lines, shipped in the PWA)

A tiny router owns correlation, timeouts, and event dispatch. Feature code never sees raw messages.

```js
// bridge.js — the ONLY module in the web app that knows the transport exists.
const pending = new Map();     // id -> { resolve, reject, timer }
const listeners = new Map();   // event -> Set<handler>
let seq = 0;

function nativeAvailable() {
  return typeof window.CompoundNative !== "undefined";
}

// Native calls this to deliver every result and event back to the web.
window.__compoundReceive = (msg) => {
  const m = typeof msg === "string" ? JSON.parse(msg) : msg;
  if (m.kind === "event") {
    (listeners.get(m.event) || []).forEach((h) => h(m.data));
    return;
  }
  const p = pending.get(m.id);
  if (!p) return;                       // late/duplicate — ignore
  clearTimeout(p.timer);
  pending.delete(m.id);
  m.ok ? p.resolve(m.data) : p.reject(Object.assign(new Error(m.error.message), m.error));
};

export function invoke(method, params = {}, { timeout = 15000 } = {}) {
  if (!nativeAvailable()) return Promise.reject(new BridgeUnavailable(method));
  const id = `c_${++seq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new BridgeTimeout(method));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    window.CompoundNative.invoke(method, params); // handed to native transport
  });
}

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export const isNative = nativeAvailable;
```

> Note: whether `CompoundNative.invoke` internally posts to `webkit.messageHandlers` / `@JavascriptInterface` (see §4) is a native detail. `bridge.js` only ever calls `invoke`/`on`. This is the seam that lets the same object be a real bridge or a no-op.

### 3.4 Native injection mechanics

- **iOS (WKWebView):** register a `WKScriptMessageHandlerWithReply` named `compound`. `CompoundNative.invoke` maps to `window.webkit.messageHandlers.compound.postMessage(...)`. Results/events are pushed back with `webView.evaluateJavaScript("window.__compoundReceive(\(json))")` on the main thread. Inject `CompoundNative` via a `WKUserScript` at `.atDocumentStart` so it exists before the app boots.
- **Android (WebView):** an `@JavascriptInterface` object bridges `postMessage(String json)`; push back with `webView.evaluateJavascript("window.__compoundReceive(...)", null)`. Prefer `WebMessagePort` (`postWebMessage`) where available for a structured channel. Inject `CompoundNative` via `WebViewCompat.addDocumentStartJavaScript`.

Both platforms therefore expose the **identical** `CompoundNative` shape. The web app cannot tell them apart except via `platform`.

---

## 4. Capability Model — How Modularity Actually Works

The transport routes by method **string**, so the set of methods is data, not code. Two mechanisms make new capabilities zero-touch for existing layers:

### 4.1 Native: a registry of modules

Each capability is a self-contained module conforming to one interface. The shell just holds a list.

```swift
protocol BridgeModule {
    var namespace: String { get }                 // e.g. "health"
    func handle(_ method: String,
                _ params: [String: Any]) async throws -> Encodable
    func capabilities() -> [Capability]            // [{ method, version }]
}

// The shell — this array is the ONLY thing that grows when you add a capability.
let modules: [BridgeModule] = [
    HealthModule(), NotificationsModule(), BiometricsModule(),
    // + WatchModule(), LiveActivityModule(), CarPlayModule() ... later
]
```

The router looks up `method`'s namespace prefix, dispatches to the module, and wraps the return in a `result`/`error` envelope. Adding `WatchModule` touches **only** that new file and the registry line — never the router, never the WebView glue, never another module.

### 4.2 Web: runtime capability discovery, not compile-time coupling

One reserved method is always present:

```json
// invoke("system.capabilities")  ->
{ "capabilities": [
    { "method": "health.read",       "version": "1.2.0" },
    { "method": "health.observe",    "version": "1.0.0" },
    { "method": "notifications.register", "version": "1.0.0" }
] }
```

The PWA fetches this once at startup and feature-detects:

```js
const caps = isNative() ? await getCapabilities() : new CapabilitySet([]);
if (caps.has("health.read")) enableHealthImport();   // otherwise the UI simply omits it
```

This is what lets **the same web build** run as a plain browser PWA (empty capability set → all native features hidden) and as the wrapped app (full set) with no branching beyond capability checks.

### 4.3 Thin typed façades (ergonomics without coupling)

Feature code shouldn't sprinkle magic strings. Each capability ships a ~10-line façade over `invoke`, co-located with the feature that uses it:

```js
// features/health/healthBridge.js
import { invoke, on } from "../../bridge.js";
export const Health = {
  read: (types, since)   => invoke("health.read", { types, since }),
  observe: (types)       => invoke("health.observe", { types }),
  onSync: (fn)           => on("health.sync.completed", fn),
};
```

Adding a capability = add a new façade file + the native module. **No existing file is edited.** That is the concrete meaning of "add native capabilities without touching web code": the transport (`bridge.js`), the native router, the WebView wrapper, and every prior capability all stay byte-for-byte unchanged.

---

## 5. Data Flow

Three canonical flows cover almost everything.

### 5.1 Permission request (web-initiated, foreground)

```
User taps "Connect Apple Health"  (PWA UI)
  -> Health.read(["heartRate","bodyMass"], since)
  -> invoke("health.authorize", { types })       [web -> native]
  -> HealthModule triggers the OS permission sheet
  -> result { granted: ["heartRate"], denied: ["bodyMass"] }
  -> PWA updates UI + persists which types are connected
```

The **native side never assumes**; it returns exactly what the OS granted so the PWA can explain the partial state (per the Vision's "explain everything" principle).

### 5.2 Foreground import (web-initiated pull)

```
PWA opens Progress screen
  -> Health.read(["heartRate"], since=lastCursor)
  -> HealthModule queries HealthKit, returns RAW samples
  -> PWA stores raw, computes derived metrics (zones, weekly volume) itself
  -> PWA syncs to backend via its normal authenticated API
```

Derived math lives in the **web app**, not native — so it can improve without an app-store release (Vision §"raw and calculated metrics should remain separate").

### 5.3 Background sync (native-initiated push) — the important one

While the app is suspended or killed, the WebView is not running, so the web app cannot be the one to sync. The native module does it directly:

```
OS wakes app in background (HKObserverQuery / Health Connect worker / BGTaskScheduler)
  -> HealthModule reads new samples since stored cursor
  -> HealthModule uploads RAW samples to the backend directly
       (using a token minted for background use; see §7)
  -> advances the cursor, reschedules the observer
  -> when the app next comes to foreground, emits event:
       "health.sync.completed" { imported, at }
  -> PWA hears the event and refreshes from the backend
```

**Design decision:** background sync goes **native → backend**, not native → web → backend, because the web layer may not be alive. The web is *notified*, not *depended upon*. This keeps data flowing without a foreground session and avoids losing samples.

---

## 6. Data Model Across the Boundary

- **Raw vs derived stay separated.** Native returns raw device samples; the PWA (and backend) own derived metrics. This matches the Vision doc and lets calculations evolve independently.
- **Cursors, not full dumps.** Every health read is incremental via a per-type `since` cursor held by whichever side last synced. Prevents re-import storms and duplicate handling.
- **Envelopes are additive-only.** New fields may be added; existing fields never change meaning within a major version (§7).
- **Native holds no product state.** No user profile, no plan, no history lives in the shell. If the shell is reinstalled, nothing product-level is lost — the backend is the source of truth.

---

## 7. Versioning & Compatibility

Because the web app updates continuously (PWA) but the native shell updates only through app-store review, the two **will** drift. The contract must tolerate it.

- **`CompoundNative.version`** — the transport/envelope semver. Rarely changes.
- **Per-capability `version`** — returned by `system.capabilities`. The web feature-detects both presence and minimum version: `caps.atLeast("health.read", "1.2.0")`.
- **Graceful degradation is mandatory:** if a capability is missing or too old, the PWA hides or downgrades that feature — it never crashes and never assumes native presence.
- **Background auth:** background sync uses a narrowly-scoped, refreshable token stored in the native secure enclave/keystore, not the web session cookie (which may be expired when the app is woken). Scope it to health ingestion only.

Compatibility matrix the web app must handle:

| Native shell | PWA | Behavior |
| --- | --- | --- |
| old | new | New feature detects missing capability → hidden until app update |
| new | old | Extra capabilities simply unused; envelopes additive → safe |
| absent (browser) | any | `isNative()` false → all native features hidden, app fully usable |

---

## 8. Errors, Timeouts, Offline

- Every `invoke` **rejects** on a structured error code (`PERMISSION_DENIED`, `UNAVAILABLE`, `RATE_LIMITED`, `TIMEOUT`, `UNSUPPORTED_METHOD`). Feature code maps codes to user-facing copy.
- Every `invoke` has a client-side **timeout** (default 15 s) so a wedged native handler can never hang the UI.
- **Offline is a web concern.** The PWA already handles offline via service worker + queue; the bridge does not try to solve networking. Background *sync* is the one exception and lives entirely in native.
- **Idempotency:** background uploads carry the sample's stable device id + timestamp so the backend can dedupe safely across retries.

---

## 9. Security

- The bridge is **allowlist-only**: the router rejects any `method` not owned by a registered module (`UNSUPPORTED_METHOD`). No arbitrary native reflection from JS.
- Load only the trusted first-party origin in the WebView; disable navigation to arbitrary URLs. Any third-party content renders in `SFSafariViewController` / Custom Tabs, never the bridged WebView.
- Health permissions are requested lazily and explained at the point of use (Vision §"Health Data Responsibility"), and the shell requests only the specific HealthKit/Health Connect types the user is enabling.
- Secrets (background token, push token) live in Keychain/Keystore and are never exposed to JS.

---

## 10. Adding a Future Capability — The Checklist

To prove the modularity claim, here is the *entire* footprint of adding, say, Live Activities:

**Native**
1. Add `LiveActivityModule.swift` conforming to `BridgeModule` (namespace `liveActivity`).
2. Add `LiveActivityModule()` to the `modules` array.

**Web**
3. Add `features/liveActivity/liveActivityBridge.js` (a ~10-line façade over `invoke`).
4. Use it in the new feature, guarded by `caps.has("liveActivity.start")`.

**Untouched:** `bridge.js`, the native router, the WebView wrapper, `system.capabilities`, and every existing capability. No transport change, no coordinated release required beyond shipping the native module before the web feature relies on it (enforced automatically by capability detection).

---

## Appendix A — Initial Capability Namespaces

| Namespace | Purpose (Phase 2) |
| --- | --- |
| `system` | `capabilities`, `platform`, `appVersion` |
| `health` | `authorize`, `read`, `observe`, background sync events |
| `notifications` | `register`, `schedule`, token events |
| `biometrics` | `available`, `authenticate` |
| `bluetooth` | `scan`, `connect`, `startWorkout` (later) |
| `secureStore` | `get`, `set` (native-only secrets) |

All of these are just strings routed through the one transport in §3.
