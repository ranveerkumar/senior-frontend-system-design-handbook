# Premium Book PDF Layout Upgrade Prompt — Cover, Back Cover, Chapter Pages, Author Assets

You are inside the `senior-frontend-system-design-handbook` repository.

The current handbook PDF pipeline works, but the output still feels too much like a basic Markdown → HTML → PDF conversion. I want the PDF to feel like a real premium technical handbook while keeping the build fully automated.

The repository now has or may have these assets:

```text
book/assets/cover/
  senior-frontend-system-design-front-cover.png
  senior-frontend-system-design-back-cover.png
  cover-source-notes.md

book/assets/author/
  ranveer-kumar-author.png
  ranveer-kumar-author.webp
```

Use these assets where available.

---

## Current context

The repository contains:

```text
book/chapters/*.md
book/assets/diagrams/*.svg
book/assets/cover/
book/assets/author/
book/styles/book.css
book/templates/cover.html
book/templates/book.html
scripts/build-book-pdf.mjs
package.json
```

Current command:

```bash
npm run book:pdf
```

The current PDF is functional, but must be upgraded.

---

## Problems to fix

1. Page numbering starts from the cover page.
2. Page number is visible on the cover.
3. Chapters begin as normal Markdown headings at the top of content.
4. There are no separate chapter title pages.
5. About the Author does not start as a dedicated book section/page.
6. Author images in `book/assets/author/` are not yet properly used.
7. Front and back cover image assets should be used automatically.
8. The PDF still feels like a Markdown export, not a designed handbook.

---

## Primary objective

Refactor the PDF generation pipeline and templates so the final generated PDF has:

- full-page front cover image if available
- no visible page number/header/footer on the cover
- copyright/license page
- book-like table of contents
- optional part divider pages
- dedicated chapter title pages
- chapter content starting after the chapter title page
- About the Author starting on its own dedicated page
- author photo used in About the Author when available
- full-page back cover image if available
- clean typography, page breaks, figure handling, code blocks, and tables
- fully automated build through `npm run book:pdf`

Do not make the process dependent on InDesign or manual PDF stitching.

---

# 1. Book assembly order

Generate the PDF in this order:

1. Front cover page
2. Copyright / license page
3. Table of contents
4. Preface
5. Optional “How to Use This Handbook” / Introduction if content exists
6. Part divider pages, if implemented
7. Chapter title page for each main chapter
8. Chapter content
9. Closing note
10. About the Author on a dedicated page
11. Back cover page

---

# 2. Front cover image support

Preferred front cover path:

```text
book/assets/cover/senior-frontend-system-design-front-cover.png
```

If this file exists:

- use it as the first PDF page
- full-page
- no margins
- no header
- no footer
- no visible page number
- no text overlay
- preserve aspect ratio
- avoid stretching
- make it fill A4 portrait cleanly

If the file does not exist:

- fall back to the HTML/CSS cover template
- still suppress page number/header/footer
- still make it look premium

Expected front cover page size:

```text
A4 portrait
210 × 297 mm
```

Recommended image size:

```text
2480 × 3508 px
```

---

# 3. Back cover image support

Preferred back cover path:

```text
book/assets/cover/senior-frontend-system-design-back-cover.png
```

If this file exists:

- use it as the final PDF page
- full-page
- no margins
- no header
- no footer
- no visible page number unless intentionally designed in the image
- no text overlay
- preserve aspect ratio
- avoid stretching
- make it fill A4 portrait cleanly

If missing:

- use an HTML/CSS generated back-cover template
- keep it visually aligned with the front cover

Do not overlay author photo or contact text on the static back-cover image unless the image is intentionally designed as a background-only asset. If the static back-cover image already contains text, use it as-is.

---

# 4. Author image support

Author images may exist in:

```text
book/assets/author/ranveer-kumar-author.png
book/assets/author/ranveer-kumar-author.webp
```

Detection rules:

1. Prefer `ranveer-kumar-author.png` for PDF compatibility.
2. If PNG is missing, use `ranveer-kumar-author.webp`.
3. If both are missing, render the About the Author page without photo or use a clean `RK` monogram fallback.

Use the author image primarily on:

- the About the Author page inside the book

Optionally use it on:

- HTML-generated back cover, only if no static back-cover image exists

Do not use the author image on the front cover unless explicitly requested later.

Author image treatment:

- circular or softly rounded portrait
- 90–140 px display size depending on layout
- subtle border/accent
- should not look like a resume photo block
- should feel editorial and book-like
- should not crowd text

---

# 5. About the Author dedicated page

The `About the Author` section must start on a separate page.

Source chapter:

```text
book/chapters/12-about-the-author.md
```

Rules:

- Insert a hard page break before About the Author.
- Use a dedicated section opener or title treatment.
- If author image exists, show it near the top or side in a refined layout.
- Keep links clickable:
  - `https://ranveerkumar.com`
  - `https://portfolio.ranveerkumar.com`
  - `https://blog.ranveerkumar.com`
- Do not let About the Author continue immediately after previous content.
- Do not render it as a normal chapter continuation.
- Do not show raw Markdown artifacts.

Suggested layout:

```text
ABOUT THE AUTHOR

[author image]

Ranveer Kumar

UI Technology Leader · Frontend Architecture Practitioner · Practical Systems Thinker

Body text...
Links...
```

---

# 6. Page numbering rules

Professional behavior preferred:

## Cover page

- no visible page number
- no visible header/footer

## Copyright/license page

- preferably no visible page number
- roman numeral acceptable if easy

## TOC/front matter

Preferred:
- roman numerals: i, ii, iii

Acceptable:
- no visible page numbers for front matter

## Main content

Preferred:
- Arabic numbering starts at Chapter 1 title page or Chapter 1 content page

Acceptable minimum:
- visible page numbers only from main content onward
- no page number on cover
- no header/footer on cover
- no visible page number on back cover

Important:
If Puppeteer cannot suppress header/footer per page in one pass, use a multi-pass generation strategy.

---

# 7. PDF generation strategy

Choose the cleanest reliable approach after inspecting the current script.

## Preferred Option A — Single Puppeteer HTML with CSS

Use if possible.

Requirements:

- CSS page breaks work cleanly
- cover/back cover have no headers/footers/page numbers
- chapter title pages are clean
- content pages are stable

## Option B — Multi-pass PDF generation and merge

Use if needed to suppress page numbers on cover/back cover.

Generate:

1. front cover PDF without headers/footers
2. body PDF with desired headers/footers/page numbers
3. back cover PDF without headers/footers

Then merge.

Only add a lightweight PDF merge dependency if required. Explain why in the final summary.

## Option C — CSS-only page numbering

Use if reliable in Chromium/Puppeteer and gives clean output.

---

# 8. Dedicated chapter title pages

Every main chapter must have a separate chapter title page.

Do not render chapter title only as a normal `#` heading at the top of the content.

For each chapter:

1. Read chapter title from:
   - `book/metadata.json`, or
   - first `# Heading` in the chapter Markdown
2. Generate a separate title page.
3. Strip the first `# Heading` from the chapter body so it does not repeat immediately.
4. Start the chapter body on the next page.

Chapter title page layout example:

```text
CHAPTER 01

Beyond the Component

Senior frontend system design starts when we move from UI pieces to constraints, trade-offs, scale, failure modes, and measurable user outcomes.
```

Design requirements:

- generous whitespace
- premium typography
- chapter number prominent
- chapter title large
- short chapter objective/subtitle
- subtle line/motif
- no body content on title page
- no raw Markdown artifacts

---

# 9. Part divider pages

If feasible, implement part divider pages.

Recommended parts:

## Part I — The Senior Frontend Mental Model

- Chapter 1

## Part II — Data, State, and Dynamic UI

- Chapters 2, 3, 4, 5

## Part III — Performance, Platform, and Reliability

- Chapters 6, 7, 8

## Part IV — Security and Interviews

- Chapters 9, 10

Part divider design:

- full page
- part number
- part title
- short descriptor
- subtle architecture motif
- no ordinary body text
- ideally no page number

If part metadata is not already present, add it to `book/metadata.json` in a maintainable way.

---

# 10. Table of contents

Create a proper book-like TOC, not a plain Markdown list.

TOC should include:

- Preface
- Part I / II / III / IV
- Chapters 1–10
- Closing Note
- About the Author

If real page numbers are difficult, use a clean non-numbered TOC for now.

Do not show wrong page numbers.

Make entries clickable in PDF if practical.

---

# 11. Markdown parsing strategy

Do not convert all chapter Markdown into one blind continuous stream.

