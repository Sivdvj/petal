---
name: ui
description: Visual design and interaction rules for the PDF annotator extension. Use whenever building or changing UI, CSS, styling, the side panel, sticky notes, highlights, animations, drag and drop, or empty states in this project.
---

# PDF annotator: whimsical notebook UI

The vibe is a cozy reading desk: a real book, a highlighter, and a pad of sticky notes. Whimsy lives in the chrome and the notes. The PDF page itself stays clean and untouched, because people are here to read, so never tint, filter or overlay it beyond highlights and notes.

## Look
- Soft warm paper background (cream, not white), pastel accents. Avoid purple gradients, dark neon, glassmorphism and stock "SaaS card" layouts.
- Sticky note colors: butter yellow, blush pink, mint, sky, lavender. Define them as CSS variables so themes are easy to change.
- Highlights look like marker: pastel, semi-transparent, blended with multiply so the text stays readable, with slightly uneven rounded ends. Never opaque.
- Type: a legible handwriting font for note text (Patrick Hand) and a more playful one for labels and headings (Caveat). Bundle the fonts locally as woff2 so it works offline and inside extension CSP. Note text is at least 16px, because handwriting fonts get hard to read small.
- Notes: soft paper texture (subtle noise), small random-looking rotation between -3° and 3°, a tiny tape strip or pin. Derive rotation from the note id so it stays the same across renders. Random on every render feels glitchy.

## Motion
- Pick up: on grab, the note lifts (scale ~1.05, rotation eases slightly, shadow grows, cursor becomes grabbing). This makes the drag feel physical.
- Stick: on drop, a quick squish (scale to ~0.96 then settle) while the shadow shrinks, so it feels pressed onto the page. Add a small tape or pin appearing.
- Everything eases with spring-like curves, 150 to 250ms. Nothing loops or bounces on its own.
- Respect prefers-reduced-motion: keep state changes, drop the wobble.

## Interaction
- Annotate mode is an obvious toggle (a little pen switch in the toolbar). When on, the cursor changes and selecting text creates a highlight. When off, the page behaves like a normal reader.
- The side panel shows page thumbnails plus a tray of blank notes to pick up and stick on a page. Highlights can also get a note attached.
- Store note positions in PDF page units, not screen pixels, so they stay put when zoom or rotation changes.
- Notes must be movable by keyboard (arrow keys), with visible focus rings.
- Empty states are friendly and short ("No notes yet. Grab one from the pad!"). Skip emoji spam.

## Accessibility
Dark handwriting on pastel must keep contrast at 4.5:1 or better. Whimsy never justifies unreadable text.

## Defer
Use the frontend-design skill for general craft. If it conflicts with this file, this file wins.
