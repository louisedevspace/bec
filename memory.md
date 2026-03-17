# Becxus Theme System — Comprehensive Reference

## Overview

Becxus uses a **class-based dark/light theme system** built on Tailwind CSS with a two-tier color strategy:

1. **CSS Variables** (semantic tokens like `bg-background`, `text-foreground`) — used by ~1.5% of the codebase (mostly shadcn UI components)
2. **Hardcoded Hex Colors** (like `bg-[#0a0a0a]`, `border-[#1e1e1e]`) — used by ~98.5% of the codebase, remapped to light equivalents via CSS overrides

Dark mode is the **default theme**. Light mode is achieved by removing the `.dark` class from `<html>`.

---

## Core Architecture

### Theme Hook: `useTheme`

**File**: `client/src/hooks/use-theme.ts`

| Export | Type | Description |
|--------|------|-------------|
| `theme` | `'dark' \| 'light'` | Current theme string |
| `setTheme(t)` | Function | Set theme directly |
| `toggleTheme()` | Function | Toggle between dark/light |
| `isDark` | `boolean` | `theme === 'dark'` convenience flag |

**Mechanics**:
- Persists to `localStorage` key: `becxus-theme`
- Adds/removes `.dark` class on `document.documentElement`
- Updates `<meta name="theme-color">`: dark → `#0a0a0a`, light → `#f8fafc`
- Default: `'dark'` (if no stored value)

### FOUC Prevention

**File**: `client/index.html` (inline `<script>`, lines 54-60)

Synchronous script runs before React mounts — reads `localStorage('becxus-theme')` and adds `.dark` class to `<html>` unless value is explicitly `'light'`. This prevents a white flash on page load for dark mode users.

### Tailwind Configuration

**File**: `tailwind.config.ts`

- `darkMode: ["class"]` — class-based, not media-query
- All semantic colors reference CSS variables: `background`, `foreground`, `card`, `primary`, `secondary`, `accent`, `destructive`, `muted`, `border`, `input`, `ring`

### CSS Variables

**File**: `client/src/index.css`

**Light theme** (`:root`):
| Variable | HSL Value | Approx Hex | Usage |
|----------|-----------|-------------|-------|
| `--background` | `210 40% 98%` | `#f8fafc` | Page backgrounds |
| `--foreground` | `222 47% 11%` | `#1e293b` | Body text |
| `--card` | `0 0% 100%` | `#ffffff` | Card surfaces |
| `--border` | `214 32% 91%` | `#e2e8f0` | Borders |
| `--primary` | `217 91% 60%` | `#3b82f6` | Primary accent (blue) |
| `--muted` | `210 40% 96%` | `#f1f5f9` | Muted backgrounds |
| `--muted-foreground` | `215 16% 47%` | `#64748b` | Secondary text |

**Dark theme** (`.dark`):
| Variable | HSL Value | Approx Hex | Usage |
|----------|-----------|-------------|-------|
| `--background` | `0 0% 4%` | `#0a0a0a` | Page backgrounds |
| `--foreground` | `0 0% 98%` | `#fafafa` | Body text |
| `--card` | `0 0% 7%` | `#121212` | Card surfaces |
| `--border` | `0 0% 12%` | `#1f1f1f` | Borders |
| `--primary` | `217 91% 60%` | `#3b82f6` | Primary accent (unchanged) |
| `--muted` | `0 0% 10%` | `#1a1a1a` | Muted backgrounds |
| `--muted-foreground` | `0 0% 55%` | `#8c8c8c` | Secondary text |

---

## Dark Color Hierarchy (Hardcoded Hex)

The app uses a consistent progression of dark grays:

| Hex | Purpose | Approx Usage Count |
|-----|---------|-------------------|
| `#0a0a0a` | Deepest background (page level) | ~344 |
| `#0d0d0d` | Gradient endpoints | Minor |
| `#111` / `#111111` | Card/panel backgrounds | ~331 |
| `#141414` | Alternative surface | Minor |
| `#151515` | Alternative surface | Minor |
| `#161616` | Alternative surface | Minor |
| `#1a1a1a` | Hover backgrounds, secondary surfaces | ~318 |
| `#1e1e1e` | Borders (most common border color) | ~654 |
| `#222` | Active states, deeper hovers | ~52 |
| `#252525` | Alternative active states | Minor |
| `#2a2a2a` | Secondary borders, dividers | ~78 |
| `#3a3a3a` | Subtle borders (rare) | Minor |

**Total hardcoded color instances**: ~1,777+

---

## Light Mode CSS Override System

