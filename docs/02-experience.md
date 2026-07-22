# 02 · Experience — IA, Navigation, Flows, Screens

## Information architecture

The app has exactly **four places** plus one overlay. Not five tabs of
features — four answers to four questions:

```
MoneyOS
├── Today        "Am I okay right now?"          (home)
├── Horizon      "What's coming?"                (the future, 7–365 days)
├── Plans        "What am I building toward?"    (goals, commitments, twin scenarios)
├── Money        "Where does it all live?"       (accounts, transactions, subscriptions)
└── Pilot        (overlay, summonable anywhere)  "Explain / simulate / ask"
```

Everything in the product hangs off these four nouns. If a feature can't
find a home in one of them, it doesn't ship.

**Depth rule:** any piece of information is reachable in ≤ 2 taps from a
tab root. Anything deeper must instead be findable via search or Pilot.

## Navigation

- **Bottom bar, four items** (Today · Horizon · Plans · Money), text
  labels always on. No hamburger. No "More" tab.
- **Pilot orb** floats above the bar on the right — a small, quiet circle
  that occasionally breathes when it has something worth saying (never a
  numeric badge). Tap to open the Pilot sheet over any screen; long-press
  to talk.
- **Universal search** by pulling down on any root screen. Natural
  language: "restaurants in march", "netflix", "what did the cabin trip
  cost". Results are answers first, transactions second.
- **The "Why?" gesture:** tapping any number anywhere opens its
  derivation sheet. This is a global affordance, taught once in
  onboarding, and it is the app's signature interaction.
- **Simulate from anywhere:** long-press any transaction, subscription,
  goal, or bill → "What if…" (cancel it, repeat it, delay it, double it)
  → drops you into the Twin with that change staged.

## Screen-by-screen

### 1 · Today (home)

The eight-second screen. One number, huge, calm.

```
┌─────────────────────────────────┐
│  22 July                     ◉  │   ◉ = Steady Score ring (tap to open)
│                                 │
│  Safe to spend                  │
│                                 │
│  4,280 kr                       │   ← 64pt, tabular numerals
│  until payday · 9 days          │
│                                 │
│  ● today's share      340 kr    │   daily pace within the 9 days
│                                 │
│  ─ Up next ────────────────     │
│  Rent          12,400   1 Aug   │
│  Spotify          169  28 Jul   │
│  Electricity   ~1,150   4 Aug   │   ~ = predicted, tap for range
│                                 │
│  ─ Plans ──────────────────     │
│  Japan  ████████░░  on track    │
│  Buffer ██████░░░░  +400 this wk│
│                                 │
│  ✦ "Groceries are running 12%   │
│     light this month — you      │
│     could move 1,200 kr to      │
│     Japan."          [Do it]    │   ← Pilot card, max ONE, dismissible
└─────────────────────────────────┘
```

Details that matter:

- The Safe number **animates gently on open** — a 400 ms settle from the
  last-seen value, so change is felt, not hunted for.
- Color state lives in the number itself: ink (fine), amber (tight),
  never red on the home screen. Trouble is phrased as an actionable Pilot
  card, not an alarm.
- Pull down: search. Swipe left on the number: switch context between
  personal / household / any custom "pot".
- Tapping the number opens the **derivation sheet**:

```
Safe to spend = 4,280 kr
  Available across accounts        18,930
  − Bills before payday            −6,150
  − Committed to goals             −5,500
  − Buffer floor (your rule)       −3,000
```

### 2 · Horizon (the financial timeline)

The signature screen. Your next year as terrain you can scrub.

```
┌─────────────────────────────────┐
│  30d   60d   90d   180d  [365d] │
│                                 │
│      balance ────                │
│  ▂▃▅▆▅▄▆▇▆▅▃▂▃▅▆▇█▇▆▅▄▅▆▇       │   line + confidence band
│  ····▪·········▪······▪·····    │   ▪ = events (salary, rent, goal)
│  ────────────────────────── 0   │
│                                 │
│  ● 14 Aug — scrubber            │
│  Predicted balance   22,410 kr  │
│  ± 1,900 (80% confident)        │
│                                 │
│  That week: salary in, rent     │
│  out, Japan milestone 3 hits.   │
│                                 │
│  [＋ what if …]                 │
└─────────────────────────────────┘
```

- **Scrub** with a finger; the readout follows with haptic ticks on
  events. Pinch to change range.
