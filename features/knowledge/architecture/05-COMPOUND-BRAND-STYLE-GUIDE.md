# Compound Fitness Brand & UI Design System

**Purpose:** Recreate the Compound Fitness visual language inside another product or module without copying application-specific logic.

**Audience:** Claude Code or another implementation agent.

**Source of truth:** Current Compound Fitness production UI styles and theme tokens.

---

## 1. Brand Positioning

Compound Fitness is a **serious, calm coaching product**, not a gamified fitness tracker.

The interface should feel:

- disciplined
- precise
- trustworthy
- athlete-focused
- premium without looking luxurious
- technical without feeling clinical
- encouraging without being loud or childish

The product philosophy is:

> **Data → action. Trends over snapshots. Coaching over tracking.**

Avoid:

- neon fitness-app styling
- excessive gradients
- confetti or celebratory animations
- cartoonish badges
- mystery scores
- crowded dashboards
- overly rounded “toy” interfaces
- aggressive red/green financial-chart aesthetics
- fake glassmorphism everywhere

The visual identity should communicate:

> **Quiet confidence, accumulated effort, and measurable progress over time.**

---

## 2. Brand Name and Voice

### Product name

**COMPOUND**

The wordmark is typically uppercase with wide tracking.

Recommended wordmark styling:

```css
.brand-word {
  font-weight: 900;
  letter-spacing: 0.20em;
  text-transform: uppercase;
}
```

### Tagline

> **Strength · in reps · over years**

Use small uppercase or carefully tracked supporting text.

### Writing voice

Use:

- plain language
- direct instructions
- calm confidence
- short sentences
- honest system states
- athlete-facing terminology

Prefer:

- “Changes on this device”
- “Online copy”
- “Previous copy”
- “Saved”
- “Retry”
- “Needs attention”

Avoid:

- “Cloud reconciliation”
- “Data conflict resolution protocol”
- “Snapshot lineage”
- “Synchronization divergence”
- vague motivational slogans

---

## 3. Logo / Brand Mark

The Compound mark consists of **three ascending rounded vertical bars**.

They represent:

- repeated effort
- gradual progression
- compounding results
- long-term growth

### Canonical SVG

```html
<svg
  viewBox="0 0 100 100"
  width="32"
  height="32"
  aria-hidden="true"
>
  <rect x="12" y="56" width="22" height="28" rx="8" fill="#7C93F5"/>
  <rect x="39" y="40" width="22" height="44" rx="8" fill="#9FB0C9"/>
  <rect x="66" y="16" width="22" height="68" rx="8" fill="#F5B544"/>
</svg>
```

### Mark colors

| Bar | Color | Meaning |
|---|---:|---|
| Short | `#7C93F5` | baseline / beginning |
| Middle | `#9FB0C9` | accumulation |
| Tall | `#F5B544` | progress / focus |

Do not:

- tilt the mark
- place it inside a random circle
- add shadows to the bars
- recolor every bar with unrelated colors
- animate it continuously

---

## 4. Core Color System

Compound Fitness is primarily a dark interface.

### Dark theme tokens

```css
:root {
  --cf-bg: #0F1218;
  --cf-bg-subtle: #141922;

  --cf-surface: #1A2029;
  --cf-surface-raised: #212836;

  --cf-border: #2A3340;
  --cf-border-strong: #333E4E;

  --cf-text: #EDF1F7;
  --cf-text-muted: #8791A3;
  --cf-text-faint: #5A6474;

  --cf-accent: #F5B544;
  --cf-accent-soft: rgba(245, 181, 68, 0.14);
  --cf-on-accent: #20160A;

  --cf-success: #5CD6A0;
  --cf-success-soft: rgba(92, 214, 160, 0.12);
  --cf-on-success: #0C1A14;

  --cf-danger: #F26D5B;
  --cf-danger-soft: rgba(242, 109, 91, 0.15);

  --cf-info: #7C93F5;
  --cf-steel: #9FB0C9;

  --cf-macro-protein: #A9C0DE;
  --cf-macro-carbs: #7C9AC0;
  --cf-macro-fat: #566F92;
}
```

