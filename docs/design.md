# Arc Lending — Official Design System: RawBlock

> **Source:** https://designmd.ai/chef/rawblock
> **Status:** Official — confirmed by user. Do NOT change without explicit request.
> **Previous style (replaced):** monopo saigon dark/gradient — no longer used.

---

## Philosophy

Brutalist. Functional. No decoration. Thick black borders replace depth and shadow. White canvas. Black type. Sharp edges everywhere. Numbers in monospace. Labels in uppercase.

---

## Colors

| Token | Value | Role |
|---|---|---|
| `#000000` | Black | Text, borders, button hover bg, table headers |
| `#ffffff` | White | Page background, card background, button default bg |
| `#999999` | Grey Mid | Muted text, disabled states |
| `#eeeeee` | Grey Light | Alternate table rows, disabled backgrounds |
| `#008000` | Success Green | Supply APY, positive health factor, success states |
| `#FFA500` | Warning Orange | Borrow APY, at-risk health factor |
| `#FF0000` | Error Red | Liquidation risk, error states |
| `#0000FF` | Info Blue | Links |

**No gradients. No opacity colors. No rgba backgrounds.**

---

## Typography

| Font | Usage | Weights |
|---|---|---|
| Archivo Black | All headings (h1–h3) | 400 (the font is inherently bold) |
| Work Sans | Body, labels, buttons | 400, 600 |
| Space Mono | All numbers, APY values, amounts, addresses | 400, 700 |

### Scale

| Role | Size | Weight | Case | Font |
|---|---|---|---|---|
| Page heading | 48px | — | UPPER | Archivo Black |
| Section heading | 28–32px | — | UPPER | Archivo Black |
| Card title | 13px | 600 | UPPER | Work Sans |
| Body text | 14–16px | 400 | Normal | Work Sans |
| Label/meta | 11–12px | 600 | UPPERCASE | Work Sans |
| Number/value | 14–36px | 700 | Normal | Space Mono |
| Button text | 12–14px | 600 | UPPERCASE | Work Sans |

---

## Spacing

Base unit: **8px**

| Token | Value |
|---|---|
| `--space-1` | 8px |
| `--space-2` | 16px |
| `--space-3` | 24px |
| `--space-4` | 32px |
| `--space-5` | 40px |
| `--space-6` | 48px |
| `--space-8` | 64px |

---

## Borders & Radius

- **All borders:** `4px solid #000000` (thick)
- **Thin borders:** `3px solid #000000`
- **Dividers:** `2px solid #000000`
- **Border radius:** `0` — SHARP EDGES EVERYWHERE
- **Exception:** Token logo icons use `border-radius: 50%` (DeFi convention only)
- **NO box-shadows** — borders create depth instead

---

## Components

### Buttons
```css
/* Default */
background: #ffffff; color: #000000; border: 4px solid #000000;
font: 600 13px Work Sans; text-transform: uppercase; letter-spacing: 0.08em;
border-radius: 0;

/* Hover → full invert */
background: #000000; color: #ffffff;
```

### Cards / Panels
```css
background: #ffffff; border: 4px solid #000000; border-radius: 0;
padding: 24px;
```

### Inputs
```css
background: #ffffff; color: #000000; border: 3px solid #000000;
font: 16px Work Sans; border-radius: 0; padding: 12px 16px;

/* Focus → invert */
background: #000000; color: #ffffff;
```

### Table Headers
```css
background: #000000; color: #ffffff;
font: 600 11px Work Sans; text-transform: uppercase; letter-spacing: 0.08em;
```

### Labels
```css
font: 600 11px Work Sans; text-transform: uppercase; letter-spacing: 0.08em;
color: #999999;
```

---

## Do / Don't

### DO
- Use `#ffffff` for all backgrounds
- Use `4px solid #000000` for card/panel borders
- Use Archivo Black for all page headings
- Use Space Mono for ALL numbers, amounts, APYs
- Uppercase + letter-spacing for ALL labels and button text
- Invert (black bg) on hover for all interactive elements
- Use `#008000`, `#FFA500`, `#FF0000` for status colors

### DON'T
- NO dark backgrounds (#000000 bg was previous rejected style)
- NO border-radius on any UI element (except token logo circles)
- NO gradients, NO frosted glass, NO backdrop-filter
- NO box-shadows or drop-shadows
- NO decorative elements (blobs, orbs, Three.js, Canvas)
- NO rounded buttons
- NO Inter, Roboto, or system-ui for branding text
