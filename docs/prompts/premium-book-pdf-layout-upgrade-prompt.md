# Premium Book PDF Layout Upgrade Prompt

You are inside the `senior-frontend-system-design-handbook` repository.

The current handbook PDF pipeline works, but the output still feels like a basic Markdown → HTML → PDF conversion. It looks closer to a college assignment or technical export than a polished book.

The goal is to upgrade the automated PDF generation pipeline so the output feels like a real technical book / premium digital handbook while keeping the process fully automated.

## Current context

The repository contains:

- `book/chapters/*.md`
- `book/assets/diagrams/*.svg`
- `book/assets/cover/` if a custom cover is supplied
- `book/styles/book.css`
- `book/templates/cover.html`
- `book/templates/book.html`
- `scripts/build-book-pdf.mjs`
- `npm run book:pdf`

The current PDF is functional, but it has these issues:

1. Page numbering starts on the cover page.
2. Page number is visible on the cover.
3. Chapters begin as normal headings at the top of the content flow.
4. There are no separate chapter title pages.
5. About the Author does not start on a dedicated page.
6. The document still feels like exported Markdown, not a designed book.

## Objective

Refactor the PDF generation pipeline and book template so the generated PDF has proper book structure:

- full-bleed cover page
- no visible page number on the cover
- front matter with appropriate pagination handling
- dedicated title pages for each major chapter
- chapter content begins after the chapter title page
- About the Author starts on its own dedicated page
- cleaner book-like typography, spacing, page breaks, and running headers/footers
- fully automated generation through `npm run book:pdf`

Do not make the workflow dependent on manual InDesign edits.

---

# 1. Book structure to generate

The PDF should be assembled in this logical order:

1. Cover page
2. Copyright / license page
3. Table of contents
4. Preface
5. Optional Introduction / How to use this handbook
6. Part divider pages, if implemented
7. Chapter title page for each chapter
8. Chapter content
9. Closing note
10. About the Author on a dedicated page
11. Optional back cover / final page

## Page numbering rules

Use professional book pagination behavior:

### Cover page
- No visible page number.
- Should not visually show header/footer.
- It can count internally or not, but no page number should appear.

### Copyright / license page
- No visible page number, or use roman numeral if easy.

### Table of contents and preface
Preferred:
- Roman numerals: i, ii, iii...

Acceptable:
- No visible page numbers for front matter.

### Main chapters
Preferred:
- Start Arabic numbering at Chapter 1 content or Chapter 1 title page.
- Page number should begin at `1` from the first main chapter title page or first main chapter content page.

If resetting page counter is difficult in Chromium/Puppeteer, implement at least:
- no page number on cover
- no header/footer on cover
- page numbers visible only from content pages onward
- no page number shown on chapter title pages if possible

Do not show page number on cover.

---

# 2. Cover page behavior

Support a custom cover image if supplied.

Preferred custom cover path:

`book/assets/cover/senior-frontend-system-design-cover.png`

Recommended cover image dimensions:

- A4 portrait
- 2480 × 3508 px
- 300 DPI

If the cover image exists:

- Use it as full-page cover.
- No margins.
- No header.
- No footer.
- No visible page number.
- No extra overlay text unless explicitly configured.

If the image does not exist:

- Use the existing auto-generated HTML/CSS cover.
- Still make it look premium and book-like.
- Still no visible page number.

---

# 3. Dedicated chapter title pages

Every major chapter must start with a separate chapter title page.

Do not render chapter title as only a heading at the top of normal content.

For each chapter, generate:

## Chapter title page

Example layout:

```text
Chapter 1

Beyond the Component

Senior frontend system design starts when we move from UI pieces to constraints, trade-offs, scale, failure modes, and measurable user outcomes.
```

Visual treatment:

- full page or mostly full page
- generous whitespace
- chapter number prominent
- chapter title large
- short chapter subtitle / objective
- optional small motif or divider line
- no normal body text on the title page
- preferably no page number on chapter title pages, or a subtle footer if the style demands it

## Chapter content page

The actual chapter content begins on the following page.

The first content page should not repeat the huge chapter title again.

It may show a smaller running heading if needed.

---

# 4. Part divider pages

If the book metadata supports parts, add part divider pages.

Recommended parts:

## Part I — The Senior Frontend Mental Model
- Chapter 1

## Part II — Data, State, and Dynamic UI
- Chapters 2, 3, 4, 5

## Part III — Performance, Platform, and Reliability
- Chapters 6, 7, 8

## Part IV — Security and Interviews
- Chapters 9, 10

Part divider pages should be optional but preferred.

Design:

- separate full page
- part number
- part title
- one-line description
- subtle architecture motif
- no page number if possible

---

# 5. About the Author dedicated page

The `About the Author` chapter must start on a separate page.

It should not run immediately after the previous chapter content.

Rules:

- Insert page break before About the Author.
- Use a dedicated title page or clean section opener.
- If author photo exists, optionally include it.
- Keep the layout book-like, not blog-like.
- Links should remain clickable in the PDF.

Potential author image paths:

- `book/assets/author/ranveer-kumar-author.png`
- `book/assets/author/ranveer-kumar-author.webp`
- `public/images/author/ranveer-kumar-og.webp` if copied from source project