### Color roles

#### Background

`#0F1218`

Use for:

- application shell
- full-screen backgrounds
- sticky header base
- bottom navigation context

#### Secondary background

`#141922`

Use for:

- fields
- nested panels
- segmented-control tracks
- subtle inset surfaces
- progress-track backgrounds

#### Primary surface

`#1A2029`

Use for:

- cards
- modals
- sheets
- primary content containers

#### Raised surface

`#212836`

Use for:

- toast notifications
- elevated nested sections
- stronger visual separation
- hover/selected neutral states

#### Accent amber

`#F5B544`

This is the primary Compound color.

Use for:

- primary actions
- active navigation
- focused controls
- important projected values
- highlighted coaching information
- controlled warning states
- the tallest logo bar

Do not use accent amber on every surface. It should retain visual authority.

#### Success mint

`#5CD6A0`

Use for:

- completed
- synced
- within target
- positive trend
- successful validation

Do not use green for ordinary primary actions.

#### Danger coral

`#F26D5B`

Use for:

- destructive actions
- errors
- failed sync
- critical missing information
- unsafe training feedback

Do not use danger styling for routine reminders.

#### Periwinkle

`#7C93F5`

Use for:

- informational series
- regression/trend lines
- supporting brand elements
- vacation or alternate mode accents

---

## 5. Light Mode

The current Compound Fitness “Light” option is **not a complete light theme**.

It uses:

```css
--cf-bg: #E1E4EA;
```

while keeping most cards and controls dark.

This creates a light outer canvas with a dark application interior.

For faithful compatibility:

```css
[data-theme="light"] {
  --cf-bg: #E1E4EA;
  --cf-bg-subtle: #141922;
  --cf-surface: #1A2029;
  --cf-surface-raised: #212836;
  --cf-border: #2A3340;
  --cf-border-strong: #333E4E;
  --cf-text: #EDF1F7;
  --cf-text-muted: #8791A3;
  --cf-text-faint: #5A6474;
}
```

Do not invent a fully white/light component system and call it the existing Compound theme.

A true light theme may be created later as a separate design exercise.

---

## 6. Typography

### Primary UI font

Use the native system stack:

```css
--cf-font-sans:
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Roboto,
  system-ui,
  sans-serif;
```

This keeps the interface native-feeling and fast.

### Numeric / data font

```css
--cf-font-mono:
  ui-monospace,
  "SF Mono",
  "Cascadia Code",
  Menlo,
  Consolas,
  monospace;
```

Use the mono stack for:

- weight
- reps
- calories
- dates in compact rows
- trends
- chart labels
- synchronization status
- version numbers
- measurements
- counts

Do not use mono for paragraphs, instructions, or navigation labels.

### Optional display fonts

The existing app imports:

- Manrope
- Barlow
- Barlow Semi Condensed
- Nunito

However, most shipping UI uses the native system stack.

For a related module, default to the system stack unless there is a deliberate display-title treatment.

### Type scale

| Role | Size | Weight | Notes |
|---|---:|---:|---|
| Onboarding hero | `34px` | `800` | uppercase, tight line height |
| Hero metric | `42px` | `600` | mono |
| Page title | `24–28px` | `800` | use sparingly |
| Card title | `13–15px` | `700–800` | concise |
| Body | `14–16px` | `400–600` | line-height 1.45–1.55 |
| Button | `14px` | `700` | sentence case |
| Field input | `16px` | `400–600` | prevents mobile zoom |
| Label | `10–11px` | `600–700` | uppercase, tracked |
| Hint | `12px` | `400–500` | muted |
| Navigation | `9–10px` | `600` | paired with icon |
| Status / version | `9–11px` | `600–700` | mono |

### Eyebrows and labels

