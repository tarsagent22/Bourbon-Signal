# Proof — Web Design Skill

You are working on **Proof**, a bourbon drop tracking SaaS. Read this fully before writing any code.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion · Lucide React · Zustand · Deployed on Vercel (auto-deploy from main — just push, no manual steps).

## File Structure

- `src/app/globals.css` — Design tokens (CSS vars), resets, keyframes
- `src/app/layout.tsx` — Root layout, fonts, metadata
- `src/app/page.tsx` — Page composition (imports + orders sections)
- `src/components/` — Reusable UI: `Button`, `GlassCard`, `Badge`, `SectionHeading`, `ScrollReveal`, `StatCard`, `Navigation`, `Footer`
- `src/components/sections/` — Full-width page sections (e.g. `HeroSection.tsx`, `PricingSection.tsx`)
- `src/lib/fonts.ts` — Google Fonts config (Playfair Display, DM Sans, JetBrains Mono)
- `src/lib/animations.ts` — Reusable Framer Motion variants

**Rules:** Every component uses `"use client"`, PascalCase filenames, default exports, TypeScript interfaces for props. New sections go in `sections/`, new reusable UI in `components/`, new utils in `lib/`.

## Design Tokens

All colors and fonts are defined as CSS custom properties in `globals.css`. **Never hardcode hex values** — always use `var(--token-name)`.

- **Backgrounds:** `--color-bg-primary`, `--color-bg-secondary`, `--color-bg-tertiary`
- **Accents:** `--color-accent-amber` (primary), `--color-accent-copper` (secondary), `--color-accent-gold` (hover states)
- **Text:** `--color-text-primary` (headings/body), `--color-text-secondary` (descriptions), `--color-text-tertiary` (muted)
- **Semantic:** `--color-success`, `--color-alert`, `--color-info`
- **Cards:** `--color-card-bg`, `--color-card-border`, `--color-card-border-hover`, `--color-glass`
- **Fonts:** `--font-playfair` for headings, `--font-dm-sans` for body/buttons/labels, `--font-jetbrains` for code/data

Eyebrow text is always uppercase DM Sans, 12px, `letterSpacing: "0.15em"`, amber.

Open `globals.css` to see exact values.

## Styling Approach

**Hybrid:** Tailwind for layout/spacing/flexbox/grid/responsive. Inline `style={}` for colors, fonts, borders — anything referencing CSS vars. This is because Tailwind v4 doesn't reliably resolve CSS vars in class names. **Do NOT use Tailwind color classes** like `text-amber-500` or hardcode hex values.

```tsx
// Correct pattern
<div
  className="flex items-center gap-4 px-8 py-12 max-w-7xl mx-auto"
  style={{
    fontFamily: "var(--font-dm-sans)",
    color: "var(--color-text-secondary)",
  }}
>
```

## Existing Components

Use these before creating new ones:

- `<Button variant="primary" | "ghost">` — All CTAs
- `<GlassCard hoverable accent>` — Elevated content cards. `accent` adds amber top border
- `<ScrollReveal delay={N}>` — Scroll-triggered fade-up. Stagger with delay (ms)
- `<SectionHeading>` — Consistent section titles
- `<StatCard>` — Metric/number displays
- `<Badge>` — Small labels/tags

## Animations

Import from `@/lib/animations`. **Do NOT create ad-hoc animation objects.**

- `fadeUpVariant` — Default reveal (fade + slide up 30px)
- `fadeLeftVariant` / `fadeRightVariant` — Directional reveals
- `staggerContainer` — Wrap around grids/lists, staggers children 0.1s

Use `ScrollReveal` for simple reveals. For staggered grids, use `motion.div` with `variants={staggerContainer}` + `initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }}`, and `fadeUpVariant` on each child.

Hover: cards get `scale: 1.02` + border glow, buttons get `scale: 1.02` hover / `0.98` tap. Keep durations between 0.25s–0.8s.

## Adding a Section

1. Create `src/components/sections/MySectionName.tsx`
2. Follow the pattern of existing sections (e.g. `HowItWorks.tsx`): eyebrow label → h2 heading → subtitle → content grid, all wrapped in `ScrollReveal` with staggered delays
3. Import in `page.tsx` and place in render order

## Adding a Page

1. Create `src/app/[route]/page.tsx`
2. Import `Navigation`, `Footer`, and section components
3. Export metadata for SEO

## Anti-Patterns

- Don't use `<Image>` from `next/image` for backgrounds — use CSS `backgroundImage`
- Don't add npm packages without approval
- Don't create separate CSS files per component
- Don't use `className` for colors — use `style` with CSS vars
- Don't skip TypeScript types
- Don't create server components unless asked
- Don't remove the grain overlay or ambient glow effects
