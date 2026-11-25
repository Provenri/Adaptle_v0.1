---
version: alpha
name: Adaptle
colors:
  primary: "#173E32"
  primary-strong: "#163C32"
  secondary: "#117579"
  tertiary: "#A84732"
  amber: "#F2A65A"
  success: "#2F7D5D"
  background-light: "#FFFFFF"
  background-dark: "#000000"
  surface: "#F8F4EE"
  surface-muted: "#F4EEE6"
  surface-selected: "#E0E1E6"
  surface-highlight: "#EDF3EC"
  border: "#D9DFDB"
  border-warm: "#E0D8CF"
  text-primary: "#000000"
  text-primary-dark: "#FFFFFF"
  text-secondary: "#60646C"
  text-secondary-dark: "#B0B4BA"
  text-forest: "#173E32"
typography:
  title:
    fontFamily: Spline Sans
    fontSize: 48px
    fontWeight: 600
    lineHeight: 52px
  subtitle:
    fontFamily: Spline Sans
    fontSize: 32px
    fontWeight: 600
    lineHeight: 44px
  body:
    fontFamily: Spline Sans
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
  small:
    fontFamily: Spline Sans
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  small-bold:
    fontFamily: Spline Sans
    fontSize: 14px
    fontWeight: 700
    lineHeight: 20px
  cover-serif:
    fontFamily: Georgia
    fontWeight: 700
rounded:
  sm: 8px
  card: 14px
  progress: 16px
  panel: 18px
  welcome: 24px
  full: 999px
spacing:
  half: 2px
  one: 4px
  two: 8px
  three: 16px
  four: 24px
  five: 32px
  six: 64px
components:
  primary-button:
    backgroundColor: "#173E32"
    textColor: "#FFFFFF"
    rounded: 999px
    padding: 16px
  secondary-button:
    backgroundColor: "#FFFFFF"
    textColor: "#163C32"
    rounded: 999px
    padding: 8px 16px
  hint-card:
    backgroundColor: "#F4EEE6"
    rounded: 14px
    padding: 16px
  answer-card:
    backgroundColor: "#F4EEE6"
    rounded: 14px
    padding: 16px
  result-correct:
    backgroundColor: "#2F7D5D"
    textColor: "#FFFFFF"
    rounded: 12px
    padding: 16px
  result-incorrect:
    backgroundColor: "#A84732"
    textColor: "#FFFFFF"
    rounded: 12px
    padding: 16px
---

# Adaptle visual system

## Platform

- Adaptle is an Expo Router + React Native application for mobile, with a React Native Web build.
- Use portrait-mobile layouts as the primary design target unless a request explicitly targets web-only desktop.
- Stitch output is a prototype/reference artifact. Production implementation must use existing React Native primitives, `StyleSheet`, Expo Router, and repository components.
- Do not introduce Tailwind, shadcn/ui, DOM elements, CSS-in-JS, or React web assumptions into the app.

## Visual atmosphere

- Warm, restrained, literary-cinematic, and clear rather than gamified or dashboard-like.
- White or black platform backgrounds carry the screen; warm parchment surfaces define content groups.
- Deep forest green anchors actions and navigation. Teal marks active progress and labels. Terracotta is reserved for adaptation prompts, answer markers, removal, and incorrect states.
- Favor clear editorial hierarchy over decorative flourishes, hero photography, invented statistics, or extra marketing copy.

## Typography

- On web, the display stack begins with Spline Sans, then Inter/system sans-serif.
- On native platforms, use the platform sans family through `Fonts.sans`.
- Georgia/serif typography is reserved for generated typographic book-cover artwork.
- Match the repository's `ThemedText` sizes: `small`/`smallBold` at 14/20, `default` at 16/24, `subtitle` at 32/44, and `title` at 48/52.
- Do not replace the implemented sans-serif app hierarchy with a Newsreader or other editorial serif treatment.

## Layout