Use a structured assembly step:

1. Read `book/metadata.json`.
2. Determine chapter order.
3. Determine which chapters are front matter, main chapters, closing note, and About the Author.
4. For each main chapter:
   - derive chapter number
   - derive title
   - derive subtitle/objective if available
   - render a chapter title page
   - render chapter body separately
5. Strip duplicate first-level heading from the body content.
6. Preserve `##` and lower headings inside chapter body.
7. Preserve diagrams, tables, code blocks, and links.

---

# 12. Template architecture

Refactor templates if helpful.

Recommended structure:

```text
book/templates/
  cover.html
  back-cover.html
  copyright.html
  toc.html
  part-divider.html
  chapter-title.html
  book.html
```

Or use template functions inside:

```text
scripts/build-book-pdf.mjs
```

Keep route/simple template files thin and maintainable.

---

# 13. CSS requirements

Update:

```text
book/styles/book.css
```

Add/verify CSS for:

- `.cover-page`
- `.back-cover-page`
- `.front-matter`
- `.copyright-page`
- `.toc-page`
- `.part-divider-page`
- `.chapter-title-page`
- `.chapter-content`
- `.about-author-page`
- `.author-portrait`
- figure/image handling
- table handling
- code block handling
- page breaks

Suggested CSS concepts:

```css
.cover-page,
.back-cover-page {
  break-after: page;
  page-break-after: always;
  margin: 0;
}

.chapter-title-page {
  break-before: page;
  break-after: page;
  page-break-before: always;
  page-break-after: always;
  min-height: 100vh;
}

.chapter-content {
  break-before: page;
  page-break-before: always;
}

.about-author-page {
  break-before: page;
  page-break-before: always;
}

.book-content img,
.chapter-content img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.5rem auto 0.5rem;
}

.author-portrait {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 999px;
}
```

Avoid CSS that works in browser preview but fails in Puppeteer.

---

# 14. Cover/back-cover image path handling

Ensure the script resolves local image paths correctly when generating PDF.

If relative paths fail in Puppeteer:

- convert image paths to `file://` URLs
- or copy assets into a temporary build directory
- or inline images as base64 only if reasonable

Validate that both covers render, not broken image icons.

---

# 15. Visual design direction

The final PDF should feel like:

- premium technical handbook
- editorial and book-like
- not a college assignment
- not a raw Markdown export
- not a web page printed to PDF

Design characteristics:

- strong cover/back-cover system
- refined TOC
- dedicated chapter title pages
- spacious layout
- clean typography
- subtle architectural motifs
- polished figure captions
- readable code blocks
- stable tables
- deliberate page breaks

Avoid:

- page number on cover
- normal Markdown title at top of every chapter
- cramped diagrams
- broken image paths
- headings split awkwardly at page breaks
- orphaned section titles
- long code lines clipped at page edge
- About the Author glued to previous content

---

# 16. Validation

Run:

```bash
npm run book:pdf
```

Then, if scripts exist:

```bash
npm run lint
npm run typecheck
npm run build
```

Manual PDF QA checklist:

1. Front cover image appears as page 1.
2. Front cover has no visible page number/header/footer.
3. Copyright/license page exists.
4. TOC looks designed, not like raw Markdown.
5. Part divider pages exist if implemented.
6. Chapter 1 has a separate title page.
7. Every main chapter has a separate title page.
8. Chapter body starts after the title page.
9. First-level chapter heading is not duplicated in body.
10. About the Author starts on a separate page.
11. Author image appears on About the Author page if available.
12. Back cover image appears as final page if available.
13. Back cover has no visible page number/header/footer.
14. Diagrams still render correctly.
15. Tables do not overflow.
16. Code blocks do not clip.
17. Links remain clickable where possible.
18. The PDF feels like a book, not a Markdown export.

---

# 17. Final report required

At the end, summarize:

1. files changed
2. PDF generation strategy used
3. whether front cover image is detected and used
4. whether back cover image is detected and used
5. whether author image is detected and used
6. whether cover page number/header/footer is removed
7. whether back cover page number/header/footer is removed
8. whether chapter title pages are implemented
9. whether part divider pages are implemented
10. whether About the Author starts on a separate page
11. TOC improvements made
12. CSS/template/script changes made
13. PDF generation result
14. manual QA findings
15. any remaining limitations or manual recommendations
