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

Eyebrow text is **typically** uppercase DM Sans, 12px, `letterSpacing: "0.15em"`, amber — but this is a default, not a rule. Feel free to vary eyebrow style by section for visual differentiation (e.g. no eyebrow, a different weight, a muted color, or no uppercase). Not every section needs the same treatment.

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

Use these before creating new ones — but don't feel constrained by them. If a design calls for something new (e.g. a plain `<div>` card without glassmorphism, a full-bleed section with no card, a timeline element), build it inline rather than forcing everything into `GlassCard`. The goal is great design, not component reuse for its own sake.

- `<Button variant="primary" | "ghost">` — All CTAs
- `<GlassCard hoverable accent>` — Elevated content cards. `accent` adds amber top border. Not every card needs to be a GlassCard — use plain styled divs when a lighter treatment fits better.
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

## Design Philosophy

The goal is **Linear/Vercel/Stripe-tier design** — not a bourbon fan site. That means:
- Restraint over decoration. If an element isn't earning its place, cut it.
- Amber is a premium accent, not a neon highlight. Use it sparingly — 1-2 key moments per section at most.
- Glassmorphism is one tool, not the only tool. Sections can breathe without cards.
- Simplicity on landing pages. Don't add sections or features to feel comprehensive — each element must earn its pixel.
- Mobile-first. Every section must look intentional on a 375px screen.
- Copy should sound like a confident intelligence platform, not a bourbon community newsletter.

## Layout Rule: CENTER EVERYTHING

**Every section, page, and content block MUST be horizontally centered.** This is non-negotiable.

Standard centering pattern for ALL new sections/pages:
```tsx
<div style={{ maxWidth: 800, margin: "0 auto", padding: "0 clamp(20px, 5vw, 40px)" }}>
```

For wider content (grids, cards):
```tsx
<div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(20px, 5vw, 48px)" }}>
```

Rules:
- Always use `margin: "0 auto"` on the content wrapper — never rely on `className="mx-auto"` alone
- Always set `textAlign: "center"` on headers/subtitles explicitly via `style={{}}`
- The outer `<section>` is full-width. The inner `<div>` centers content.
- On mobile (375px), content must have at least 20px padding on each side
- If something looks left-aligned, it IS a bug. Fix it before shipping.

Do NOT:
- Use Tailwind's `mx-auto` as the sole centering mechanism (it fails when parent has no width constraint)
- Omit `margin: "0 auto"` from content wrappers
- Ship any section without checking mobile centering

## Self-Critique Loop (mandatory for visual/layout changes)

Every visual or layout change MUST run this loop before pushing. No exceptions.

1. **Build:** Implement the changes
2. **Screenshot:** Start dev server, take screenshots at 1440px (desktop) and 375px (mobile)
3. **Critique against checklist:**
   - Is everything horizontally centered? Check on BOTH desktop and mobile.
   - Do fonts match the system? Fraunces (--font-playfair) for headings/bottle names, Plus Jakarta Sans (--font-dm-sans) for body/labels, JetBrains Mono (--font-jetbrains) for prices/data/multipliers.
   - Do all colors use CSS vars (var(--token-name)), not hardcoded hex?
   - Would this look out of place on Linear.app, Vercel, or Stripe? If yes, it's not premium enough. Fix it.
   - Is there enough breathing room? Padding, gaps, margins — nothing should feel cramped.
   - Does mobile look intentional and designed, not just "it fits"? Check text size, touch targets, overflow.
   - Does the new element match the existing page aesthetic? It should look like it belongs on the same site.
   - Are hover states and interactions smooth? Spring physics preferred over CSS ease.
4. **Fix** anything that fails the checklist
5. **Production build** (`npm run build`) + commit + push

**Skip the loop for:** Copy-only text changes, data fixes, config/env changes, non-visual code.

## Anti-Patterns

- Don't use `<Image>` from `next/image` for backgrounds — use CSS `backgroundImage`
- Don't add npm packages without approval
- Don't create separate CSS files per component
- Don't use `className` for colors — use `style` with CSS vars
- Don't skip TypeScript types
- Don't create server components unless asked
- Don't remove the grain overlay or ambient glow effects
- Don't apply amber glow/neon effects to every element — it cheapens the design
- Don't make every section look the same — vary the visual treatment (some sections can be sparse, others dense)
- Don't use gradient text on headlines — flat `var(--color-text-primary)` reads more premium
