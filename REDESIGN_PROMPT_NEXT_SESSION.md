# Becxus Exchange — Structural UI/UX Redesign (Phase 2)

Paste this whole file as your first message in a new chat session.

## Context

Working directory: `c:\Users\mibrahim\Downloads\bec-main\bec-main`. Stack: Vite + React 18 + TypeScript + wouter + TanStack Query + Tailwind + shadcn/Radix + Supabase (auth/db) + Express. Git is initialized locally — if you commit, use a neutral identity (`git config user.name "exchange"` / `git config user.email "exchange@local.com"`), never a real name/email.

A prior session did Phase 1 of this redesign:
- Built a centralized design-token system: CSS variables in `client/src/index.css`, wired into `tailwind.config.ts` as `colors: { foreground: "hsl(var(--foreground))", ... }`. **The `hsl(...)` wrapper is required** — the CSS variables store bare HSL triplets (`0 0% 98%`, not `hsl(0 0% 98%)`) so opacity modifiers like `bg-primary/10` work. Omitting the wrapper silently breaks all text/background colors (this happened once already — every `text-foreground` rendered as invisible black-on-black — and was fixed; don't reintroduce it).
- Added an admin-editable dynamic exchange name and a 5-preset accent color picker (amber default, blue, violet, cyan, slate — registry in `shared/accent-themes.ts`, applied via a `data-accent` attribute on `<html>`), both editable at `/admin/settings` → Branding. `useExchangeName()` / `useAccentTheme()` hooks live in `client/src/hooks/use-exchange-name.ts`.
- Swept roughly 106 files converting hardcoded colors (`bg-blue-500`, `text-gray-400`, `#1e1e1e`, etc.) to semantic tokens: `bg-background` / `bg-card` / `bg-muted`, `text-foreground` / `text-muted-foreground`, `border-border`, `bg-primary` / `text-primary`, `bg-success` / `bg-danger` / `bg-warning` / `bg-info`, `bg-buy` / `bg-sell` (aliased to success/danger specifically for trading actions).

**That was a color/token pass, not a structural redesign.** It re-themed the existing DOM structure — same layouts, same component placement, same shapes, just different colors. The user's actual ask is a genuine visual and structural redesign: different button styles and placement, different field shapes, different page composition — not a recolor of the same skeleton. Don't repeat the mistake of treating this as a palette swap.

## What to build

### 1. Theme Kit first — get sign-off before touching real pages

Produce an actual visual reference (a published HTML style-guide artifact is a good format for fast iteration/approval) showing:

- **Color palette**: keep the existing dark-professional token system and the 5 accent presets as the source of truth — refine specific values if it helps the premium feel, but don't abandon the centralized-token approach that Phase 1 built.
- **Border radius — explicitly called out by the user**: fields should have visibly rounded edges. Phase 1 used a conservative `rounded-lg`/`rounded-xl` scale. Go more generous for inputs, buttons, and cards — e.g. `rounded-xl`–`rounded-2xl`, pill-shaped (`rounded-full`) where it suits (search inputs, toggle pills, badges). Update `--radius` in `client/src/index.css` and the `borderRadius` scale in `tailwind.config.ts` so this is centralized, not per-component overrides.
- Typography scale, spacing scale, shadow scale.
- Every button variant (primary/secondary/ghost/destructive/buy/sell) at real size with the new rounded treatment.
- Input/select/textarea/OTP field styles with the new rounded treatment.
- Card/table/badge/tab component treatments.

### 2. Structural redesign, not recoloring

For every page, actually change the layout — not just swap classNames on the existing JSX skeleton:

- Reconsider component placement: where buttons sit, how sections are grouped, card vs. list vs. table choices.
- Reconsider information hierarchy: what's prominent, what's secondary, what collapses.
- Reconsider shapes and spacing, not just colors.
- **Start with the Profile page** (`client/src/pages/profile.tsx`) — the user named this specifically as an example of "change all the things," not just recolor it. Genuinely rebuild its layout (header/avatar treatment, how settings sections are organized — tabs vs. accordion vs. sidebar nav, where actions live) before moving to other pages.
- Apply the same bar everywhere else: dashboard, markets, trading terminal, wallet, admin panel, every modal.

### 3. Everything from the original full-redesign brief still applies

Login through logout, every page/tab/modal/popup/drawer, every state (loading/empty/error/success), responsive behavior across mobile/tablet/desktop, accessibility (keyboard nav, focus states, contrast, reduced motion), preserve all existing functionality/business logic/API calls/routes/handlers exactly — this is a visual and structural redesign, not a rewrite of app logic.

## Ground rules

- Preserve all functionality, API calls, state, handlers, prop names — restyle/restructure JSX only.
- Use the existing semantic token classes; don't reintroduce hardcoded hex/gray/blue literals.
- A `GateGuard` pre-tool-use hook may block `Edit`/`Write` calls, asking you to present 4 facts (importers via Grep, affected functions, data shape, the user's verbatim instruction) before retrying. This is mandatory in this environment — answer it and retry the same call, don't skip the file.
- `node_modules` may or may not be installed — check before assuming; run `npm install` if needed to actually test locally.
- Don't commit to git unless explicitly asked.
- This is large. Get the Theme Kit approved first. Once approved, work through pages in logical batches — delegating disjoint file groups to parallel background agents (each briefed with the approved Theme Kit spec, the reference pages already redesigned, and the "preserve functionality" constraints) is what made Phase 1 tractable; the same pattern applies here.
