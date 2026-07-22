# 03 · Intelligence — The Engines

Everything in this chapter is Kernel (deterministic math) unless marked
**Pilot** (AI judgment/language). The boundary is absolute: Pilot never
produces a number, the Kernel never produces a sentence.

## 1. Safe-to-Spend Engine

The atomic unit of the product. Not the balance — the truth.

```
SafeToSpend(t) =
    liquid_available(t)                  spendable balances + settled credit
  − committed_bills(t → payday)          rent, loans, utilities, known bills
  − predicted_bills(t → payday)          variable bills at chosen percentile
  − goal_contributions(t → payday)       per the goal priority stack
  − buffer_floor                         user's protected minimum
  − pending_reservations                 purchases "spent" via simulator
```

- **Percentile, not average:** predicted bills use the user's strictness
  setting (median / 65th / 80th percentile of history). Chill users see
  the likely case; strict users see the prudent case. Same engine.
- **Today's share** = SafeToSpend ÷ days-to-payday, front-loaded slightly
  (people spend more on weekends; the pace curve knows).
- **Reservations:** deciding to buy something in the simulator deducts it
  immediately, so the number never flatters you.
- Fully decomposable: every term expands to the transactions and rules
  behind it (the "Why?" sheet).

**Pilot's role:** phrasing state transitions ("tighter than usual this
week — the car service did it"), never the arithmetic.

## 2. Horizon — the financial timeline

A day-by-day projection of every account, 365 days out.

**Inputs:** confirmed recurring items (salary, rent, subscriptions),
predicted recurring items (variable bills with seasonal models),
goal-funding schedule, category pace models for everyday spend, staged
scenario changes.

**Output per day:** expected balance + 80% confidence band + event list.

- Recomputed incrementally in **< 16 ms** for interactive scrubbing;
  full rebuild on new data in < 1 s. Speed is a feature: the timeline
  must feel like terrain, not a report.
- **Honest uncertainty:** bands widen with distance; predicted events
  render hollow until confirmed. We never show a fake-precise future.
- **Dip detection** runs on every rebuild; a projected sub-zero (or
  sub-buffer) day more than N days out becomes a Signal with prepared
  fixes — the single highest-value moment in the product.

## 3. Purchase Simulator

Input: a thing and a price ("PS5 — 5,990 kr"), typed, spoken, pasted
from a product page, or long-pressed from anywhere.

The Kernel forks tomorrow's timeline, applies the purchase, and diffs:

| Output | Example |
| --- | --- |
| Verdict | **Yes, safely** / Yes, with trade-offs / Not now |
| Goal impact | Japan +4 days, Buffer unaffected |
| Cash-flow impact | lowest point drops 2,110 → 1,430 on 12 Aug |
| Risk dot | green / amber / red (distance to buffer at nadir) |
| Best date | "23 Aug — after payday, zero goal impact" |
| Alternatives | **Pilot:** used market price, cheaper equivalent, "wait for sale" patterns |

Decisions are actions: **[Spend it]** reserves it now; **[Wait for the
23rd]** sets a silent reminder that arrives with a fresh verdict.

## 4. Financial Digital Twin

The generalization of the simulator: a full simulation of the user's
financial life that can fork into persistent alternate worlds.

**Scenario primitives** (composable):
income change · new/removed recurring cost · one-time event · relocation
(rent + cost-of-living delta pack) · loan/mortgage (rate, term, fees) ·
household change (partner, child — with maternity/paternity pay models) ·
job loss (income → unemployment benefit curve) · investment contribution.

- Scenarios are **saved worlds** ("Move to Oslo", "Go 80%") that stay
  live: as real life updates the Ledger, saved scenarios re-simulate, so
  the answer to "could I still afford the move?" is always current.
- Any scenario draws as a ghost line on Horizon next to reality.
- **Stress test** (one tap): "If income stopped today, you're okay until
  **19 December** — 4.9 months." This single sentence, always current, is
  worth more than most finance apps in their entirety.

**Pilot's role:** translating natural language into scenario primitives
("what if we have a kid next year?" → income curves, cost pack, timeline)
and narrating the diff. The simulation itself is Kernel-only.

## 5. Pilot — the AI financial coach

Not a chatbot. A proactive advisor with a strict constitution:

1. **Never invents numbers.** Every figure links to a Kernel derivation
   (`Kernel ✓` chip).
2. **Speaks rarely.** One home card max; a few Signals a month. Silence
   is the default state and the proof of taste.
3. **Always actionable.** Every message carries its one-tap action or it
   doesn't ship.
4. **Never sells.** No product placement, no referral steering, ever.
5. **Tone: competent friend.** Never scolds, never cheerleads emptily,
   never says "oops!".

**Proactive patterns:**
- Surplus spotting: "Food is running 12% light — move 1,200 kr to Japan?"
- Timing counsel: "Wait 2 weeks on the laptop and your buffer stays intact."
- Anomaly narration: "This electricity bill is 40% over your winter normal."
- Pre-emptive fixes: dip warnings with prepared one-tap solutions.
- Reflection, monthly: three sentences that actually summarize the month,
  written from Kernel diffs — not a chart dump.

**Reactive:** natural-language search and questions over the user's own
data ("what did the cabin trip cost?"), simulation staging by
conversation, and "explain this like I'm tired" on any screen.

## 6. Goals that compete

Goals form a **priority stack** sharing one stream of surplus money.