```css
.cf-eyebrow {
  color: var(--cf-accent);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.10em;
  text-transform: uppercase;
}
```

### Data values

```css
.cf-data-value {
  font-family: var(--cf-font-mono);
  font-variant-numeric: tabular-nums;
}
```

---

## 7. Spacing System

Use a 4px foundation with the following preferred values:

```css
:root {
  --cf-space-1: 4px;
  --cf-space-2: 6px;
  --cf-space-3: 8px;
  --cf-space-4: 10px;
  --cf-space-5: 12px;
  --cf-space-6: 14px;
  --cf-space-7: 16px;
  --cf-space-8: 20px;
  --cf-space-9: 24px;
  --cf-space-10: 32px;
}
```

Common Compound patterns:

- page horizontal padding: `20px`
- card padding: `16px`
- card stack gap: `14px`
- compact control gap: `6–10px`
- modal outer padding: `24px`
- section spacing: `14–20px`

Avoid extremely large empty areas. The interface should feel calm but information-efficient.

---

## 8. Radius System

```css
:root {
  --cf-radius-xs: 6px;
  --cf-radius-sm: 8px;
  --cf-radius-md: 10px;
  --cf-radius-lg: 12px;
  --cf-radius-xl: 16px;
  --cf-radius-sheet: 18px;
  --cf-radius-pill: 999px;
}
```

Typical usage:

| Element | Radius |
|---|---:|
| Small tag | `6px` |
| Input | `10px` |
| Button | `10px` |
| Nested panel | `12px` |
| Card | `16px` |
| Sheet | `18px` |
| Status chip | pill |

The style is rounded but not bubbly.

---

## 9. Borders and Elevation

Compound relies more on borders than heavy shadows.

### Standard border

```css
border: 1px solid var(--cf-border);
```

### Strong border

```css
border: 1px solid var(--cf-border-strong);
```

### Accent border

```css
border: 1px solid rgba(245, 181, 68, 0.45);
```

### Modal shadow

```css
box-shadow: 0 20px 60px rgba(0, 0, 0, 0.50);
```

### Sheet shadow

```css
box-shadow: 0 18px 50px rgba(0, 0, 0, 0.60);
```

Do not place strong drop shadows on every card.

---

## 10. Base CSS Foundation

Claude may use this as a starter:

```css
:root {
  --cf-bg: #0F1218;
  --cf-bg-subtle: #141922;
  --cf-surface: #1A2029;
  --cf-surface-raised: #212836;
  --cf-border: #2A3340;
  --cf-border-strong: #333E4E;
  --cf-text: #EDF1F7;
  --cf-text-muted: #8791A3;
  --cf-text-faint: #5A6474;
  --cf-accent: #F5B544;
  --cf-accent-soft: rgba(245, 181, 68, 0.14);
  --cf-on-accent: #20160A;
  --cf-success: #5CD6A0;
  --cf-success-soft: rgba(92, 214, 160, 0.12);
  --cf-danger: #F26D5B;
  --cf-danger-soft: rgba(242, 109, 91, 0.15);
  --cf-info: #7C93F5;
  --cf-steel: #9FB0C9;

  --cf-font-sans:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    system-ui,
    sans-serif;

  --cf-font-mono:
    ui-monospace,
    "SF Mono",
    "Cascadia Code",
    Menlo,
    Consolas,
    monospace;

  --cf-radius-sm: 8px;
  --cf-radius-md: 10px;
  --cf-radius-lg: 12px;
  --cf-radius-xl: 16px;
  --cf-radius-pill: 999px;
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html,
body {
  margin: 0;
  min-height: 100%;
}

body {
  background: var(--cf-bg);
  color: var(--cf-text);
  font-family: var(--cf-font-sans);
  -webkit-font-smoothing: antialiased;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}
```

---

## 11. Application Shell

Compound is mobile-first and narrow by design.

