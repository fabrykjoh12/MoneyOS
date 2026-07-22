# 05 · Architecture — Systems, Data, API, Security, Privacy

## Architecture at a glance

```
┌───────────────────────────── clients ─────────────────────────────┐
│  iOS · Android (native, shared Kernel via Rust core)  ·  Web      │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────────┐  │
│  │ UI (Swift/   │  │ KERNEL (Rust) │  │ Local store (SQLite)   │  │
│  │ Kotlin/TS)   │◄─┤ runs ON-DEVICE│◄─┤ event log + snapshots  │  │
│  └──────────────┘  └───────────────┘  └───────────┬────────────┘  │
└───────────────────────────────────────────────────┼───────────────┘
                                       encrypted sync (CRDT log)
┌───────────────────────────────────────────────────┼───────────────┐
│                          cloud                    ▼               │
│  Sync service   Connections service   Intelligence service       │
│  (log relay,    (Open Banking:        (Pilot LLM gateway,        │
│   households)    Tink/GoCardless/      categorizer training,     │
│                  Plaid/Neonomics)      bill-model fitting)       │
│  Postgres (event store) · queue (ingest) · KMS · zero-PII logs   │
└───────────────────────────────────────────────────────────────────┘
```

**The defining decision: the Kernel runs on-device.** One Rust core,
compiled for iOS/Android/WASM, executes every projection, simulation,
and Safe-to-Spend calculation locally. Consequences:

- **Speed:** Horizon scrubbing and Twin forking never touch the network
  → the < 16 ms interactivity budget is achievable.
- **Offline:** full app functionality without connectivity; only fresh
  bank data requires the network.
- **Privacy:** projections, scenarios, and goals — the most intimate
  data — can stay client-side encrypted; the server relays what it
  cannot read.
- **Trust:** one Kernel codebase means iOS, Android, and web can never
  disagree about your money.

## Data model — event sourcing

The Ledger is an **append-only event log**; all state is a projection of
it. Finance is the canonical event-sourcing domain: auditability for
free, "Why?" sheets derived from real provenance, and time-travel (the
Twin is literally "replay with modified events").

```
events (immutable)
  id ULID · household_id · actor · ts · type · payload JSONB · device_id · lamport

event types (excerpt)
  txn.observed        raw transaction from a connection
  txn.categorized     model or user categorization (user wins, both kept)
  commitment.detected recurring pattern found (bill/subscription/income)
  commitment.confirmed/dismissed
  goal.created / goal.reprioritized / goal.funded
  rule.set            buffer floor, strictness, funding order
  scenario.created / scenario.modified
  reservation.made    simulator "spend it"
```

**Read models (projections, rebuildable at any time):**
`accounts` · `transactions` (cleaned, categorized, merchant-resolved) ·
`commitments` (recurring items with period, confidence, next-date) ·
`goals` (stack order, funding state) · `horizon_cache` (per-day
projection rows) · `score` (Steady components).

Key schema notes:

- **Money is `(amount_minor BIGINT, currency CHAR(3))`** — integers in
  minor units, always. Floats never touch money.
- Multi-currency: amounts stored native, converted at display time with
  a rates table; Horizon projects per-currency and converts at the edge.
- **Households:** `household_id` scopes everything; members carry roles
  (owner / partner / view-only / teen). Sharing is per-scope: you can
  share the household pot while keeping personal accounts private —
  partners see the *contribution*, not the transactions, unless invited.
- Merchant knowledge base (global, non-personal) maps raw descriptors →
  clean merchants; personal corrections stay personal.

## Sync

- Client event log syncs via an **encrypted CRDT-ordered relay**
  (Lamport-stamped, last-writer-wins per field for rules, append-only
  for facts). Devices converge deterministically; conflicts are rare by
  construction because facts are immutable and only preferences merge.
- Offline-first: every write lands locally first; the app never blocks
  on the network for anything but fresh bank data.
- Household sync = shared event streams per scope, each member's key
  wrapping the scope key.

## Connections (Open Banking)

- **Aggregator abstraction layer** — one internal interface, multiple
  providers behind it (Tink & GoCardless for EU/Nordics, Neonomics for
  Norwegian depth, Plaid for US later). Provider failover per
  institution; we route each bank through whichever provider is most
  reliable for it, measured continuously.
- Ingest pipeline: fetch → normalize → dedupe (fingerprint on
  date+amount+descriptor windows) → enrich (merchant, geo) → emit
  `txn.observed` events → push to device → Kernel recomputes.
