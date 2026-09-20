# Feedme accessibility implementation record

Date: 2026-09-18
Status: complete record of the current working tree

## Scope and evidence level

This is the full record of accessibility work performed in Feedme through this date. It combines the committed accessibility work in `b69de06` with subsequent, currently uncommitted changes. It covers both the public marketing pages and the signed-in care application.

The target is WCAG 2.2 AA where it applies. This is not a certification or legal conformance statement. Each item below is either implemented in source, verified in a browser, or listed as still requiring manual validation. The companion [accessibility-contrast-report.md](accessibility-contrast-report.md) is part of this record and contains the exact contrast measurements.

## Implemented work

### Language, Hebrew, and RTL

- The selected locale sets `lang` and `dir` on both `<html>` and the React root: `en`/`ltr` or `he`/`rtl`.
- Browser document titles are localised and describe the current page without automatically prefixing the Feedme product name. For example, a Hebrew timeline is titled `ציר הזמן של Leo` and an English timeline is titled `Leo’s timeline`.
- An `index.html` bootstrap script sets the saved/browser locale before React loads. This prevents an assistive technology buffer from initially receiving English metadata before Hebrew is applied.
- React uses `useLayoutEffect` to apply later locale changes before paint.
- The public-site wrapper, carousel direction, language-picker choices, time-zone fragments, and mixed email/phone content use appropriate language or direction handling.
- Hebrew UI strings exist for the public pages and signed-in controls. The Hebrew landing page has a dedicated Hebrew introduction and a readable numbered accessibility list.

Files: `index.html`, `src/App.tsx`, `src/PublicSite.tsx`, `src/components/LanguageControl.tsx`, `src/components/LanguagePicker.tsx`.

### Semantic structure and navigation

- Public pages use real headings, sections, lists, buttons, links, and labels.
- The public site and signed-in application use standard main-content and complementary sidebar landmark regions where their page structure calls for them.
- Public legal pages provide an in-page table of contents; public navigation and footer links expose the key public routes.
- The public accessibility page was changed from clickable cards to a numbered list. It covers contrast, readable text, English/Hebrew RTL support, keyboard and focus, dialogs, forms/errors, semantic structure, button sizing, and reduced motion.
- Incomplete ARIA tab patterns were removed. Carousel dots are a labelled group of buttons; timeline filters are a native radio group because exactly one filter is selected at a time.

Files: `src/App.tsx`, `src/PublicSite.tsx`, `src/AccountDataPage.tsx`, `src/styles.css`.

### Keyboard, focus, targets, and hover

- A global `:focus-visible` ring covers links, enabled buttons, inputs, selects, textareas, and explicit keyboard-focusable controls. Dark footer content uses a white focus ring.
- Primary buttons have a high-contrast inset focus treatment. Timeline records and reminders expose concise, keyboard-operable title buttons instead of making an entire card (including its nested action buttons) one large control.
- Pointer hover feedback was added for public navigation, account controls, primary actions, links, event rows, reminder rows, carousel dots, and relevant signed-in controls. Hover is not required for keyboard or touch use.
- Buttons have a 24 by 24 CSS-pixel minimum activation area; generic modal-close controls are 36 by 36 CSS pixels.
- Carousel dots retain small visual dots inside 24 by 24 CSS-pixel buttons.
- Timeline record and reminder title buttons use native keyboard operation. Their nearby Edit, Comment, Complete, Delete, and Log controls remain separate native buttons.

Files: `src/styles.css`, `src/App.tsx`, `src/PublicSite.tsx`.

### Dialog focus management

`ModalBackdrop` is the shared modal foundation. It locks scroll, remembers the invoking element, moves focus into the dialog, traps Tab and Shift+Tab, closes on Escape, restores focus after close, and correctly handles nested modal locks.