**File**: `client/src/index.css` (Lines 349-535)

**Strategy**: CSS selectors `html:not(.dark) .TAILWIND-CLASS` with `!important` remap dark colors to light equivalents. This approach avoids modifying every component — a single CSS file handles the conversion.

### Background Mappings

| Dark Class | Light Override | Light Hex |
|------------|---------------|-----------|
| `bg-[#0a0a0a]` | `#f8fafc` | Slate-50 |
| `bg-[#111]` / `bg-[#111111]` | `#ffffff` | White |
| `bg-[#111]/95` | `rgba(255,255,255,0.95)` | White 95% |
| `bg-[#1a1a1a]` | `#f1f5f9` | Slate-100 |
| `bg-[#151515]` / `bg-[#161616]` | `#f1f5f9` | Slate-100 |
| `bg-[#1e1e1e]` / `bg-[#222]` / `bg-[#252525]` | `#e2e8f0` | Slate-200 |
| `bg-[#0d0d0d]` / `bg-[#141414]` | `#f1f5f9` | Slate-100 |
| `bg-[#0a0a0a]/95` | `rgba(248,250,252,0.95)` | Slate-50 95% |

### Border Mappings

| Dark Class | Light Override |
|------------|---------------|
| `border-[#1e1e1e]` | `#e2e8f0` (Slate-200) |
| `border-[#2a2a2a]` | `#cbd5e1` (Slate-300) |
| `border-[#3a3a3a]` | `#94a3b8` (Slate-400) |
| `border-[#222]` | `#e2e8f0` (Slate-200) |
| `border-[#252525]` | `#cbd5e1` (Slate-300) |
| `border-[#1a1a1a]` | `#e2e8f0` (Slate-200) |

### Text Color Mappings

| Dark Class | Light Override | Light Hex |
|------------|---------------|-----------|
| `text-white` | `#0f172a` | Slate-900 |
| `text-gray-100` | `#1e293b` | Slate-800 |
| `text-gray-300` | `#334155` | Slate-700 |
| `text-gray-400` | `#475569` | Slate-600 |
| `text-gray-500` | `#64748b` | Slate-500 |
| `text-gray-600` | `#94a3b8` | Slate-400 |

### Hover State Mappings

| Dark Class | Light Override |
|------------|---------------|
| `hover:bg-[#1a1a1a]:hover` | `#e2e8f0` |
| `hover:bg-[#151515]:hover` | `#e2e8f0` |
| `hover:bg-[#222]:hover` | `#e2e8f0` |
| `hover:bg-[#252525]:hover` | `#e2e8f0` |
| `hover:bg-[#2a2a2a]:hover` | `#cbd5e1` |
| `hover:text-white:hover` | `#0f172a` |

### Gradient Mappings

| Dark Class | Light Override |
|------------|---------------|
| `from-[#111]` | `#ffffff` |
| `from-[#0a0a0a]` | `#f8fafc` |
| `from-[#0f0f0f]` | `#f1f5f9` |
| `from-[#1e1e1e]` | `#e2e8f0` |
| `to-[#0a0a0a]` | `#f8fafc` |
| `to-[#111]` | `#ffffff` |

### Special Rules

- **Colored backgrounds preserve white text**: `bg-blue-*`, `bg-red-*`, `bg-green-*`, etc. keep `color: #ffffff` even in light mode
- **Order-book rows**: Faint colored backgrounds (`bg-red-500/10`, `bg-green-500/10`) get `color: #334155` for readable text
- **Bottom navigation**: `nav.bg-[#0a0a0a]` → white background + light border
- **Loading screen gradient**: Special combined selector for gradient fix
- **Shadow overrides**: `shadow-black/40` → `rgba(148,163,184,0.15)`, `shadow-black/50` → `rgba(148,163,184,0.2)`

### Known Gaps (Not Covered by Overrides)

| Missing Color | Found In | Suggested Override |
|---------------|----------|-------------------|
| `bg-[#0b0b0b]` | `admin-news.tsx` | `#f1f5f9` |
| `border-[#333]` | `admin-news.tsx` | `#a0aec0` |

---

## Components Using `useTheme` Hook (Dynamic Theme)

Only **3 files** (out of ~373) import and use `useTheme` directly:

### 1. `client/src/components/layout/main-layout.tsx`
- Uses `isDark` for: desktop nav background, logo styling, brand text gradient, nav item active/hover states, separator color, notification bell styling, mobile top bar
- Pattern: Ternary in `className` — `isDark ? 'dark-classes' : 'light-classes'`