```css
.cf-shell {
  width: 100%;
  max-width: 720px;
  min-height: 100dvh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
}

.cf-main {
  flex: 1;
  padding: 0 20px 20px;
}

.cf-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
```

The module may be wider in a desktop host, but the content itself should remain disciplined and readable.

Recommended module content width:

```css
max-width: 720px;
```

---

## 12. Cards

### Standard card

```css
.cf-card {
  background: var(--cf-surface);
  border: 1px solid var(--cf-border);
  border-radius: 16px;
  padding: 16px;
}
```

### Card header

```css
.cf-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--cf-text);
  font-size: 13px;
  font-weight: 700;
}
```

### Nested card

```css
.cf-inset {
  background: var(--cf-bg-subtle);
  border: 1px solid var(--cf-border);
  border-radius: 12px;
  padding: 12px;
}
```

### Hero card

```css
.cf-card--hero {
  background:
    linear-gradient(
      150deg,
      var(--cf-surface-raised),
      var(--cf-surface)
    );
}
```

---

## 13. Buttons

### Base

```css
.cf-button {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  border: 0;
  border-radius: 10px;
  padding: 11px 16px;

  font-size: 14px;
  font-weight: 700;
  line-height: 1;

  transition:
    filter 150ms ease,
    border-color 150ms ease,
    background-color 150ms ease;
}
```

### Primary

```css
.cf-button--primary {
  background: var(--cf-accent);
  color: var(--cf-on-accent);
}

.cf-button--primary:active {
  filter: brightness(1.12);
}
```

### Ghost

```css
.cf-button--ghost {
  background: var(--cf-bg-subtle);
  color: var(--cf-text-muted);
  border: 1px solid var(--cf-border);
}
```

### Danger

```css
.cf-button--danger {
  background: var(--cf-danger-soft);
  color: var(--cf-danger);
  border: 1px solid rgba(242, 109, 91, 0.40);
}
```

### Destructive solid

```css
.cf-button--alert {
  background: var(--cf-danger);
  color: #FFFFFF;
}
```

### Link button

```css
.cf-link-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--cf-accent);
  font-size: 12px;
  font-weight: 600;
}
```

Do not use accent amber and danger coral interchangeably.

---

## 14. Inputs and Forms

### Field

```css
.cf-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.cf-field__label {
  color: var(--cf-text-faint);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
```

### Input

```css
.cf-input {
  width: 100%;
  min-height: 44px;
  padding: 11px 12px;

  background: var(--cf-bg-subtle);
  border: 1px solid var(--cf-border);
  border-radius: 10px;

  color: var(--cf-text);
  font-family: var(--cf-font-mono);
  font-size: 16px;
  outline: none;
}

.cf-input:focus {
  border-color: var(--cf-accent);
  box-shadow: 0 0 0 3px var(--cf-accent-soft);
}
```

Use the sans stack for prose inputs and the mono stack for measurements.

### Textarea

```css
.cf-textarea {
  min-height: 96px;
  resize: vertical;
  line-height: 1.5;
  font-family: var(--cf-font-sans);
}
```

### Hint

```css
.cf-hint {
  margin-top: 4px;
  color: var(--cf-text-muted);
  font-size: 12px;
  line-height: 1.45;
}
```

### Validation

Use borders and compact text. Do not shake fields.

```css
.cf-input[aria-invalid="true"] {
  border-color: var(--cf-danger);
  box-shadow: 0 0 0 3px var(--cf-danger-soft);
}
```

---

## 15. Segmented Controls

```css
.cf-segmented {
  display: flex;
  gap: 6px;
  padding: 4px;

  background: var(--cf-bg-subtle);
  border: 1px solid var(--cf-border);
  border-radius: 11px;
}

.cf-segmented__button {
  flex: 1;
  border: 0;
  border-radius: 8px;
  padding: 9px 6px;

  background: transparent;
  color: var(--cf-text-muted);
  font-size: 12.5px;
  font-weight: 700;
}

.cf-segmented__button[aria-selected="true"] {
  background: var(--cf-accent);
  color: var(--cf-on-accent);
}
```