If no image exists, use text-only layout.

---

# 6. Markdown parsing strategy

The script should not blindly convert every chapter Markdown into one continuous HTML stream.

Instead, create a structured assembly step:

1. Read `book/metadata.json`.
2. Determine chapter order.
3. For each chapter:
   - parse frontmatter or chapter metadata if present
   - derive chapter number
   - derive chapter title
   - derive short subtitle/objective
   - create chapter title page
   - render chapter body separately
4. Remove duplicate top-level `# Chapter Title` from body content if it is already shown on the chapter title page.
5. Preserve chapter section headings from `##` onward.

If chapters currently start with `# Title`, strip that first heading during body rendering and use it for the title page.

---

# 7. Template architecture

Refactor templates if needed.

Recommended structure:

```text
book/templates/
  cover.html
  book.html
  chapter-title.html
  part-divider.html
  copyright.html
  toc.html
  back-cover.html
```

Or use inline template functions in `scripts/build-book-pdf.mjs` if the repo is simpler.

Keep the implementation maintainable.

---

# 8. CSS requirements

Update `book/styles/book.css` to support proper book layout.

Add/verify CSS for:

- `.cover-page`
- `.front-matter`
- `.copyright-page`
- `.toc-page`
- `.part-divider-page`
- `.chapter-title-page`
- `.chapter-content`
- `.about-author-page`
- `.back-cover-page`
- page breaks
- print-safe typography
- figure handling
- table handling
- code block handling
- no page number on cover

Use print CSS:

```css
.cover-page {
  page-break-after: always;
  break-after: page;
}

.chapter-title-page {
  page-break-before: always;
  break-after: page;
  min-height: 100vh;
}

.chapter-content {
  page-break-before: always;
}

.about-author-page {
  page-break-before: always;
}
```

For Puppeteer PDF header/footer:

If the current script uses `displayHeaderFooter`, make sure:
- cover page does not show page number
- header/footer does not appear on cover
- if needed, generate cover separately and content separately, then merge PDFs only if unavoidable

Preferred:
- avoid visible header/footer on cover by structuring HTML/CSS first
- if Puppeteer cannot suppress header/footer per page, use CSS-based page numbers only where possible
- or generate cover PDF separately without header/footer and merge with the body PDF

If PDF merging is needed, use a minimal dependency only if justified.

---

# 9. PDF generation strategy options

Choose the cleanest reliable approach.

## Preferred Option A — Single Puppeteer PDF

Use one HTML document with CSS page breaks.

Pros:
- simple
- one pipeline
- fewer dependencies

Cons:
- harder to suppress header/footer only on cover

Use this if acceptable.

## Option B — Two-pass PDF

Generate:
1. cover PDF with no header/footer
2. body PDF with headers/footers/page numbers

Then merge.

Pros:
- clean cover without page number
- better book behavior

Cons:
- requires merge step/dependency

If using this, choose a lightweight PDF merge dependency and explain why.

## Option C — HTML cover page plus CSS page numbers only

Avoid Puppeteer header/footer and put page numbers in content pages via CSS.

Use if this gives sufficient quality.

---

# 10. Table of Contents

Create a proper Table of Contents page, not just a Markdown list.

TOC should include:

- Preface
- Part I / II / III / IV
- Chapters 1–10
- Closing Note
- About the Author

If real page numbers are difficult to calculate, create a clean non-numbered TOC for now.

Preferred:
- use chapter names and part grouping
- make links clickable in PDF where possible
- do not show broken page numbers

---

# 11. Visual design direction

Upgrade the design so it feels like a real book.

Design language:

- premium technical handbook
- editorial, not academic assignment
- strong chapter openers
- high-quality typography
- generous whitespace
- refined dividers
- consistent color palette
- subtle architecture/system motif
- readable code and diagrams
- elegant figure captions

Avoid:

- dense Markdown export look
- every page starting with a basic `# heading`
- visible raw Markdown hierarchy
- overly plain TOC
- page number on cover
- cramped diagrams
- code blocks clipped at page edge

---

# 12. Validation

Run:

```bash
npm run book:pdf
```

Then run if the repository supports these:

```bash
npm run lint
npm run typecheck
npm run build
```

Inspect the generated PDF manually.

Verify:

1. Cover has no visible page number.
2. Cover uses custom image if present.
3. Copyright/license page exists.
4. TOC looks book-like.
5. Chapter 1 has a separate title page.
6. Chapter 1 content starts after the title page.
7. All 10 chapters have separate title pages.
8. Part divider pages exist if implemented.
9. About the Author starts on a separate page.
10. Diagrams still render correctly.
11. Tables do not overflow.
12. Code blocks do not clip.
13. Links remain clickable.
14. The PDF feels like a technical handbook, not a Markdown export.

---

# 13. Final report required

At the end, summarize:

1. files changed
2. PDF generation strategy used
3. whether custom cover image is supported
4. whether cover page number is removed
5. whether chapter title pages are implemented
6. whether part divider pages are implemented
7. whether About the Author starts on a separate page
8. TOC improvements made
9. CSS/template changes made
10. whether PDF generation passes
11. manual QA findings
12. any remaining limitations