- The band shows honest uncertainty: tight for the next 30 days, wider at
  365. Predicted items render hollow; confirmed items solid.
- Any staged Twin scenario draws as a **second ghost line** so present
  and alternate futures are visually comparable on one canvas.
- The dreaded moment — a dip below zero — is shown early, calmly, weeks
  out, with the fix attached: "Dips −850 on 12 Sep. Moving your savings
  transfer by 4 days clears it. [Fix it]".

### 3 · Plans (goals, commitments, scenarios)

Goals are a **ranked stack**, not a grid of jars — because real goals
compete for the same money, and pretending otherwise is why goal features
everywhere else are decorative.

```
┌─────────────────────────────────┐
│  Plans                          │
│                                 │
│  ≡ 1  Emergency buffer          │
│       ██████████░░  30,000/50k  │
│       funded first · Nov 2026   │
│  ≡ 2  Japan  🗾                 │
│       ████████░░░░  ready 12 Mar│
│  ≡ 3  New computer              │
│       ██░░░░░░░░░░  ready 3 Jun │
│                                 │
│  drag to reprioritize —         │
│  every date recalculates live   │
│                                 │
│  ─ Scenarios (Twin) ────────    │
│  “Move to Oslo”      saved      │
│  “Drop to 80% job”   saved      │
│  [＋ new scenario]              │
└─────────────────────────────────┘
```

- Dragging Japan above Buffer instantly re-dates everything below it —
  consequence, not configuration. A quiet caption notes trade-offs:
  "Buffer target slips 6 weeks."
- Each goal detail screen shows *its* mini-horizon, its funding rule, and
  Pilot's honest read ("At current pace you'll be 2 weeks early").
- **Scenarios** are saved Twin worlds (see [03 · Intelligence](03-intelligence.md)) —
  long-lived alternate futures you revisit as life decisions approach.

### 4 · Money (accounts, transactions, subscriptions)

The traditional stuff — deliberately one tab, deliberately last.

- **Accounts:** every connected account and card, net worth line at top.
  Balance is shown *with its committed/free split*, keeping the core
  mental model even here.
- **Activity:** a single merged feed, grouped by day, categorized
  automatically. No manual filing homework; corrections are one tap and
  teach the model. Receipts attach by photo and are parsed into line
  items.
- **Subscriptions:** the full intelligence surface — every recurring
  charge with trend arrows, price-rise flags, "unused?" inferences,
  trial-end countdowns, and per-item actions (remind me, help me cancel,
  simulate cancelling).

### 5 · Pilot (overlay)

Summoned from anywhere; arrives as a sheet, never a page-navigation.
Three modes in one surface:

1. **Briefing** — what changed since you last looked, in ≤ 3 cards.
2. **Ask** — natural language over your own data ("what did March
   restaurants cost", "when am I safe to book the flight?").
3. **Simulate** — type or say a scenario; Pilot stages it in the Twin and
   returns the verdict with a [see the math] link.

Every Pilot statement carries a tappable provenance chip: `Kernel ✓`.

## Key user flows

### Flow: "Can I afford this?" (the flagship, ≤ 10 seconds)
1. In a store, opens MoneyOS → Today already answers for small purchases
   (the number *is* the answer).
2. For bigger things: taps the Safe number → **[What if I buy…]** → types
   "PS5 5,990".
3. Verdict card in one second: **"Yes, safely."** Underneath: Japan slips
   4 days, buffer untouched, risk dot green, best time "now — or 23 Aug
   (post-payday) for zero goal impact", and a price note if Pilot has
   seen it cheaper.
4. One tap: [Spend it] (reserves it in today's math) · [Wait for 23 Aug]
   (creates a silent reminder) · [Close].

### Flow: morning glance (daily habit, 8 seconds)
Open → number settles → one Pilot card if anything matters → close.
No badge pressure, no feed. The habit forms because the answer is
instant and the feeling is calm.

### Flow: payday
Salary lands → Signal: "Payday. Your plan is applied: 6,150 to bills,
5,500 to goals, buffer topped up. Safe to spend until 25 Aug: 9,840 kr."
One tap to review, zero taps to accept. The user never "does" payday.

### Flow: incoming trouble
Kernel projects a below-zero dip 3 weeks out → Signal arrives *while it's
cheap to fix* → opens directly into Horizon at the dip date with three
prepared fixes (shift a transfer, trim a category pace, pause one goal
week) → one tap applies, ghost line confirms the dip is gone.

### Flow: reviewing a weird bill
Signal: "Electricity is ~40% above your winter normal." → bill detail
shows the seasonal band and this bill outside it → actions: [fine,
expected] (teaches the model) · [track it] · [help me check the meter
reading].

## Onboarding

**Goal: first "wow" in under 90 seconds. The wow is the Safe number.**

1. **One question, before anything:** "What does money stress feel like
   for you?" — three cards (running out before payday / big goals feeling
   impossible / just not knowing). Sets tone and initial Pilot voice.
   Skippable.
2. **Connect a bank** (Open Banking, ~30s). While consent completes, a
   soft animation explains the three-layer model in three lines.
3. **The reveal.** The Kernel ingests 12 months of history and the first
   thing the user ever sees is *their own* Safe number assembling itself,
   line by line — income found, bills detected, subscriptions found,
   buffer suggested — each line sliding in. This moment *is* the product
   demo, built from their real life.
4. **One decision only:** confirm the suggested buffer floor (slider,
   sensible default). Everything else — goals, rules, categories — is
   deferred to moments of natural relevance. No 12-screen setup wizard.
5. Gentle prompt for notifications, framed honestly: "We'll only message
   you when your future actually changes. A few times a month, usually."

**Manual-first fallback:** no bank connection (or unsupported bank) drops
into demo-with-your-numbers mode: type income, rent, and payday — the
Kernel runs on three inputs and still produces a real Safe number.
Accounts can connect later.

## Empty states

Empty states are **prompts to imagine, never blank apologies.**

- **No goals yet (Plans):** "What are you building toward?" over three
  ghosted example cards (Buffer · A trip · Big purchase) with real
  computed dates *from the user's own numbers*: "A 25,000 kr trip? At
  your current pace: ready in May." Tap a ghost to make it real.
- **Horizon, day one:** the projection renders immediately from detected
  income/bills, with a honesty caption: "Built from 12 months of your
  history. It sharpens as we learn your patterns."
- **No subscriptions detected:** "Nothing recurring found yet — either
  you're remarkably subscription-free, or they're hiding. We'll keep
  watching." (Charm over blankness.)
- **Pilot, never used:** shows three real, tappable questions generated
  from the user's own data, e.g. "Why is my Safe number lower this week?"

## Settings

Settings follow the "calm OS" rule: few, legible, honest.

```
Settings
├── You            profile, household members & roles, currencies
├── Money rules    buffer floor · payday cycle · goal funding order
│                  · Safe-to-Spend strictness (chill / balanced / strict)
├── Pilot          voice & frequency (quiet / standard / chatty) ·
│                  what Pilot may see · proactivity per topic
├── Signals        one master switch + per-signal-type toggles,
│                  each showing its real recent frequency
├── Connections    banks & institutions, consent status, renew/revoke
├── Privacy        data map ("what we store, where"), export everything,
│                  delete everything (real, immediate, no retention tricks)
├── Security       biometrics, app lock, discreet mode, trusted devices
└── Appearance     theme (light/dark/auto), app icon, number formatting
```

Notable choices:

- **Strictness** is the one personality knob for the Kernel: how much
  pessimism to bake into predictions (chill = median forecast, strict =
  20th percentile). One slider instead of thirty thresholds.
- **Discreet mode:** shoulder-surfing toggle (quick action from app icon)
  that blurs all amounts but keeps states and colors — usable on a train.
- Every toggle shows its consequence in plain words underneath, not a
  marketing euphemism.

## UX improvements over the state of the art

1. **Answers before data.** Every screen leads with a verdict; evidence
   is one tap below. Competitors lead with evidence and never render a
   verdict.
2. **"Why?" as a universal gesture** — no other finance app makes every
   number self-explaining.
3. **Zero-ritual budgeting.** No monthly zero-out ceremony, no category
   assignment homework. The engine maintains the plan; the user only
   makes decisions.
4. **Simulation as the primary verb.** Long-press anything → "what if".
5. **One Pilot card max** on the home screen. Insight scarcity is a
   feature: when MoneyOS speaks, it matters.
6. **Trouble arrives early and pre-solved.** Warnings ship with prepared
   fixes, converting anxiety spikes into two-tap resolutions.
7. **Eight-second sessions by design.** The app optimizes for confidence
   per second, not minutes per day.