- Consent lifecycle is a first-class model: status, expiry (PSD2 90/180
  day renewals), and renewal prompts handled gracefully in-app — expired
  consent degrades to "data paused" state, never data loss or nagging.
- Manual accounts (cash, informal assets) are events like any other.

## Intelligence services

- **Categorizer:** small transformer distilled to run on-device
  (Core ML / TFLite); global model trained on opted-in, anonymized,
  aggregated corrections; personal fine-tuning stays on the device.
- **Bill models:** per-biller seasonal regressions fitted server-side on
  the user's own history (or on-device for supported hardware), shipped
  to the Kernel as coefficients — the Kernel stays deterministic.
- **Pilot:** LLM gateway with a hard contract: prompts contain Kernel
  outputs (structured JSON: derivations, diffs, anomalies), never raw
  credentials; responses must reference Kernel figures by id — the
  client renders numbers *from the Kernel data*, not from generated
  text, making numeric hallucination structurally impossible. Provider-
  agnostic gateway; no training on user data, zero-retention agreements.

## API structure

External surface is small and boring on purpose (GraphQL rejected:
financial APIs benefit from explicit, cacheable, auditable REST):

```
POST /v1/auth/…                         passkeys first, sessions, devices
GET  /v1/connections                    list bank links + consent status
POST /v1/connections                    start Open Banking flow
POST /v1/sync/events                    append client events (batch)
GET  /v1/sync/events?since=cursor       pull remote events
GET  /v1/rates?base=NOK                 FX rates
POST /v1/pilot/messages                 Pilot conversation (SSE stream)
POST /v1/pilot/feedback                 thumbs on Pilot output
GET  /v1/export                         full-fidelity data export (async)
DELETE /v1/account                      real deletion, cascading, receipted
```

Internally: services communicate over a queue (ingest) and gRPC
(synchronous); every service is stateless against Postgres + object
storage. Webhooks from aggregators land in the ingest queue. Idempotency
keys on every mutating call.

**Public API (later, Business tier):** read-only OAuth-scoped access to
projections and Safe-to-Spend — MoneyOS as a platform other tools build
on (the "OS" promise made literal).

## Scale posture

- Regional cells (EU first: data residency in EU/EEA; NO data can stay
  in-region) — a cell is Postgres + services + queue; households are
  pinned to a cell. Horizontal scale = more cells, no global state
  except auth directory and merchant KB.
- The heaviest compute (projections) runs on customers' devices — the
  cloud bill scales with *sync and ingest*, not with intelligence. This
  is an economic moat as much as a privacy one.

## Security

- **Authentication:** passkeys by default; TOTP fallback; per-device
  keys; new-device approval from an existing device.
- **App-level:** biometric lock, configurable auto-lock, discreet mode,
  screenshot redaction of amounts (opt-in), jailbreak/root heuristics
  degrade to read-only.
- **Encryption:** TLS 1.3 + certificate pinning in transit; AES-256 at
  rest server-side with per-household data keys in KMS; client event
  payloads for scenarios/goals/rules are **end-to-end encrypted** —
  the server relays but cannot read them.
- **Banking credentials never touch us:** OAuth/redirect flows happen
  with the bank via the aggregator; MoneyOS holds tokens, not passwords,
  and tokens are vaulted with hardware-backed KMS.
- **Read-only by design (v1):** no payment initiation, so compromise of
  MoneyOS cannot move money. Payment features, if ever added, get a
  separate consent, separate keys, and per-action biometrics.
- Practice: independent penetration tests before launch and annually;
  public vulnerability disclosure program; SOC 2 track from day one;
  zero-PII structured logging (ids only, amounts bucketed).

## Privacy — the covenant

Printed in the app, in plain language, and engineered to be true:

1. **We sell software, never data.** No ads, no data brokering, no
   "anonymized insights" products, no credit-offer kickbacks.
2. **Your future is unreadable to us.** Goals, scenarios, and rules are
   end-to-end encrypted; we couldn't sell them if we wanted to.
3. **Export everything, anytime** — full-fidelity event log, documented
   format, one tap. Your data is portable because it's yours.
4. **Delete means delete.** Immediate cascade, backups expire on a
   published schedule, deletion receipt issued.
5. **AI opt-outs that don't punish.** Pilot can be disabled entirely;
   the Kernel (all math) works fully without any cloud AI.
6. **Data map in Settings:** a living screen showing exactly what is
   stored, where, under which encryption, and which vendor touches it.
   GDPR compliance is the floor, not the goal.