---

## 16. Status Chips and Badges

### Neutral

```css
.cf-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;

  padding: 3px 8px;
  border: 1px solid var(--cf-border);
  border-radius: var(--cf-radius-pill);

  background: var(--cf-bg-subtle);
  color: var(--cf-text-muted);

  font-family: var(--cf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

### Status variants

```css
.cf-chip--success {
  color: var(--cf-success);
  border-color: rgba(92, 214, 160, 0.40);
}

.cf-chip--pending {
  color: var(--cf-accent);
  border-color: rgba(245, 181, 68, 0.40);
}

.cf-chip--error {
  color: var(--cf-danger);
  border-color: rgba(242, 109, 91, 0.40);
}
```

Suggested labels:

- Saved
- Pending
- Syncing
- Offline
- Needs attention

---

## 17. Progress and Metrics

### Hero number

```css
.cf-metric {
  font-family: var(--cf-font-mono);
  font-size: 42px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1;
}
```

### Progress track

```css
.cf-progress {
  height: 8px;
  overflow: hidden;

  background: var(--cf-bg-subtle);
  border: 1px solid var(--cf-border);
  border-radius: var(--cf-radius-pill);
}

.cf-progress__fill {
  height: 100%;
  border-radius: inherit;
  background:
    linear-gradient(
      90deg,
      var(--cf-accent),
      var(--cf-success)
    );
  transition: width 500ms ease;
}
```

### Trend pills

```css
.cf-change {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  padding: 7px 12px;
  border-radius: var(--cf-radius-pill);

  font-family: var(--cf-font-mono);
  font-size: 13px;
  font-weight: 700;
}

.cf-change--good {
  background: var(--cf-success-soft);
  color: var(--cf-success);
}

.cf-change--bad {
  background: rgba(242, 109, 91, 0.12);
  color: var(--cf-danger);
}
```

Positive and negative must be interpreted by the domain.

For weight loss, a downward trend might be positive. Do not assume “up = green.”

---

## 18. Alerts and Coaching Messages

### Informational / coaching highlight

```css
.cf-message--accent {
  padding: 12px 14px;
  border: 1px solid rgba(245, 181, 68, 0.42);
  border-radius: 12px;
  background: rgba(245, 181, 68, 0.07);
  color: #E8D5A9;
}
```

### Success message

```css
.cf-message--success {
  padding: 12px 14px;
  border: 1px solid rgba(92, 214, 160, 0.40);
  border-radius: 12px;
  background: rgba(92, 214, 160, 0.07);
  color: #A9E8CC;
}
```

### Error message

```css
.cf-message--danger {
  padding: 11px 13px;
  border: 1.5px solid var(--cf-danger);
  border-radius: 12px;
  background: rgba(242, 109, 91, 0.16);
  color: #FFD9D2;
  font-weight: 700;
}
```

Do not style ordinary coaching suggestions as errors.

---

## 19. Modals and Bottom Sheets

### Scrim

```css
.cf-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;

  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;

  background: rgba(0, 0, 0, 0.62);
}
```

### Modal

```css
.cf-modal {
  width: 100%;
  max-width: 360px;
  padding: 20px;

  background: var(--cf-surface);
  border: 1px solid var(--cf-border);
  border-radius: 16px;

  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.50);
}
```

### Sheet

```css
.cf-sheet-overlay {
  align-items: flex-end;
  padding: 14px;
  background: rgba(5, 7, 10, 0.72);
}

