# Proof — Web Design Conventions

Building **Proof**, a bourbon drop tracking SaaS. Stack: Next.js 15, React 19, TypeScript, Tailwind CSS v4, Framer Motion. Auto-deployed from main branch.

## Project Structure

- `src/app/globals.css` — Design tokens (CSS vars), resets
- `src/app/layout.tsx` — Root layout, fonts, metadata
- `src/app/page.tsx` — Page composition
- `src/components/` — Reusable UI components
- `src/components/sections/` — Full-width page sections
- `src/lib/fonts.ts` — Font config
- `src/lib/animations.ts` — Reusable Framer Motion variants

**Rules:** All components are client (`"use client"`), PascalCase filenames, TypeScript interfaces. Sections go in `sections/`, reusable UI in `components/`, utils in `lib/`.

## Styling: Hybrid Approach

**Tailwind** for layout/spacing/flexbox/grid/responsive. **Inline `style={}`** for colors and fonts — always use CSS variables, never hardcode hex values.

```tsx
<div
  className="flex items-center gap-4 px-8 py-12 max-w-7xl mx-auto"
  style={{
    fontFamily: "var(--font-dm-sans)",
    color: "var(--color-text-secondary)",
  }}
>
```

See `CLAUDE-REFERENCE.md` for full token list and component catalog.

## CENTER EVERYTHING (Non-Negotiable)

Every section and page must be horizontally centered:

```tsx
<div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(20px, 5vw, 48px)" }}>
```

- Always include `margin: "0 auto"`
- Always set `textAlign: "center"` on headers explicitly
- Mobile: 20px+ padding on each side (375px screen)

## Adding a Section

1. Create `src/components/sections/MySectionName.tsx`
2. Pattern: eyebrow → h2 → subtitle → content
3. Wrap in `ScrollReveal` with staggered children
4. Import in `page.tsx`

## Adding a Page

1. Create `src/app/[route]/page.tsx`
2. Import `Navigation`, `Footer`, sections
3. Export metadata for SEO

## Design Philosophy

**Linear/Vercel/Stripe-tier design.** Premium, restrained, intentional.

- Amber is a highlight, not neon — use sparingly
- Glassmorphism is one tool, not the only one
- Mobile-first: every section must look designed at 375px, not just "fit"
- Copy should sound confident and intelligent, not casual
- If an element isn't earning its place, cut it

## Visual QA Loop — When Needed

**Only do this for major visual/layout changes** (new sections, redesigns, component updates). Skip for copy edits, data fixes, or non-visual code.

1. **Implement** changes
2. **Check desktop (1440px) and mobile (375px)** — centering, typography, spacing
3. **Critique:** Would this look out of place on Linear/Vercel/Stripe? Does it feel premium? Is it mobile-intentional?
4. **Fix** anything that fails
5. **Build + commit**

Example: Adding a new card type? Run the loop. Changing button copy? Skip it.

## Current Conventions

- **Fonts:** Playfair (headings), DM Sans (body/buttons/labels), JetBrains Mono (code/data)
- **Eyebrows:** Uppercase DM Sans, 12px, `0.15em` letter-spacing, amber — but vary by section for visual differentiation
- **Animations:** Use `fadeUpVariant`, `staggerContainer` from `lib/animations.ts`
- **Hover states:** `scale: 1.02` for cards, `0.98` tap, 0.25–0.8s durations

## Anti-Patterns

- No hardcoded hex values — always `var(--token-name)`
- No `<Image>` for backgrounds
- No Tailwind color classes
- No amber glow on everything
- No gradient text headings
- No separate CSS files per component
