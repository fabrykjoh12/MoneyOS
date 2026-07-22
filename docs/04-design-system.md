# 04 · Design System — "Norra"

The design language is called **Norra** — Scandinavian restraint, Swiss
typographic discipline, and the material honesty of a well-made tool.
Reference points: Apple HIG rigor, Linear's density control, Arc's
personality-without-noise, Nothing OS's typographic nerve, Teenage
Engineering's warmth in minimalism.

**North star:** the app should feel like a calm instrument, not a
dashboard. If a screen looks impressive in a screenshot but noisy at
07:40 on a Tuesday, it's wrong.

## Design principles

1. **One thing per screen.** Every screen has exactly one primary element
   (usually a number). Everything else is subordinate by size, weight,
   and ink.
2. **Ink on paper.** Near-monochrome by default. Color is a *signal*,
   never decoration — when you see it, it means something changed.
3. **Numbers are the typography.** Financial software's real content is
   numerals; we treat them the way a type foundry would.
4. **Whitespace is confidence.** Emptiness reads as "everything is under
   control." Density reads as panic. We sell calm; the layout must ship it.
5. **Motion is meaning.** Nothing moves unless its movement encodes
   information (value changed, future forked, money flowed).

## Color

Two inks, two papers, one accent, three semantic signals. That's the
entire palette — the discipline *is* the brand.

### Light ("Paper")
| Token | Hex | Use |
| --- | --- | --- |
| `paper` | `#FAF9F7` | app background (warm off-white, never pure white) |
| `surface` | `#FFFFFF` | cards, sheets |
| `ink` | `#141414` | primary text & numerals |
| `ink-2` | `#6E6A64` | secondary text |
| `line` | `#E8E5E0` | hairlines (0.5 pt) |
| `accent` | `#2E5C4D` | **North Green** — actions, progress, the brand |
| `signal-good` | `#3E7C5B` | confirmed positive change |
| `signal-tight` | `#B0813C` | caution (a muted ochre, not alarm-orange) |
| `signal-risk` | `#A84A3F` | genuine risk only (an earthy red, used ~never) |

### Dark ("Slate")
`#111210` background, `#1A1B19` surfaces, `#F2F1EE` ink, same accent
family lifted for contrast (`#4C8A72`). Dark mode is a first-class
design, not an inversion — hairlines glow slightly instead of darken.

Rules: risk-red may appear on **at most one element per screen**. No
gradients on data. No color-coded category rainbows — categories are
distinguished by icon and text, because a rainbow pie chart is the
fastest way to look like every app we refuse to be.

## Typography

Two families, both with proper tabular figures:

- **Display & numerals — "Nord Grotesk"** (custom, or Söhne/ABC Diatype
  class as interim): a quietly confident grotesque with a custom
  `tnum` set. The Safe number is the logo; it deserves bespoke drawing.
- **Text — Inter** (UI text, high legibility at small sizes).

| Style | Size / weight | Use |
| --- | --- | --- |
| Hero number | 64 pt / 500, tabular | Safe to Spend |
| H1 | 28 / 600 | screen titles |
| Number-L | 22 / 500 tabular | balances, verdicts |
| Body | 16 / 400 | prose, Pilot |
| Label | 13 / 500, +0.4 tracking, small caps feel | section labels |
| Caption | 12 / 400, `ink-2` | provenance, dates |

Numeric conventions: **tabular lining figures everywhere**; decimals at
60% opacity in hero contexts (4,280<sup>,00</sup>); currency symbols set
smaller and lighter than digits; negative values use the proper minus
(−), never a hyphen. Norwegian/European number formatting respected per
locale.

## Motion

Motion budget: **≤ 2 animated elements at once.** Everything obeys four
named curves:

| Curve | Spec | Use |
| --- | --- | --- |
| `settle` | spring, ~400 ms, no overshoot | numbers arriving at truth (the signature move — the Safe number lands like a fine scale settling) |
| `slide` | 250 ms, ease-out-quint | sheets, navigation |
| `breathe` | 3 s sine loop, ±3% opacity | Pilot orb when it has something to say |
| `flow` | 600 ms particle-less path | money moving (goal funded, transfer applied) — value visibly *travels* from source to destination |

- Numbers **count** to new values (200–400 ms, odometer-style on the
  changing digits only) — change is perceived, not discovered.
- Scrubbing Horizon: zero-latency tracking, haptic detents on events
  (light tick), a deeper tick crossing a payday.
- Milestone moments: one full-screen composition, 1.5 s, ink-and-accent,
  typographic (the number itself celebrates) — no confetti, ever.
- All motion honors reduced-motion settings with opacity crossfades.

## Iconography

- Custom set, **1.75 pt stroke, rounded caps, 24×24 grid**, drawn to feel
  like the type (same "pen").
- Financial metaphors without clichés: no piggy banks, no dollar bags, no
  rockets. Horizon is a landscape line; Buffer is a filled base layer; a
  goal is a flag on terrain.
- Category icons are monochrome ink; color never encodes category.
- The app icon: North Green field, a single ink horizon line — quiet on a
  home screen full of shouting fintech gradients. Alternate icons
  (Slate, Paper, Solstice) for personalization; a **discreet icon**
  ("Weather-like, unlabeled") for privacy-conscious users.

## Components (excerpt)

- **Number Sheet** ("Why?"): the derivation view — a receipt-like
  breakdown, hairline rules, monospace-adjacent alignment. The signature
  component.
- **Verdict Card:** verdict line (H1) → three consequence rows → risk dot
  → actions. Used by simulator, Signals, Pilot.
- **Ghost Line:** dashed 60%-opacity projection overlay for Twin
  scenarios on any chart.
- **Pace Bar:** goal progress with a subtle "expected today" notch —
  progress is always shown *against plan*, not against zero.
- **Pilot Card:** one per screen max; accent hairline on the left edge;
  always ends in one action + dismiss.

## UI improvements over the state of the art

1. Hero-number layout with derivation-on-tap — no fintech app makes its
   headline figure interrogable.
2. Confidence bands drawn honestly (hollow predictions, widening bands)
   instead of fake-precise single lines.
3. Two-color discipline in a category addicted to gradient noise.
4. Odometer value transitions so *change itself* is the display.
5. Discreet mode + discreet app icon — privacy as UI, not just policy.
6. Terrain metaphor (horizon, buffer-as-ground, goals-as-flags) giving
   the whole app one coherent visual story instead of chart soup.

## Accessibility

- **Contrast:** all text ≥ WCAG AA on both papers; hero numerals ≥ 7:1.
  Semantic colors are never the sole carrier — every state pairs color
  with a word or glyph (tight = ochre **and** "tight").
- **Type scales** to 200% without truncation; hero number reflows to two
  lines gracefully; full Dynamic Type support.
- **Screen readers:** every chart has a sentence equivalent maintained by
  the Kernel ("Balance stays above 8,000 kr until 12 September, dips to
  1,430, recovers at payday"). The Horizon scrubber exposes events as an
  adjustable list. The "Why?" sheet is inherently linear and reads
  beautifully.
- **Motor:** all targets ≥ 44 pt; drag-to-reprioritize goals has a
  button-based alternative; scrubbing has date-stepper fallback.
- **Cognition:** plain-language mode is the *default* (jargon is the
  accessibility failure of finance); numbers-to-words option ("about
  four thousand"); triage mode simplifies further under financial stress
  — the moment users most need clarity is the moment apps usually add
  red everywhere.
- Haptics mirror meaning (detents, settles) but never carry meaning alone.
