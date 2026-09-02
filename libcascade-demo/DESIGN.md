# Design system

This document defines the visual language for the libcascade CAD playground. The direction is inspired by [libcascade.xyz](https://www.libcascade.xyz/): technical documentation, quiet neutral surfaces, compact controls, thin borders, restrained shadows, and a warm yellow accent.

Use this as the source of truth for visual decisions. Match the character and token system; do not copy the reference site's logo, page content, or exact marketing layout.

## Design principles

- Calm and technical: the CAD model and code are the focus.
- Mostly monochrome: use neutral grays for structure and reserve color for actions, status, and emphasis.
- Dense but breathable: compact controls and useful information density with generous page-level spacing.
- Thin structure: prefer 1px borders and subtle surface changes over heavy shadows.
- Soft geometry: use modest rounded corners, generally 6–12px; reserve full pills for search/status controls.
- Documentation-like hierarchy: clear semibold headings, muted supporting text, short labels, and inline code treatment.
- Light/dark parity: every surface and semantic color must have a deliberate light and dark value.

## Typography

Use Inter when available, then fall back to the system UI stack:

```css
--font-sans: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
  "Liberation Mono", "Courier New", monospace;
```

Typography tokens:

| Role | Size | Line height | Weight | Use |
| --- | ---: | ---: | ---: | --- |
| Page title | 36px, 48px at desktop | 1.1 | 600 | Product/app title; use tight tracking |
| Section heading | 24px, 30px at desktop | 1.25 | 600 | Pane and major section headings |
| Card heading | 16px | 1.4 | 500–600 | Cards, toolbar groups, model metadata |
| Body | 14px–16px | 1.5–1.625 | 400 | Descriptions and helper copy |
| UI label | 14px | 1.4 | 500 | Buttons, menu items, tabs |
| Small/meta | 12px–13px | 1.4 | 400–500 | Status, dimensions, hints |
| Code/editor | 13px–14px | 1.5 | 400 | Editor, inline code, errors |

Headings should use `letter-spacing: -0.01em` to `-0.02em`; body copy should use normal tracking. Use semibold rather than bold for hierarchy. Avoid all-caps text except for the `RUN` label and very small status badges.

## Color tokens

Define semantic CSS variables instead of scattering hex values through components. The reference site uses the following neutral roles.

### Light theme

```css
:root {
  --color-background: #f5f5f5;
  --color-foreground: #0a0a0a;
  --color-muted: #f5f5f5;
  --color-muted-foreground: #737373;
  --color-card: #f1f1f1;
  --color-card-foreground: #0a0a0a;
  --color-popover: #fafafa;
  --color-popover-foreground: #272727;
  --color-border: rgb(204 204 204 / 50%);
  --color-primary: #171717;
  --color-primary-foreground: #fafafa;
  --color-secondary: #ededed;
  --color-secondary-foreground: #171717;
  --color-accent: rgb(209 209 209 / 50%);
  --color-accent-foreground: #171717;
  --color-ring: #a3a3a3;
  --color-overlay: rgb(0 0 0 / 20%);
}
```

### Dark theme

```css
.dark {
  --color-background: #121212;
  --color-foreground: #ebebeb;
  --color-muted: #212121;
  --color-muted-foreground: rgb(179 179 179 / 80%);
  --color-card: #191919;
  --color-card-foreground: #fafafa;
  --color-popover: #1e1e1e;
  --color-popover-foreground: #dedede;
  --color-border: rgb(102 102 102 / 40%);
  --color-primary: #fafafa;
  --color-primary-foreground: #171717;
  --color-secondary: #212121;
  --color-secondary-foreground: #ebebeb;
  --color-accent: rgb(104 104 104 / 30%);
  --color-accent-foreground: #e6e6e6;
  --color-ring: #8c8c8c;
  --color-overlay: rgb(0 0 0 / 20%);
}
```

### Semantic colors

Use these consistently for feedback and small accents:

```css
--color-info: #3080ff;
--color-warning: #f99c00;
--color-error: #fb2c36;
--color-success: #00c758;
--color-idea: #ee7e00;
--color-brand-yellow: #eab308;
```

The brand yellow is an accent, not a second primary. Use it for the active underline, a highlighted card edge, a small indicator, or a subtle background wash such as `rgb(234 179 8 / 7%)`. Do not make every button yellow.

For error output, combine the semantic error color with a low-opacity background and readable foreground text. Never rely on red alone to convey failure; include an icon or text label.

## Spacing and sizing

Use a 4px base rhythm:

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-14: 56px;
```

Use these defaults for the SPA:

- App header: 56px high, with 16px horizontal padding.
- Main shell: 24px outer padding on small screens; 32px on larger screens when space allows.
- Pane gap: 16px. Do not add a heavy divider; use the border and background contrast of each pane.
- Pane header/control row: 48–56px high.
- Standard control height: 36px; compact control height: 32px.
- Button horizontal padding: 12px–16px.
- Editor-to-error-panel gap: 12px.
- Error panel height: approximately 96px–144px, with `overflow-y: auto`; it must not consume the whole code pane.
- Card padding: 16px; larger featured cards may use 20px.
- Section spacing: 32px–48px.

The reference site uses a content max width near 1024px for reading layouts and a wider shell near 1400px. The CAD playground may use the full viewport, but keep controls and pane headers aligned to a consistent shell rather than allowing text to stretch edge to edge.

## Shape, borders, and elevation

```css
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-xl: 12px;
--radius-2xl: 16px;
--shadow-sm: 0 1px 2px rgb(0 0 0 / 6%);
--shadow-focus: 0 0 0 2px color-mix(in srgb, var(--color-ring) 70%, transparent);
```

- Use `border: 1px solid var(--color-border)` for panes, cards, menus, and the editor.
- Use 12px corners for the main panes and cards, 6px for controls, and 4px for inline code.
- Keep shadows nearly invisible. A card should feel separated by its surface and border, not float dramatically.
- Use a 2px focus ring with a small offset for keyboard focus; never remove the focus indicator.
- Use full rounding only for pill-like controls such as search, mode/status badges, and theme toggles.

## Application composition

### App header

Use a quiet, documentation-style top bar:

- 56px height, bottom border, and a translucent background with a light backdrop blur.
- Left-aligned small logo mark and `libcascade` wordmark, semibold, with a 10px gap.
- Keep navigation and runtime information compact; use 14px muted links that become foreground-colored on hover.
- Put the selected WASM mode and readiness state in small muted badges rather than large banners.
- Use simple line icons at 16–20px. Icons inherit text color and should not introduce a new color family.

### Code pane

- Treat the pane as a card: neutral surface, 1px border, 12px radius.
- Put the `RUN` action in the pane header. Use the primary foreground/background pairing: dark filled button in light mode and light filled button in dark mode.
- Add a small yellow active underline or indicator only when the editor is dirty or the run succeeded; do not turn the entire header yellow.
- Use a dark code surface in both themes only if syntax contrast is maintained; otherwise use `var(--color-muted)` with foreground text.
- Use 13px–14px monospace text, 20px–22px line height, 16px padding, and horizontal scrolling for long lines rather than wrapping code.
- The error window sits at the bottom of the pane, separated by 12px. Use 12px monospace text, muted red border/background, and a visible `Errors` label.

Suggested error panel treatment:

```css
.error-panel {
  max-height: 144px;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-error) 35%, var(--color-border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-error) 7%, var(--color-card));
  color: var(--color-foreground);
  font: 13px/1.5 var(--font-mono);
}
```

### Viewer pane

- Give the viewer equal visual weight to the code pane, with a clean neutral background and a thin border.
- Keep the viewer header minimal: model status on the left and a compact export menu on the right.
- The export menu should use the same 36px control height, 6px radius, thin border, and subtle hover surface as the rest of the UI.
- Use a neutral gray model material, restrained lighting, and optional low-contrast grid/axes. The scene should not compete with the application chrome.
- Place a compact orientation-axis symbol 12–16px from the viewer's bottom-right edges. Use a transparent background with no card, border, or shadow; keep the mark approximately 64–80px square on desktop and 52–64px square on small screens. Use conventional X red, Y green, and Z blue strokes with short, high-contrast labels, adding a subtle light/dark outline only when needed for legibility. The symbol must remain visually subordinate to the model.
- Empty state copy should be centered, muted, and brief: explain that running the code will display the shape.

### Cards and inline code

When a card or callout is needed, use `var(--color-card)`, a 1px border, 12px radius, and 16px padding. Inline code uses the muted surface, a 1px border, 5px radius, 3px vertical and horizontal padding, 13px monospace text, and foreground color.

## Interaction states

- Default transitions: 150ms using `cubic-bezier(.4, 0, .2, 1)`.
- Hover: slightly change background or border color; avoid scale transforms.
- Active/selected: use foreground or brand yellow sparingly, plus a border/underline so color is not the only cue.
- Disabled: reduce opacity to approximately 50% and disable pointer interaction.
- Focus-visible: show the ring token clearly on buttons, menu items, the editor, and the error log if it can receive focus.
- Loading: use text such as `Loading libcascade…` or `Running…` with a small spinner; do not replace the whole page with a blocking splash screen.
- Errors: retain the current valid viewer model, put the newest diagnostic in the bottom-left error panel, and keep the status line concise.

Respect `prefers-reduced-motion: reduce`: remove nonessential transitions and never use animated camera movement as the only way to fit a model.

## Responsive behavior

Use the same general breakpoints as the reference site's utility system:

- `640px`: allow controls to wrap and reduce horizontal gaps.
- `768px`: use the full side-by-side editor/viewer layout when height permits.
- `1024px`: show the most spacious pane headers and shell padding.
- Below `768px`: stack code above viewer, keep the error panel visible, and make the viewer a usable fixed-height region rather than collapsing it.

On small screens, preserve 44px minimum touch targets even if the desktop controls are visually 32–36px. Keep the export menu reachable without horizontal overflow.

## Implementation rules

- Put the tokens in one global stylesheet or theme module and consume the semantic names in components.
- Support light and dark themes using the `dark` class or an equivalent root theme attribute; respect the system preference initially.
- Do not introduce a new font, bright gradient, oversized shadow, or unrelated component style without updating this document.
- Do not use color-only status indicators. Pair color with text, iconography, or shape.
- Check contrast for body text, error text, the editor, and disabled controls in both themes.
- Use the reference site for visual calibration, but keep the CAD playground's UI subordinate to code readability and model inspection.
