# OCBC Trust Layer — Style Reference
> Porcelain gallery, one red spark — a near-black nav bar hovers above a white room that warms to a soft slate wash, while every action and border stays in grayscale until a single OCBC red button confirms the moment.

**Theme:** light

Adapted from the Morflax structural system with the OCBC colour layer substituted. Measurements, type scale, radii and shadows are unchanged; only the chromatic layer differs. Verify `--color-ocbc-red` against your team's official brand asset before final submission — the value below is the commonly published OCBC red and may differ by a few points from the internal brand spec.

This system reads as a monochrome banking surface with a single red beacon: a near-black navigation bar floats above a porcelain-white canvas that is briefly washed in soft slate at the hero, then returns to a crisp neutral white for every content section. Colour is rationed — OCBC Red (#E4002B) earns its presence on exactly one filled action per viewport, while everything else (borders, body text, surfaces) is graded grays from #e5e7eb hairlines through #171718 ink. Typography pairs Inter's clinical neutrality at 400/500/600 with a wide-tracked eyebrow treatment (0.05em). Components are quiet and rounded: pill buttons, 16–24px card radii, soft 25px-blur shadows — the only visual noise comes from the 3D-rendered character and status cards, which carry the chromatic energy the interface refuses to.

A second, strictly separated scale carries verification status (supported / unsupported / conflicting / stale). It is desaturated and never used for branding, so a red flag can never be mistaken for a red button.

## Tokens — Colors

### Brand

| Name | Value | Token | Role |
|------|-------|-------|------|
| OCBC Red | `#E4002B` | `--color-ocbc-red` | Primary filled action, active tab indicator, brand accent — the sole chromatic voice in an otherwise monochrome system, so it must appear sparingly to retain its charge |
| OCBC Red Deep | `#B00021` | `--color-ocbc-red-deep` | Hover and pressed state of the primary action only — never used as a resting fill |
| OCBC Red Tint | `#FDEAED` | `--color-ocbc-red-tint` | Very light wash behind an active nav item or a selected row; never behind body text |

### Neutrals

| Name | Value | Token | Role |
|------|-------|-------|------|
| Obsidian Bar | `#333333` | `--color-obsidian-bar` | Navigation background — dark anchor that frames the light canvas below |
| Ink | `#171718` | `--color-ink` | Primary headings and body text — near-black with a barely-warm cast that softens against pure #000 |
| Carbon | `#25282b` | `--color-carbon` | Icon strokes, secondary text, UI graphics — a touch cooler than Ink for icon differentiation |
| Smoke | `#7c7e83` | `--color-smoke` | Muted helper text, secondary nav, inactive labels |
| Ash | `#a3a7ad` | `--color-ash` | Tertiary icon fills, disabled-state text, low-priority metadata |
| Frost | `#e5e7eb` | `--color-frost` | Hairline borders, card outlines, divider lines — the structural backbone of the grayscale system |
| Bone | `#f5f5f7` | `--color-bone` | Card surfaces, section backgrounds, subtle elevation — the off-white between pure white and Frost |
| Porcelain | `#ffffff` | `--color-porcelain` | Page canvas, button fills, card base — the default surface everything sits on |
| Shadow Veil | `#bfbfbf` | `--color-shadow-veil` | Soft shadow tint used in card and button drop-shadows to imply elevation without colour |

### Atmospheric

| Name | Value | Token | Role |
|------|-------|-------|------|
| Slate Wash | `radial-gradient(64.38% 210.53% at 35.62% 50%, #8296A6 0%, #5B7080 100%)` | `--gradient-slate-wash` | Hero background atmospheric tint — the muted blue-grey OCBC uses behind hero copy, which lets the red CTA sit on top without competing |

### Semantic — Verification Status

This scale is functional, not chromatic branding. Every status must also carry an icon and a text label; colour alone never conveys a verdict.

| Name | Value | Token | Role |
|------|-------|-------|------|
| Verified | `#1F7A4D` | `--color-status-verified` | Claim is supported by an approved source; high-confidence score ring |
| Verified Surface | `#EBF5EF` | `--color-status-verified-surface` | Background tint behind a supported claim highlight |
| Caution | `#B06C00` | `--color-status-caution` | Claim is weakly supported, or the source is stale; medium-confidence score ring |
| Caution Surface | `#FDF4E6` | `--color-status-caution-surface` | Background tint behind a flagged or stale claim highlight |
| Unsupported | `#A3243B` | `--color-status-unsupported` | Claim has no supporting source, or contradicts one; low-confidence score ring. Deliberately a muted, desaturated red, distinct from OCBC Red so a flag is never mistaken for an action |
| Unsupported Surface | `#FBEDEF` | `--color-status-unsupported-surface` | Background tint behind an unsupported or conflicting claim highlight |
| Unknown | `#7c7e83` | `--color-status-unknown` | No verdict yet — checks still running, or no source retrieved |

## Tokens — Typography

### Inter — All interface text — nav, buttons, body, subheads, and most headings; the 600 weight is reserved for emphasis, never used decoratively, and the tight -0.025em tracking on 48–72px display sizes is what makes headlines feel engineered rather than typed · `--font-inter`
- **Substitute:** Inter (Google Fonts)
- **Weights:** 400, 500, 600
- **Sizes:** 12, 14, 16, 18, 20, 24, 36, 48, 60, 72
- **Line height:** 1.00, 1.11, 1.33, 1.40, 1.43, 1.50, 1.56
- **Letter spacing:** -0.025em at 48–72px, -0.01em at 24–36px, 0 at body sizes
- **Role:** All interface text — nav, buttons, body, subheads, and most headings. The confidence score numeral uses the 72px display step at weight 600 with -1.8px tracking.

### Eyebrow — Wide-tracked label text — its defining move is the 0.05em positive tracking at modest sizes, which forces the type to read as caption-or-category rather than heading; appears as uppercase markers above content blocks and as the status label beside each claim flag · `--font-eyebrow`
- **Substitute:** Inter with text-transform: uppercase and letter-spacing: 0.05em
- **Weights:** 500
- **Sizes:** 12, 16
- **Line height:** 1.33, 1.50
- **Letter spacing:** 0.05em

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| caption | 12px | 1.4 | 0.6px | `--text-caption` |
| body-sm | 14px | 1.43 | 0px | `--text-body-sm` |
| body | 16px | 1.5 | 0px | `--text-body` |
| subheading | 20px | 1.4 | -0.2px | `--text-subheading` |
| heading-sm | 24px | 1.33 | -0.24px | `--text-heading-sm` |
| heading | 36px | 1.11 | -0.36px | `--text-heading` |
| heading-lg | 48px | 1.11 | -1.2px | `--text-heading-lg` |
| display | 72px | 1 | -1.8px | `--text-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px · **Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 80 | 80px | `--spacing-80` |
| 112 | 112px | `--spacing-112` |
| 160 | 160px | `--spacing-160` |

### Border Radius

| Element | Value |
|---------|-------|
| tags | 12px |
| smallCards | 16px |
| cards | 24px |
| buttons | 9999px |

### Shadows

| Name | Value | Token |
|------|-------|-------|
| xl | `rgba(0, 0, 0, 0.25) 0px 25px 50px -12px` | `--shadow-xl` |
| md | `rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px` | `--shadow-md` |

### Layout

- **Page max-width:** 1200px
- **Section gap:** 80px
- **Card padding:** 24px
- **Element gap:** 24px

## Components

### Top Navigation Bar
**Role:** Persistent dark header carrying the product name, primary links, and account actions

Full-width bar at #333333, 64–72px tall, white Inter 14–16px nav links (weight 500) at 24px gaps. Right side holds ghost text links and a white pill CTA with 9999px radius, 1px Frost border, Inter 14px weight 500. No drop shadow. The active nav item is marked by a 2px OCBC Red underline, never a red fill.

### Primary Filled Button
**Role:** Sole high-emphasis action — the only place OCBC Red appears as a fill

Background #E4002B, text #ffffff, Inter 14–16px weight 500, padding 12px 24px, border-radius 9999px, no border. Shadow `--shadow-md`. Hover shifts the fill to #B00021. Use sparingly — when more than one appears on a screen, the brand charge is diluted.

### Ghost Outlined Button
**Role:** Secondary action paired with a primary — the neutral companion to the red spark

Transparent background, 1px solid #e5e7eb on light sections (or #ffffff on dark/hero), text in matching tone, Inter 14–16px weight 500, padding 12px 24px, border-radius 9999px. No shadow.

### Character Panel
**Role:** The left-hand stats panel — holds the 3D character, the confidence score, and the plain-language explanation

24px radius, Bone (#f5f5f7) surface, `--shadow-xl`. The 3D character render fills the upper region edge to edge with no internal padding, exactly as the original system treats its product cards. Below it, the score numeral sits at the 72px display step in Ink, paired with an uppercase eyebrow label ("RELIABILITY · MEDIUM") in the status colour. The character render is the only place rich colour is allowed; the panel chrome stays grayscale.

### Confidence Score Block
**Role:** The large reliability figure and its verdict

Numeral in Inter 72px weight 600, -1.8px tracking, colour Ink (#171718) — never the status colour, which would make the number read as a brand element. Beneath it, a 4px-tall rounded progress track in Frost filled to the score percentage in the matching status colour. Beneath that, the verdict label in the eyebrow style, 12px, 0.05em tracking, uppercase, in the status colour. Plain-language explanation follows in Inter 14px weight 400, Smoke (#7c7e83), max-width 44ch.

### Claim Highlight
**Role:** Inline marking of a supported, unsupported, or conflicting claim inside the answer text

Background set to the matching status surface tint, 1px underline in the status colour, 4px horizontal padding, 12px radius. Body text colour never changes — it stays Ink. Each highlighted span carries a 12px status icon at its leading edge, so the verdict survives greyscale printing and colour-blind viewing. A "See details" eyebrow label sits above each paragraph in Smoke, 12px uppercase, turning Ink on hover.

### Source Chip
**Role:** A linked supporting source with its freshness state

Bone surface, 12px radius, 8px 12px padding. Document title in Inter 14px weight 500 Ink, then a separator dot, then the freshness note in 12px Smoke ("Last updated 14 months ago"). When the source is stale, the freshness note takes the Caution colour and a small clock icon precedes it. Never colour the whole chip.

### Check Row
**Role:** One of the six pipeline checks in the centre research tab

Full-width row, 16px vertical padding, 1px Frost bottom border. Left: check name in Inter 14px weight 500 Ink. Right: a status pill (12px radius, status surface background, status colour text, 12px eyebrow uppercase label) reading PASS, WARNING or FAIL. Expanding the row reveals the evidence passage in Inter 14px Smoke on a Bone surface at 16px radius.

### Eyebrow Label
**Role:** Tiny wide-tracked category marker above content blocks

Inter 12px weight 500, letter-spacing 0.05em, uppercase, colour Smoke (#7c7e83). Sits 8–12px above the heading it qualifies.

### Body Text
**Role:** Default paragraph and description copy

Inter 16px weight 400, Ink (#171718), line-height 1.5, max-width 65ch. Secondary copy uses Smoke at the same size.

## Do's and Don'ts

### Do
- Use OCBC Red (#E4002B) for exactly one filled action per viewport — its scarcity is what makes it feel switched on
- Keep the verification scale strictly separate from the brand scale; a status colour never appears on a button, and OCBC Red never appears on a flag
- Pair every status colour with an icon and a text label — colour alone never carries a verdict
- Apply 24px radius to all large panels and 16px to smaller cards; never square corners
- Set every button to 9999px radius — the pill shape is a system signature
- Reserve Inter weight 600 for headings, the score numeral, and active emphasis; body copy stays at 400 or 500
- Track display sizes (48–72px) at -0.025em and body sizes at 0
- Use the Slate Wash gradient only on the hero or the empty state; every other section stays on Porcelain or Bone
- Apply `--shadow-xl` to card-level surfaces only, never to inline elements

### Don't
- Do not introduce a third chromatic family — the system is monochrome, plus one brand red, plus one functional status scale
- Do not use OCBC Red for the Unsupported status; use the muted `#A3243B`, or a red flag becomes indistinguishable from a red button
- Do not use 0px border-radius anywhere — the system is built on rounded geometry
- Do not set body text below 14px or above 18px
- Do not place colour on body text — text colours are restricted to Ink, Carbon, Smoke, and Ash; status colour lives in labels, icons, borders and surface tints only
- Do not use OCBC Red as a background for cards, sections, or large surfaces — it is a button and accent only
- Do not mix #000000 and #171718 — use Ink for text, pure black only inside renders
- Do not add drop shadows to nav bars, body text, or inline links

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Porcelain | `#ffffff` | Page canvas, default content background |
| 1 | Bone | `#f5f5f7` | Card surface, subtle elevation above canvas |
| 2 | Frost | `#e5e7eb` | Hairline border layer, thin dividers |
| 3 | Obsidian Bar | `#333333` | Navigation bar — dark inversion of the light canvas |
| 4 | Slate Wash | `#5B7080` | Hero atmospheric background — temporary chromatic departure |

## Elevation

- **Character Panel / Card:** `0px 25px 50px -12px rgba(0, 0, 0, 0.25)`
- **Primary Button:** `0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)`

## Imagery

All visual energy is carried by the 3D-rendered character and any sculptural status objects: organic forms with soft, matte-to-iridescent shading. These renders are not decorative — they ARE the panel content, filling the full area with no surrounding border or padding. Where the original system used coral, violet and peach renders, this one biases the character's palette toward warm reds, bone whites and metallic grey so it reads as part of the OCBC family without borrowing the exact brand red. Icons are minimal: 16px monochrome line glyphs stroked at ~1.5px in Carbon or white, except status icons, which take their status colour. No stock photography, no lifestyle imagery, no illustration elsewhere.

## Layout

A max-width 1200px content column on a full-bleed white canvas. The working screen is a two-column split: the Character Panel occupies roughly 34% on the left and holds the score, explanation and sources; the conversation thread occupies the remaining 66% on the right. Clicking the character expands a centre research tab over the thread, listing the six Check Rows. The left panel has two states — overall answer, and a single claim's detail — with a persistent back control returning to overall. Section gaps of 80px apply to marketing or landing pages only; inside the app, 24px element gaps and 24px card padding govern.

## Agent Prompt Guide

**Quick Colour Reference**
- text: `#171718` (Ink), secondary `#7c7e83` (Smoke)
- background: `#ffffff` (canvas), `#f5f5f7` (card surface)
- border: `#e5e7eb` (Frost)
- primary action: `#E4002B` (OCBC Red — filled action only)
- nav background: `#333333`
- status: verified `#1F7A4D`, caution `#B06C00`, unsupported `#A3243B`, unknown `#7c7e83`

**Example Component Prompts**

1. **Character Panel:** 24px radius, `#f5f5f7` surface, shadow `0px 25px 50px -12px rgba(0,0,0,0.25)`. Top region filled edge-to-edge by a 3D character render, no padding. Below: Inter 72px weight 600 score numeral in `#171718`, -1.8px tracking; a 4px Frost progress track filled to the score in the status colour; an uppercase 12px eyebrow verdict label at 0.05em in the status colour; then Inter 14px weight 400 explanation in `#7c7e83`, max-width 44ch.

2. **Claim Highlight:** inline span, background `#FBEDEF`, 1px bottom border `#A3243B`, 12px radius, 4px horizontal padding, text stays `#171718`. A 12px status icon precedes the span. Above the paragraph, a 12px uppercase "SEE DETAILS" label at 0.05em in `#7c7e83`.

3. **Primary Filled Button:** background `#E4002B`, text `#ffffff`, Inter 14px weight 500, padding 12px 24px, radius 9999px, no border, shadow `0px 10px 15px -3px rgba(0,0,0,0.1), 0px 4px 6px -4px rgba(0,0,0,0.1)`. Hover `#B00021`.

4. **Check Row:** full-width, 16px vertical padding, 1px `#e5e7eb` bottom border. Left: Inter 14px weight 500 `#171718` check name. Right: status pill, 12px radius, status surface background, 12px uppercase status-colour label at 0.05em.

5. **Source Chip:** `#f5f5f7` surface, 12px radius, 8px 12px padding. Title Inter 14px weight 500 `#171718`, separator dot, freshness note 12px `#7c7e83` — switching to `#B06C00` with a clock icon when stale.

## Colour Discipline

The system is governed by a 1-red-to-N-grayscale ratio, with a functional status scale running alongside it on a separate track. OCBC Red may appear as a fill on exactly one primary action per viewport; everywhere else it is limited to a 2px active indicator or a hairline. The status scale never leaves labels, icons, 1px borders and surface tints — it never fills a button or a panel. Violating either rule collapses the hierarchy: a page of red buttons loses its call to action, and a status colour on a button makes the user think a warning is something to click.

## Radius System

Three radius tiers applied by component size, not by component type. Panels and large cards at 24px; smaller cards and image tiles at 16px; tags, chips and status pills at 12px. Buttons, pills and circular controls at 9999px. Never 0px, 4px or 8px.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Brand */
  --color-ocbc-red: #e4002b;
  --color-ocbc-red-deep: #b00021;
  --color-ocbc-red-tint: #fdeaed;

  /* Neutrals */
  --color-obsidian-bar: #333333;
  --color-ink: #171718;
  --color-carbon: #25282b;
  --color-smoke: #7c7e83;
  --color-ash: #a3a7ad;
  --color-frost: #e5e7eb;
  --color-bone: #f5f5f7;
  --color-porcelain: #ffffff;
  --color-shadow-veil: #bfbfbf;

  /* Atmospheric */
  --color-slate-wash: #5b7080;
  --gradient-slate-wash: radial-gradient(64.38% 210.53% at 35.62% 50%, #8296a6 0%, #5b7080 100%);

  /* Semantic — verification status */
  --color-status-verified: #1f7a4d;
  --color-status-verified-surface: #ebf5ef;
  --color-status-caution: #b06c00;
  --color-status-caution-surface: #fdf4e6;
  --color-status-unsupported: #a3243b;
  --color-status-unsupported-surface: #fbedef;
  --color-status-unknown: #7c7e83;

  /* Typography — Font Families */
  --font-inter: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-eyebrow: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 12px;
  --leading-caption: 1.4;
  --tracking-caption: 0.6px;
  --text-body-sm: 14px;
  --leading-body-sm: 1.43;
  --tracking-body-sm: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-subheading: 20px;
  --leading-subheading: 1.4;
  --tracking-subheading: -0.2px;
  --text-heading-sm: 24px;
  --leading-heading-sm: 1.33;
  --tracking-heading-sm: -0.24px;
  --text-heading: 36px;
  --leading-heading: 1.11;
  --tracking-heading: -0.36px;
  --text-heading-lg: 48px;
  --leading-heading-lg: 1.11;
  --tracking-heading-lg: -1.2px;
  --text-display: 72px;
  --leading-display: 1;
  --tracking-display: -1.8px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-80: 80px;
  --spacing-112: 112px;
  --spacing-160: 160px;

  /* Layout */
  --page-max-width: 1200px;
  --section-gap: 80px;
  --card-padding: 24px;
  --element-gap: 24px;

  /* Border Radius */
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-3xl: 24px;
  --radius-full: 9999px;

  --radius-tags: 12px;
  --radius-cards: 24px;
  --radius-buttons: 9999px;
  --radius-smallcards: 16px;

  /* Shadows */
  --shadow-xl: rgba(0, 0, 0, 0.25) 0px 25px 50px -12px;
  --shadow-md: rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px;

  /* Surfaces */
  --surface-porcelain: #ffffff;
  --surface-bone: #f5f5f7;
  --surface-frost: #e5e7eb;
  --surface-obsidian-bar: #333333;
  --surface-slate-wash: #5b7080;
}
```

### Tailwind v4

```css
@theme {
  /* Brand */
  --color-ocbc-red: #e4002b;
  --color-ocbc-red-deep: #b00021;
  --color-ocbc-red-tint: #fdeaed;

  /* Neutrals */
  --color-obsidian-bar: #333333;
  --color-ink: #171718;
  --color-carbon: #25282b;
  --color-smoke: #7c7e83;
  --color-ash: #a3a7ad;
  --color-frost: #e5e7eb;
  --color-bone: #f5f5f7;
  --color-porcelain: #ffffff;
  --color-shadow-veil: #bfbfbf;
  --color-slate-wash: #5b7080;

  /* Semantic — verification status */
  --color-status-verified: #1f7a4d;
  --color-status-verified-surface: #ebf5ef;
  --color-status-caution: #b06c00;
  --color-status-caution-surface: #fdf4e6;
  --color-status-unsupported: #a3243b;
  --color-status-unsupported-surface: #fbedef;
  --color-status-unknown: #7c7e83;

  /* Typography */
  --font-inter: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-caption: 12px;
  --leading-caption: 1.4;
  --tracking-caption: 0.6px;
  --text-body-sm: 14px;
  --leading-body-sm: 1.43;
  --tracking-body-sm: 0px;
  --text-body: 16px;
  --leading-body: 1.5;
  --tracking-body: 0px;
  --text-subheading: 20px;
  --leading-subheading: 1.4;
  --tracking-subheading: -0.2px;
  --text-heading-sm: 24px;
  --leading-heading-sm: 1.33;
  --tracking-heading-sm: -0.24px;
  --text-heading: 36px;
  --leading-heading: 1.11;
  --tracking-heading: -0.36px;
  --text-heading-lg: 48px;
  --leading-heading-lg: 1.11;
  --tracking-heading-lg: -1.2px;
  --text-display: 72px;
  --leading-display: 1;
  --tracking-display: -1.8px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-80: 80px;
  --spacing-112: 112px;
  --spacing-160: 160px;

  /* Border Radius */
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-3xl: 24px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-xl: rgba(0, 0, 0, 0.25) 0px 25px 50px -12px;
  --shadow-md: rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px;
}
```
