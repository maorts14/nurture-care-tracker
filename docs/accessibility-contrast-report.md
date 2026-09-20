# Feedme color-contrast report

Date: 2026-09-18
Scope: accessibility checklist item 7 — color contrast and non-color visual cues.

## Standard used

The updated palette targets WCAG 2.2 AA contrast: at least 4.5:1 for normal text and at least 3:1 for graphical controls and focus indicators. This is a source-level contrast review, not a full accessibility certification; keyboard, screen-reader, zoom, and RTL interaction checks remain separate checklist items.

## Palette corrections

| Purpose | Previous | Updated | Verified contrast |
| --- | --- | --- | --- |
| Primary action background with white text | `#f3654b` | `#ba5c30` | 4.50:1 |
| Landing-page entry action with white text | `#f3654b` | `#ca4e37` with `#fff` text | 4.51:1 |
| Primary-action hover background with white text | `#df503b` | `#a43f30` | 6.30:1 |
| Warm avatar background with white initials | `#d6ab71` | `#91622d` | 5.26:1 |
| Blue avatar background with white initials | `#6576b9` | `#5264a7` | 5.62:1 |
| Warning copy on the pale-warning surface | `#b36f20` / `#c68426` | `#805518` | 5.86:1 on `#fff2d7` |
| Green icon/copy on pale-success surfaces | `#198c75`, `#2f9d60`, `#23866f` | `#176f5c`, `#237c4b` | 4.90:1 or better on their surfaces |
| Small coral labels and public-page accent icons | `#e95842`, `#e95943`, `#ed634c` | `#b94332` | 4.64:1 or better on the light surfaces where used |
| Account-data eyebrow | `#d65742` | `#a43f30` | 5.68:1 on `#fff0ec` |
| Account-data card eyebrow | `#b46252` | `#943f34` | 6.84:1 on `#fffdf9` |

## Updated locations

### Public pages

- `src/styles.css`: header and account-menu hover states, landing eyebrow, value-list labels, CTA buttons, trust/legal links, contact icons, and the Help & legal panel now use the accessible primary/accent colors.
- `src/styles.css`: carousel arrows now use an opaque dark background. Their white icons are not dependent on the brightness of the product image beneath them.
- `src/components/FeedmeBrand.tsx`, `public/icon.svg`, and `public/manifest.webmanifest`: the in-app brand mark, app icon, and browser/PWA theme use the new primary color so white mark details remain legible.

### Signed-in child space

- `src/styles.css`: primary buttons, navigation count badge, selected timeline filter, selected language/invite states, checkbox accents, focus outlines, and selected-state borders now share the accessible primary color.
- `src/styles.css`: caregiver avatars have accessible white-initial contrast; warning labels, due-item icons, completion controls, care-gap indicators, and insight status labels use the darker warning/success colors.
- `src/styles.css`: account-data eyebrow/card accents, sign-in and account focus treatment, and sidebar/home hover states were aligned with the corrected palette.

### Custom activity colors

- `src/App.tsx`: timeline and quick-log activity icons now calculate either black or white icon ink from the selected activity color. The result is at least 4.5:1 for every valid six-digit hex activity color, including the default custom purple.
- `server/index.ts`: create and update activity endpoints now accept only six-digit hex colors. That keeps stored colors compatible with the icon-contrast calculation and the native color picker.

## Checked without changes

The existing high-contrast body copy (`#302c28`, `#413d39`), footer copy, error colors, disabled-field copy, selected pale-surface labels, and the existing blue activity/insight accent already meet their relevant contrast thresholds. Product screenshots were not regenerated as part of this source-color pass; they are non-interactive previews and remain separate image assets.