### 2. `client/src/components/trading/price-chart.tsx`
- Uses `isDark` for: TradingView chart background, grid colors, text colors
- Pattern: `getChartColors(isDark)` memoized function returns color palette object

### 3. `client/src/pages/profile.tsx`
- Uses `isDark` + `toggleTheme` for: theme toggle button UI in "Appearance" section
- Pattern: Moon/Sun icon swap, toggle switch animation, label text change

---

## Theme Toggle Location

**Only location**: Profile page → "Appearance" section (near bottom of page)
- Not in header/nav, not in admin panel, not in a settings modal
- Uses `toggleTheme()` from `useTheme` hook

---

## Components Without Dynamic Theme Support

These rely **entirely** on CSS overrides for light mode:

| Component | File |
|-----------|------|
| Admin Layout | `client/src/pages/admin-layout.tsx` |
| Bottom Navigation | `client/src/components/layout/bottom-navigation.tsx` |
| All modals | `client/src/components/modals/*` |
| All trading components | `client/src/components/trading/*` (except price-chart) |
| All pages | `client/src/pages/*` (except profile.tsx) |
| All crypto components | `client/src/components/crypto/*` |

---

## How to Make Theme Changes

### Adding Light Mode Support to a Component

**Option A: CSS Override (No JS changes)**
Add to `client/src/index.css` in the override section:
```css
html:not(.dark) .bg-\[\#NEW_HEX\] { background-color: LIGHT_EQUIVALENT !important; }
```

**Option B: `useTheme` Hook (Dynamic JS)**
```tsx
import { useTheme } from '@/hooks/use-theme';

function MyComponent() {
  const { isDark } = useTheme();
  return (
    <div className={isDark ? 'bg-[#111] text-white' : 'bg-white text-gray-900'}>
      ...
    </div>
  );
}
```

**When to use which**:
- **CSS Override**: Best for components using standard hardcoded hex colors that follow the existing pattern. Zero JS overhead. Works for most components.
- **useTheme Hook**: Required when CSS overrides can't handle the case — e.g., opacity modifiers (`bg-[#0a0a0a]/80`), complex gradients, or third-party library color configs (like TradingView charts).

### Adding a New Dark Color

1. Use an existing hex from the hierarchy (prefer `#0a0a0a`, `#111`, `#1a1a1a`, `#1e1e1e`, `#222`, `#2a2a2a`)
2. If it's already in the CSS override list, light mode works automatically
3. If using a new hex, add its override to `index.css`

### Fixing Light Mode Issues

Common causes:
- **Opacity modifiers** (`bg-[#0a0a0a]/80`): CSS override for `bg-[#0a0a0a]` won't match. Use `useTheme` hook instead.
- **Gradient with hardcoded colors**: Check if `from-[#HEX]` and `to-[#HEX]` have overrides.
- **Inline styles**: Not caught by CSS overrides. Must use `useTheme` hook.
- **New hex values**: Verify the hex is in the override list.

---

## PWA Theme Handling

| Item | Value | Notes |
|------|-------|-------|
| `manifest.webmanifest` → `background_color` | `#0a0a0a` | Static dark — doesn't adapt |
| `manifest.webmanifest` → `theme_color` | `#1E3A8A` | Blue primary — doesn't adapt |
| `<meta name="theme-color">` | Dynamic | Updated by `useTheme` hook |
| `<meta name="msapplication-TileColor">` | `#0a0a0a` | Static dark |

---

## Neon/Glow Effects (Theme-Aware CSS)

Defined in `client/src/index.css` with `.dark` scoping:

| Class | Light Mode | Dark Mode |
|-------|-----------|-----------|
| `.neon-bg` | Light gray gradient | Dark gradient |
| `.neon-glow-blue` | Subtle blue shadow | Bright blue glow + inset |
| `.neon-glow-purple` | Subtle purple shadow | Bright purple glow + inset |
| `.neon-text-glow` | No text-shadow | Blue triple text-shadow |
| `.neon-border-glow` | Subtle blue border | Bright blue border + glow |
| `.becxus-bg` | Light gray gradient | Dark gradient |
| `.gradient-bg` | Light gray gradient | Dark gradient |
| `.steel-gradient-bg` | Animated shimmer (works both) | Same animation |

---

## Admin Dialog Override

**Class**: `.admin-dialog` (in `index.css`, lines 232-249)

Forces light theme CSS variables for admin modals that render via React portals (outside the layout DOM tree). Applied as a className on admin dialog containers to ensure consistent white appearance regardless of global theme.