.cf-sheet {
  width: 100%;
  max-width: 520px;
  max-height: 82vh;
  overflow-y: auto;
  overscroll-behavior: contain;

  padding: 16px;

  background: var(--cf-surface);
  border: 1px solid var(--cf-border);
  border-radius: 18px;

  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.60);
}
```

Use an accent border only when the sheet represents Coach Max or a high-attention action.

---

## 20. Toasts

```css
.cf-toast {
  position: fixed;
  left: 50%;
  bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  z-index: 50;

  transform: translateX(-50%);

  padding: 10px 18px;
  border: 1px solid var(--cf-border-strong);
  border-radius: var(--cf-radius-pill);

  background: var(--cf-surface-raised);
  color: var(--cf-text);

  font-size: 13px;
  font-weight: 600;

  opacity: 0;
  pointer-events: none;
  transition:
    opacity 250ms ease,
    transform 250ms ease;
}

.cf-toast[data-open="true"] {
  opacity: 1;
  transform: translateX(-50%) translateY(-4px);
}
```

Toasts should confirm outcomes, not carry essential decisions.

---

## 21. Navigation

### Bottom navigation

```css
.cf-bottom-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;

  width: 100%;
  max-width: 720px;
  margin: 0 auto;

  display: flex;
  padding:
    8px 6px
    calc(8px + env(safe-area-inset-bottom, 0px));

  background: rgba(20, 25, 34, 0.94);
  border-top: 1px solid var(--cf-border);
  backdrop-filter: blur(12px);
}
```

### Navigation item

```css
.cf-nav-item {
  flex: 1;
  min-width: 0;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;

  padding: 4px 1px;
  border: 0;
  border-radius: 10px;

  background: none;
  color: var(--cf-text-faint);

  font-size: 9.5px;
  font-weight: 600;
}

