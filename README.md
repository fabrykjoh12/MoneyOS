# MoneyOS

**The financial operating system for your life.**

Most finance apps tell you what you already did.
MoneyOS tells you what you can safely do next.

One number, always live, always honest:

> **Safe to spend today — 4,280 kr** — until your next paycheck, with rent, bills, and your Japan trip already protected.

MoneyOS is not a budgeting app, a banking app, or a spreadsheet. It is a
deterministic simulation of your financial life — a **digital twin** of your
money — with a calm, premium interface on top and a proactive intelligence
layer that answers the questions people actually have:

- *Can I afford this?*
- *What happens if I buy it anyway?*
- *Will I still make my savings goal?*
- *What if I move? Lose my job? Have a kid?*
- *How much of my money am I actually free to use?*

## The vision, in one diagram

```
        ┌────────────────────────────────────────────┐
        │                 PILOT (AI)                 │   proactive coach, language,
        │  explains · suggests · simulates · warns   │   judgment — never math
        ├────────────────────────────────────────────┤
        │               KERNEL (engine)              │   deterministic, auditable
        │  Safe-to-Spend · Horizon · Twin · Score    │   math — never guesses
        ├────────────────────────────────────────────┤
        │               LEDGER (truth)               │   event-sourced record of
        │  accounts · transactions · commitments     │   everything that happened
        └────────────────────────────────────────────┘
```

The **Ledger** records reality. The **Kernel** projects it forward.
**Pilot** turns projections into plain language and timely nudges.
Every number in the app can explain itself, all the way down.

## Run the prototype

A working prototype of the app lives in this repo — the four screens (Today,
Horizon, Plans, Money), the Pilot overlay, and a real deterministic Kernel
(Safe-to-Spend with derivation sheets, a scrubbable 365-day Horizon
projection, the purchase simulator with reservations, competing goals that
re-date live when you drag them, subscription intelligence, Steady Score,
and natural-language ledger search) running on a generated demo ledger of
~7 months of Norwegian financial life.

```bash
npm install
npm run dev      # open the printed URL — best viewed as a phone-sized window
```

React + TypeScript + Vite, zero UI dependencies — the Norra design system
is hand-built in `src/styles.css`. The Kernel is pure TypeScript in
`src/kernel/` and runs entirely client-side, exactly as the architecture
doc prescribes. Light/dark themes (◐ in the header), discreet mode (◉),
and the "tap any number to see why" gesture all work.

## Documentation

| Doc | Contents |
| --- | --- |
| [00 · Manifesto](docs/00-manifesto.md) | Product philosophy and principles |
| [01 · Market](docs/01-market.md) | Competitive analysis and core differentiators |
| [02 · Experience](docs/02-experience.md) | Information architecture, navigation, flows, every screen, onboarding, empty states, settings |
| [03 · Intelligence](docs/03-intelligence.md) | Safe-to-Spend engine, Horizon timeline, Purchase Simulator, Digital Twin, Pilot coach, goals, subscriptions, notifications, health score, motivation system |
| [04 · Design System](docs/04-design-system.md) | Design language, color, typography, motion, iconography, accessibility |
| [05 · Architecture](docs/05-architecture.md) | Technical architecture, data model, API design, sync, security, privacy |
| [06 · Business](docs/06-business.md) | Roadmap, premium tiers, monetization, expansion, long-term vision |

## Principles (the short version)

1. **Forward, not backward.** The past is input; the future is the product.
2. **One honest number.** Everything reduces to what you can safely do next.
3. **Calm is a feature.** Reducing financial stress is the core metric.
4. **The math never lies.** Deterministic engine, explainable to the øre.
5. **AI narrates, never calculates.** Judgment from models, numbers from the Kernel.
6. **Privacy is the business model.** We sell software, never data.