- Standard mobile page padding is 24px for general play/library content and 16px inside nested cards.
- The shared spacing scale is 2, 4, 8, 16, 24, 32, and 64px.
- Major screen content gaps are 16–24px; controls and list rows commonly use 8px.
- Keep interactive content clear of the floating tab bar: use the existing `BottomTabInset` plus 64px or an equivalent safe bottom inset.
- Maximum content width is 800px.

## Existing components to preserve

### Header

- Use a 56×56 app icon with 14px corner radius.
- Pair the teal uppercase eyebrow with a 32/44 semibold title.
- Keep header additions, such as streak or add-book controls, aligned to the existing component rather than introducing a top navigation bar.

### Bottom navigation

- Exactly two tabs: `Play` and `My Library`.
- Each tab is a 48px-minimum pill, maximum 190px wide, with 16px content padding and 8px icon gap.
- Selected tab: `#163C32` with white icon/text.
- Unselected tab: white with `#163C32` icon/text.
- Shadow uses forest `#173E32`, 0.16 opacity, 4px vertical offset, 8px radius, and Android elevation 5.

### Primary button

- Full-width or section-width deep-forest pill with white 14px bold text and 16px vertical padding.
- Keep labels as implemented by the screen; do not rewrite behaviorally significant copy.

### Puzzle question

- Header: app icon, `ADAPTLE #<id>`, `Round <n> of 5`, and compact streak pill.
- Progress: five 30px circles. Current is teal, completed is forest, inactive is `#E0D8CF`.
- Progress copy uses the actual `getRoundPotential()` value: 3 points initially, 2 after one hint, 1 after two or three hints.
- Paired works use two equal columns, a 16px gap, and 2:3 artwork at 8px radius.
- Hint cards and answer cards use parchment `#F4EEE6`, 14px corners, and 16px padding.
- Answer badges are 30px terracotta circles.

### Puzzle reveal

- Correct result banner uses `#2F7D5D`; incorrect uses `#A84732`.
- Keep adaptation poster 112px wide at 2:3 ratio inside the reveal card.
- Show the repository-provided director, cast, characters, provider names, correct premise, story premise, TMDB attribution, shelf actions, and next-round label.
- Never replace these with invented dates, ranks, solve times, accuracy scores, or editorial metadata.

### My Library

- Header uses `YOUR SHELF` and `My Library`, with the existing add-book icon.
- Shelf overview is a 16px-rounded muted parchment panel.
- Filters are one 48px segmented row: All, To read, Reading, Finished. The selected filter is deep forest.
- Search uses a muted parchment 14px-radius field.
- Book cards use warm parchment, 18px corners, 16px padding, a 92px typographic cover, status pill, and optional teal Play adaptation action.
- Legal links are subtle footer links, not a separate navigation destination bar.

## Typographic cover themes

Generated covers are 2:3 and use SVG motifs. Preserve the repository palettes:

- `scifi_teal`: `#082F34` → `#117579`, cream `#FFF6DE`, muted teal `#B8DDD5`, amber `#F2A65A`
- `thriller_navy`: `#071628` → `#183B56`, cream `#FFF8E7`, muted blue `#AEBFD0`, gold `#D7AA55`
- `fantasy_plum`: `#32133E` → `#74446D`, cream `#FFF8F1`, muted plum `#DFC7DF`, neutral accent `#D9D6C3`
- `literary_terracotta`: `#A84732` → `#D9825B`, cream `#FFF5E1`, muted peach `#F2D8C4`
- `romance_rose`: `#A95867` → `#D99A89`, cream `#FFF8EE`, muted blush `#F8DCD2`
- `nonfiction_forest`: `#173E32` → `#47765B`, cream `#FFF9E8`, muted green `#C9DCCB`

## Fidelity and accessibility rules

- Preserve exact UI copy and data from the relevant source component or fixture.
- Preserve accessibility labels, roles, expanded/selected/disabled states, and minimum touch targets.
- For visuals, use repository assets or documented external asset paths; do not silently substitute placeholders.
- Visually inspect every generated Stitch screenshot and its HTML before accepting it.
- Hide rejected/replaced Stitch revisions instead of treating them as active design sources.