.cf-nav-item[aria-current="page"] {
  color: var(--cf-accent);
}
```

Use simple outline icons with:

```text
2px stroke
round line caps
round line joins
```

---

## 22. Charts

### Chart palette

```css
:root {
  --cf-chart-grid: #252D3A;
  --cf-chart-axis: #5A6474;
  --cf-chart-actual: #AEB7C7;
  --cf-chart-actual-line: #6B7688;
  --cf-chart-average: #F5B544;
  --cf-chart-regression: #7C93F5;
  --cf-chart-goal: #5CD6A0;
}
```

Use:

- actual data: cool neutral
- average or forecast: amber
- regression: periwinkle
- goal: mint
- grid: low-contrast dark steel

Charts should:

- prioritize trend readability
- avoid unnecessary legends
- use mono labels
- keep grid lines subtle
- avoid 3D effects
- avoid bright rainbow series

---

## 23. Iconography

Use outline SVG icons with:

```text
stroke="currentColor"
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round"
```

Typical icon size:

- navigation: `19–20px`
- button: `16px`
- compact action: `14–17px`
- feature avatar: `24–34px`

Do not mix outline icons with glossy filled emoji-style icons.

---

## 24. Motion

Motion should be brief and functional.

Recommended timing:

```css
--cf-motion-fast: 150ms;
--cf-motion-standard: 250ms;
--cf-motion-slow: 500ms;
```

Use motion for:

- accordion chevrons
- toast entrance
- progress movement
- pull-to-refresh rotation
- subtle active feedback

Avoid:

- continuous decorative animation
- bouncing buttons
- exaggerated spring motion
- page transitions longer than 300ms

Pulse animation is acceptable only for genuinely active/in-progress states.

Respect reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 25. Responsive Rules

Compound is designed mobile-first.

### Primary breakpoint

```css
@media (max-width: 420px) {
  .cf-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cf-metric {
    font-size: 36px;
  }
}
```

### Desktop behavior

Do not stretch every card across the entire monitor.

Use:

```css
.cf-module {
  width: min(100%, 720px);
  margin-inline: auto;
}
```

For embedding in another dashboard, a two-column layout is acceptable above approximately `900px`, but individual cards should retain the Compound component language.

---

## 26. Accessibility

Minimum requirements:

- body text contrast should meet WCAG AA
- never communicate status through color alone
- minimum tap target: approximately `42 × 42px`
- use visible focus states
- inputs must have persistent labels
- icon-only buttons need accessible names
- destructive actions need explicit wording
- modal focus must be contained
- support keyboard activation
- support reduced motion
- preserve mobile safe-area insets

Recommended focus style:

```css
:focus-visible {
  outline: 2px solid var(--cf-accent);
  outline-offset: 2px;
}
```

---

## 27. Component Naming for the New Module

Do not copy the original `wl-` prefix into an unrelated project.

Use one of:

```text
cf-
compound-
module-name-
```

Recommended:

```text
cf-card
cf-button
cf-field
cf-chip
cf-modal
```

Keep brand tokens global only if the host project agrees.

Otherwise scope them:

```css
.compound-module {
  --cf-bg: #0F1218;
  /* ... */
}
```

---

## 28. React / Component Mapping

Suggested components:

```text
CompoundModuleShell
CompoundBrand
CompoundCard
CompoundMetric
CompoundButton
CompoundField
CompoundSegmentedControl
CompoundStatusChip
CompoundProgress
CompoundAlert
CompoundModal
CompoundSheet
CompoundToast
CompoundChartLegend
```

Do not create one-off styling for every screen. Reuse the primitives above.

---

## 29. Implementation Instructions for Claude

Claude should:

1. Create a scoped token layer using the values in this document.
2. Use the dark theme as the default.
3. Preserve the amber accent’s scarcity and authority.
4. Use system sans for normal UI and mono for measured data.
5. Implement reusable card, button, input, badge, modal, and status primitives.
6. Keep module content at or below `720px` unless the host layout specifically requires expansion.
7. Keep borders subtle and shadows limited to overlays.
8. Use sentence case for controls.
9. Use uppercase only for wordmarks, eyebrows, compact labels, and statuses.
10. Ensure every destructive state is visually and verbally explicit.
11. Treat the current light mode as a hybrid shell, not a full light redesign.
12. Avoid importing application-specific `.wl-*` selectors.
13. Avoid copying inline styles from the original application.
14. Do not introduce a new brand color without product approval.
15. Add visual regression examples for:
    - default card
    - primary and destructive buttons
    - input focus
    - status chips
    - success/warning/error messages
    - modal
    - mobile layout
    - reduced-motion mode

---

## 30. Minimal Example

```html
<section class="compound-module" data-theme="dark">
  <header class="cf-brand">
    <svg viewBox="0 0 100 100" width="28" height="28" aria-hidden="true">
      <rect x="12" y="56" width="22" height="28" rx="8" fill="#7C93F5"/>
      <rect x="39" y="40" width="22" height="44" rx="8" fill="#9FB0C9"/>
      <rect x="66" y="16" width="22" height="68" rx="8" fill="#F5B544"/>
    </svg>
    <span class="cf-brand__word">COMPOUND</span>
  </header>

  <div class="cf-card cf-card--hero">
    <div class="cf-eyebrow">Weekly trend</div>
    <div class="cf-metric">−1.2 <small>lb</small></div>

    <div class="cf-progress" aria-label="Goal progress">
      <div class="cf-progress__fill" style="width: 62%"></div>
    </div>

    <button class="cf-button cf-button--primary">
      Review plan
    </button>
  </div>
</section>
```

```css
.compound-module {
  color-scheme: dark;
  width: min(100%, 720px);
  margin-inline: auto;
  padding: 20px;

  background: var(--cf-bg);
  color: var(--cf-text);
  font-family: var(--cf-font-sans);
}

.cf-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.cf-brand__word {
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0.20em;
}
```

---

## 31. Final Visual Test

The module should pass this test:

> Could this interface sit inside Compound Fitness without looking like a separate startup built it?

It should feel:

- dark
- focused
- measured
- restrained
- data-literate
- athlete-first
- unmistakably amber-accented

It should not feel:

- flashy
- playful
- generic SaaS
- medical-record software
- bodybuilding-themed
- crypto-themed
- game-like