Dialog role, modal state, and accessible naming were added or completed for create-child, quick-log/edit-record, manage-care, reminder detail, leave-care-space, invitation preview, Insights settings, Insights PDF export, account deletion, language picker, and Help & legal. Icon-only close controls have names.

Files: `src/components/ModalBackdrop.tsx`, `src/components/CreateChildModal.tsx`, `src/App.tsx`, `src/AnalyticsView.tsx`, `src/AccountDataPage.tsx`, `src/components/LanguagePicker.tsx`, `src/PublicSite.tsx`.

### Forms, feedback, and control names

- Native labels and form controls remain the default.
- Sign-in/registration has autocomplete for name, email, current password, and new password. Account deletion has email autocomplete.
- Sign-in, account-export, and account-deletion errors use `role="alert"`.
- The Insights activity selector is a fieldset with an `Activity` legend.
- Icon-only controls receive names where visible text is absent, including child actions, event and reminder actions, mobile navigation, close controls, settings/export, and navigation scrims.
- Timeline filter selection uses native radio inputs with visible labels.

Files: `src/App.tsx`, `src/AccountDataPage.tsx`, `src/AnalyticsView.tsx`, `src/components/CreateChildModal.tsx`, `src/i18n.ts`.

### Account controls

- The signed-in sidebar account trigger is a native expandable button whose visible name supplies its accessible name. Its decorative avatar initial is hidden from assistive technology.
- The public landing account button is named by a hidden “Account menu” label plus the actual account-name text. It retains expanded/popup state, so the name remains available at small breakpoints where the visible account name is hidden.
- The Feedme logo is a named home-navigation button. It announces “Go to home” in English and “מעבר לדף הבית” in Hebrew.
- Unsupported ARIA menu/menuitem patterns were removed in favour of normal button behaviour.

Files: `src/components/SidebarAccount.tsx`, `src/PublicSite.tsx`, `src/styles.css`.

### Images, icons, and non-text content

- The public product screenshots have meaningful bilingual `alt` text.
- Screenshot alternatives were expanded to descriptive sentences. For example: “ציר הזמן המשותף של Feedme, עם אירועי הטיפול של היום ותפריט הניווט.”
- Screenshot selector buttons use concise, localised ordinal names such as “צילום מסך 1 מתוך 5, נוכחי”, while the active image supplies the full description.
- The carousel no longer turns its visual frame into a generic clickable `div`; only its clearly named arrows and selector buttons change slides. Inactive slides are hidden from the accessibility tree.
- Decorative brand marks, Lucide icons, and the custom WhatsApp icon are hidden when adjacent text or a button name already expresses their meaning.
- Icon-only interactive controls are named by the control, rather than treating the icon itself as content.

Files: `src/PublicSite.tsx`, `src/components/FeedmeBrand.tsx`, `src/App.tsx` and related page components.

### Contrast, readable text, and non-colour cues

- The primary warm orange is `#ba5c30`, with white text at 4.50:1. Its hover colour `#a43f30` measures 6.30:1 with white text.
- The warmer landing “enter family space” action uses `#ca4e37`, measuring 4.51:1 with white text.
- Low-contrast public accent, warning, success, avatar, form, sidebar, selected-state, focus, and account colours were replaced with measured alternatives.
- Small operational text and secondary copy were strengthened. The landing “כנס למרחב המשפחתי” action was made slightly larger and less bold.
- Focus indicators and selected controls use outlines, borders, geometry, text, or programmatic state in addition to colour.
- Custom activity colours are limited server-side to six-digit hex values. Timeline and quick-log icon ink is calculated black or white to reach at least 4.5:1 for every valid activity colour.
- Carousel arrows have an opaque dark background, so white icons do not depend on screenshot brightness.
- The logo, PWA icon, and browser theme colour use the accessible primary colour.

Exact pairs, locations, and ratios: [accessibility-contrast-report.md](accessibility-contrast-report.md).

