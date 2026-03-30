# Proof Design Reference — Tokens & Components

Reference only. Use when needed for color codes, font specifics, or component details.

## Design Tokens (from globals.css)

**Backgrounds:**
- `--color-bg-primary` (page bg)
- `--color-bg-secondary` 
- `--color-bg-tertiary`

**Accents:**
- `--color-accent-amber` (primary)
- `--color-accent-copper` (secondary)
- `--color-accent-gold` (hover)

**Text:**
- `--color-text-primary` (headings/body)
- `--color-text-secondary` (descriptions)
- `--color-text-tertiary` (muted)

**Semantic:**
- `--color-success`, `--color-alert`, `--color-info`

**Cards:**
- `--color-card-bg`, `--color-card-border`, `--color-card-border-hover`, `--color-glass`

**Fonts:**
- `--font-playfair` (headings)
- `--font-dm-sans` (body/buttons/labels)
- `--font-jetbrains` (code/data)

## Existing Components

- `<Button variant="primary" | "ghost">` — All CTAs
- `<GlassCard hoverable accent>` — Elevated cards (not required for all cards)
- `<ScrollReveal delay={N}>` — Scroll-triggered fade-up
- `<SectionHeading>` — Section titles
- `<StatCard>` — Metrics
- `<Badge>` — Tags/labels

## Animation Variants (from lib/animations.ts)

- `fadeUpVariant` — Default reveal
- `fadeLeftVariant` / `fadeRightVariant` — Directional
- `staggerContainer` — Stagger children 0.1s

## Styling Pattern

Hybrid: Tailwind for layout/spacing/grid. Inline `style={}` for colors/fonts — always use CSS vars, never hardcode hex.

```tsx
<div
  className="flex items-center gap-4 px-8 py-12 max-w-7xl mx-auto"
  style={{
    fontFamily: "var(--font-dm-sans)",
    color: "var(--color-text-secondary)",
  }}
>
```

## Centering Pattern (REQUIRED)

Always:
```tsx
<div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(20px, 5vw, 48px)" }}>
```

- `margin: "0 auto"` — non-negotiable
- `textAlign: "center"` on headers — explicit
- 20px+ padding on mobile (375px)

## When to Skip QA Loop

- Copy-only text changes
- Data fixes
- Config/env changes
- Non-visual code

## Anti-Patterns

- No `<Image>` for backgrounds — use CSS `backgroundImage`
- No hardcoded hex values — always `var(--token-name)`
- No Tailwind color classes — use inline `style`
- No separate CSS files per component
- No amber glow on every element
- No gradient text headings — flat color is more premium
- No server components unless asked