- Funding order is the stack order; dragging re-dates every goal below,
  live. Consequence-first design — no sliders, no percentages homework.
- Each goal has a **funding rule**: steady (X/month) · surplus-first
  (whatever's left after higher priorities) · deadline-locked (Kernel
  back-solves the required pace and warns if it's unrealistic).
- **Pilot arbitration:** when goals conflict with reality ("Japan by
  March needs 3,100/mo; you average 2,400 of surplus"), Pilot proposes
  honest options: move the date, trim a category pace, or accept a
  lighter trip budget. The user always chooses; nothing silently slips.
- Buffer is a first-class goal, default rank 1, with gentle friction on
  deprioritizing it (one honest sentence, never a lecture).

## 7. Subscription Intelligence

Detection (Kernel + ML): recurrence mining across amount/merchant/period
patterns, including annuals and shifting dates.

| Detects | Action offered |
| --- | --- |
| Price increase | "Spotify 169 → 189 kr (+12%). [Simulate cancelling] [Fine]" |
| Duplicate coverage | **Pilot:** "iCloud + Google One — both storage. Keep one?" |
| Unused service | no matching usage-adjacent spend for 90 days → "Still using this?" |
| Trial ending | detected trial start → warning 48h before first charge |
| Annual renewal | 2 weeks' notice — when you can still act, not when it lands |

Every subscription shows its **year-cost** (169 kr/mo reads as harmless;
2,028 kr/yr reads as a decision) and its lifetime total. One tap
simulates cancellation on Horizon. Cancellation help = deep link +
country-specific instructions; we never charge a cut of savings
(that's Rocket Money's conflict of interest, and we refuse it).

## 8. Signals — notifications with a bar to clear

A notification ships only if it passes all three gates:

1. **Materiality:** the Kernel's projection changed beyond a threshold
   *for this user's volatility* (500 kr means different things to
   different lives).
2. **Actionability:** there is a one-tap response attached.
3. **Timing:** it arrives when acting is possible — renewal warnings two
   weeks out, dip warnings three weeks out, never at 2 a.m.

Examples that pass: "You can spend 300 kr more today — the dentist bill
came in under prediction." · "Vacation goal will land 18 days early." ·
"Next month goes negative unless spending drops 1,400 kr — here are two
fixes."

Examples that never ship: "You spent money at a restaurant!" · weekly
recap spam · "come back!" re-engagement pings. **Target: the average user
receives 4–8 Signals per month**, and each one is worth a screen-unlock.

## 9. Steady Score — financial health that explains itself

One number, 0–100, built from six sub-scores the user can open:

| Component | Weight | Measures |
| --- | --- | --- |
| Runway | 25 | months survivable at current burn if income stopped |
| Cash-flow margin | 20 | median monthly surplus ÷ income |
| Volatility | 15 | spending & income variance (stability of the system) |
| Debt pressure | 15 | non-mortgage debt service ÷ income, trend-aware |
| Goal momentum | 15 | funded-on-schedule ratio across the stack |
| Horizon risk | 10 | probability-weighted dips in the next 90 days |

- **Explains itself:** tap the ring → six bars, each with "why" and "the
  one thing that would improve this most" (Kernel-computed, Pilot-phrased).
- Moves **slowly by design** (EMA-smoothed) — a health metric, not a
  slot machine. Big moves generate a Signal explaining themselves.
- Never used to shame; sub-50 states switch the whole app's tone to
  triage-mode: shorter horizon, buffer-first framing, gentler Pilot.

## 10. Motivation system (gamification for adults)

No XP, no gems, no cartoon owl threats. We celebrate only things that are
*true*:

- **Green days:** a day where you stayed within your share. Streaks are
  acknowledged monthly, quietly — and a broken streak is *never*
  mentioned. (Loss-framing around money is how you build anxiety, and
  anxiety is the competitor.)
- **Milestones:** first full buffer month · goal funded · debt cleared ·
  Steady +10 held for 90 days · first year mapped. Each gets one
  beautiful full-screen moment (see motion principles) and, optionally, a
  shareable card that shows *shape, not amounts* — brag-safe.
- **The Annual Letter:** every January, Pilot writes you one page about
  your year — what you built, what you survived, what compounds next
  year. Designed to be kept. This replaces "spending wrapped" gimmicks
  with something people actually feel.

Psych rationale: variable rewards drive compulsion; **visible competence
drives return.** We build the second loop — check in, feel capable,
leave. Duolingo's streak works because it marks identity ("I'm someone
who shows up"); green days do the same for "I'm someone who's okay."

## 11. AI everywhere (the quiet kind)

| Capability | Where it lives |
| --- | --- |
| Transaction categorization | on-device model; corrections learn instantly, personal to the user |
| Merchant cleanup | "KLARNA*NETONNET4711" → NetOnNet, with logo |
| Recurrence & subscription detection | Kernel feature + ML classifier |
| Bill prediction | seasonal per-biller models (electricity knows winter) |
| Cash-flow pace models | per-category spend curves feeding Horizon |
| Receipt understanding | photo → line items → true category splits |
| Natural-language search & Q&A | Pilot over Ledger + Kernel, always with provenance |
| Scenario translation | plain language → Twin primitives |
| Anomaly detection | per-biller and per-category bands, phrased by Pilot |
| Summaries | monthly reflection, Annual Letter |

Rule of placement: AI is applied where it removes work or explains truth
— never as a destination feature, never as decoration.