Files: `src/styles.css`, `src/App.tsx`, `server/index.ts`, `src/components/FeedmeBrand.tsx`, `public/icon.svg`, `public/manifest.webmanifest`.

### Reduced motion

- CSS honours `prefers-reduced-motion: reduce` by suppressing/reducing nonessential transitions and animations.
- Timeline slide-in animation is disabled under that preference.
- Product-carousel scrolling and hash-link scrolling become instant rather than smooth under that preference.
- The product is otherwise intentionally low-motion.

Files: `src/styles.css`, `src/App.tsx`, `src/PublicSite.tsx`.

### Public-site and documentation changes

- Public-site account, navigation, footer, links, carousel, contact controls, and legal pages received contrast, hover, focus, target-size, semantics, keyboard, and RTL review.
- The public accessibility text was simplified to describe implemented behaviour rather than clickable promotional content. Redundant “familiar controls” copy was removed.
- The public accessibility page includes a formal statement with the WCAG 2.2 AA target, last-updated date, Feedme support-team responsibility, email and WhatsApp barrier-reporting routes, an alternative-access commitment, and transparent note that manual assistive-technology testing is ongoing.
- `docs/accessibility-contrast-report.md` records the colour audit.
- This document records both implemented changes and open work so a future reusable skill does not mistake source edits for completed validation.

## Verification performed

The following checks were actually completed:

- `npm run check` passed after the current changes.
- `npm run build` passed after the current changes.
- `git diff --check` passed; Git emitted existing line-ending conversion notices only.
- Source review covered React interactive elements, custom roles, labels, dialogs, form errors, focus handling, motion, and language metadata.
- Browser accessibility-tree inspection of the English public landing page confirmed labelled controls, headings, and image alternatives.
- Browser accessibility-tree inspection of the Hebrew public landing page confirmed Hebrew headings, paragraphs, buttons, links, detailed image descriptions, and RTL presentation.
- Browser accessibility-tree inspection of the signed-in Hebrew timeline confirmed the localised document title `ציר הזמן של Leo`, concise timeline/reminder controls, and separate named action buttons.
- Browser inspection confirmed `html.lang`, `html.dir`, root `lang`, and root `dir` are `he`/`rtl` in Hebrew.
- The Hebrew carousel was rechecked after its descriptions were expanded.
- The public landing and Accessibility pages were tested at 320 CSS-pixel width without horizontal overflow.
- The language dialog was browser-tested for dialog semantics, initial focus, Escape-to-close, and focus restoration.
- Palette measurements are recorded in the contrast report.

## Known gaps and required follow-up

These items are deliberately **not** complete:

1. Test every signed-in role and route with keyboard only, including create/edit/delete, invitations, reminders, mobile navigation, and nested dialogs.
2. Test NVDA with Chrome or Firefox and VoiceOver with Safari in both English and Hebrew. Hebrew also requires a Hebrew-capable voice installed in Windows and NVDA automatic language switching enabled; page metadata cannot install or select that voice.
3. Test every public and signed-in route at 200% and 400% zoom, 320 CSS-pixel width, and browser text-size overrides.
4. Keep the public accessibility statement current: update its date, responsible contact, known limitations, and barrier-response wording whenever those facts change. It must not claim certification without the required validation.
5. Icon-ink contrast is guaranteed for valid custom activity colours. Any future use of those colours for text, borders, charts, or other UI must be measured independently.
6. Repeat manual checks against the deployed production build, not only local development.

## Reusable-skill guidance

When this record becomes a skill, preserve the distinction between **implemented in source**, **verified in a browser**, and **validated with assistive-technology users**. The skill should require native semantics first; labels for icon controls; standard landmarks; visible focus; modal focus management; reduced-motion support; language metadata; measured contrast; meaningful image alternatives; and the verification steps above. It must audit each new product’s routes, roles, languages, user-generated colours, visualisations, and accessibility-statement obligations rather than assuming Feedme-specific code is universally sufficient.
