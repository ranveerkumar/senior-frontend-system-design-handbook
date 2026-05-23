# Fix PDF Cover Image Rendering and TOC Page Numbers

You are inside the `senior-frontend-system-design-handbook` repository.

The PDF generation pipeline has been upgraded, but the generated PDF has two major issues:

1. The front cover and back cover pages are blank / solid dark green pages instead of showing the actual cover graphics.
2. The Table of Contents / Index page lists chapter names but does not show page numbers against them.

The cover graphics are already placed in the expected folder, but the PDF script is not rendering them correctly.

---

## Current expected assets

The repository should contain:

```text
book/assets/cover/senior-frontend-system-design-front-cover.png
book/assets/cover/senior-frontend-system-design-back-cover.png
```

It may also contain:

```text
book/assets/cover/cover-source-notes.md
book/assets/author/ranveer-kumar-author.png
book/assets/author/ranveer-kumar-author.webp
```

Current build command:

```bash
npm run book:pdf
```

Current output problem:

- cover page renders as solid dark fill
- back cover renders as solid dark fill
- TOC has no page numbers

---

# Objective

Fix the automated PDF generation pipeline so that:

1. Front cover image appears correctly as page 1.
2. Back cover image appears correctly as the final page.
3. Cover and back cover have no header/footer/page number.
4. Table of Contents includes page numbers against chapters/sections.
5. PDF remains fully automated through `npm run book:pdf`.

---

# Part 1 — Diagnose cover rendering

Inspect:

```text
scripts/build-book-pdf.mjs
book/templates/*.html
book/styles/book.css
book/assets/cover/
```

Check:

1. Are the cover image files actually present?
2. Are the filenames exactly correct?
3. Are paths case-sensitive and correct?
4. Is the script resolving image paths relative to repo root or script directory?
5. Is Puppeteer allowed to load local files?
6. Are local file paths converted to `file://` URLs?
7. Is the image being used as a CSS `background-image` with a broken URL?
8. Is a fallback cover background being shown because the script thinks the image is missing?
9. Is the image hidden behind an overlay?
10. Is the cover container dimensions incorrect?

---

# Part 2 — Required cover image implementation

Do not rely on relative CSS background URLs for the cover image unless confirmed working.

Preferred implementation:

1. Resolve cover image path using Node’s `path.resolve()`.
2. Check existence using `fs.existsSync()`.
3. Convert the absolute filesystem path to a file URL using `pathToFileURL()` from `node:url`.
4. Use that file URL in the generated HTML.

Example pattern:

```js
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();

function getAssetFileUrl(relativePath) {
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return pathToFileURL(absolutePath).href;
}

const frontCoverUrl = getAssetFileUrl(
  "book/assets/cover/senior-frontend-system-design-front-cover.png"
);

const backCoverUrl = getAssetFileUrl(
  "book/assets/cover/senior-frontend-system-design-back-cover.png"
);
```

Then render cover as an `<img>`, not just background CSS:

```html
<section class="cover-page image-cover">
  <img src="${frontCoverUrl}" alt="Senior Frontend System Design Handbook front cover" />
</section>
```

Back cover:

```html
<section class="back-cover-page image-cover">
  <img src="${backCoverUrl}" alt="Senior Frontend System Design Handbook back cover" />
</section>
```

CSS:

```css
.cover-page,
.back-cover-page,
.image-cover {
  width: 210mm;
  height: 297mm;
  margin: 0;
  padding: 0;
  page-break-after: always;
  break-after: page;
  overflow: hidden;
  background: #050b09;
}

.image-cover img {
  display: block;
  width: 210mm;
  height: 297mm;
  object-fit: cover;
  object-position: center;
}
```

If the PDF uses a different page size, keep A4 portrait.

---

# Part 3 — Puppeteer local asset settings

When generating PDF, ensure Puppeteer can load local files.

If using `page.setContent(html)`, local `file://` image URLs should work, but wait until images are loaded before PDF generation.

Add a wait helper:

```js
await page.setContent(html, {
  waitUntil: ["load", "domcontentloaded", "networkidle0"],
});

await page.evaluate(async () => {
  const images = Array.from(document.images);
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
    })
  );
});
```

If image loading fails, log the failing image paths.

Add debug logging:

```js
console.log("Front cover:", frontCoverUrl);
console.log("Back cover:", backCoverUrl);
```

Do not leave excessive noisy logs, but keep useful build output if appropriate.

---

# Part 4 — Ensure no dark overlay hides the image

Inspect CSS for:

```css
.cover-page::before
.cover-page::after
.back-cover-page::before
.back-cover-page::after
```

If overlays exist, ensure they are disabled when `.image-cover` is used.

Example:

```css
.image-cover::before,
.image-cover::after {
  display: none;
}
```

Also ensure `.image-cover img` is not behind another absolutely positioned element.

---

# Part 5 — Header/footer/page number suppression on covers

If Puppeteer uses `displayHeaderFooter: true`, header/footer may appear on all pages.

If that causes issues, use one of these strategies.

## Preferred simple strategy

Use CSS-based page numbers instead of Puppeteer header/footer, and exclude cover/back-cover pages.

## Alternative strategy

Use multi-pass generation:

1. Generate front cover PDF with `displayHeaderFooter: false`.
2. Generate body PDF with `displayHeaderFooter: true` if needed.
3. Generate back cover PDF with `displayHeaderFooter: false`.
4. Merge PDFs.

Only use PDF merging if required.

Minimum requirement:

- cover image must appear
- back cover image must appear
- no visible page number on covers

---

# Part 6 — Fix Table of Contents page numbers

The current TOC / Index lists chapter names but has no page numbers.

Implement proper TOC page numbers.

## Important reality

With Puppeteer/HTML-to-PDF, true page-numbered TOC is not automatic unless using CSS paged media features or a two-pass render.

Choose a reliable approach.

---

## Preferred approach — Two-pass TOC generation

Implement a two-pass PDF build:

### Pass 1 — Generate draft body

Generate the full PDF with all pages and stable layout.

### Pass 2 — Determine page numbers

Use one of these approaches:

1. Insert hidden anchors for every TOC target and use browser/PDF layout measurement to estimate page number.
2. Use Puppeteer page layout positions before PDF generation:
   - render HTML in browser
   - measure each anchor’s `getBoundingClientRect().top`
   - divide by page content height
   - calculate page number
3. If using a PDF parsing library already available, inspect generated PDF page count/anchors if feasible.

Recommended browser measurement approach:

- Each major section/chapter title page should have an anchor:
  ```html
  <section id="chapter-01" class="chapter-title-page" data-toc-title="Beyond the Component">
  ```
- After `page.setContent`, evaluate:
  ```js
  const pageHeightPx = ...; // derive from A4 at print CSS scale or measured page boxes
  const entries = [...document.querySelectorAll("[data-toc-title]")].map((el) => {
    const rect = el.getBoundingClientRect();
    const absoluteTop = rect.top + window.scrollY;
    const pageNumber = Math.floor(absoluteTop / pageHeightPx) + 1;
    return { title: el.dataset.tocTitle, pageNumber };
  });
  ```
- Rebuild the TOC HTML with those page numbers.
- Generate the final PDF.

If exact page numbers are difficult, get close and verify. But do not leave blank page-number columns.

---

## Alternative approach — CSS target-counter

If Chromium/Puppeteer supports it sufficiently in this environment, use CSS paged media style:

```css
.toc a::after {
  content: target-counter(attr(href), page);
}
```

But verify it actually works in generated PDF. If it does not work, do not keep it.

---

## Fallback approach — Static calculated page numbers

If the book layout is stable and each chapter title page/body sequence is deterministic, generate page numbers from known page breaks and chapter page counts after a first render. But prefer the two-pass method.

---

# Part 7 — TOC visual design

TOC should look like a book TOC, not a plain list.

Required:

- title: `Contents`
- grouped parts
- chapter numbers
- chapter titles
- right-aligned page numbers
- leader lines or subtle horizontal rules
- no broken or missing page numbers

Example layout:

```text
Part I — The Senior Frontend Mental Model

Chapter 1    Beyond the Component .......................... 7

Part II — Data, State, and Dynamic UI

Chapter 2    Real-Time Frontend Systems ..................... 15
Chapter 3    High-Density Data Management ................... 27
```

CSS suggestion:

```css
.toc-entry {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.75rem;
  align-items: baseline;
}

.toc-leader {
  border-bottom: 1px dotted rgba(90, 90, 90, 0.35);
  transform: translateY(-0.25rem);
}

.toc-page-number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

---

# Part 8 — Add diagnostics command or build output

When `npm run book:pdf` runs, print concise build diagnostics:

```text
Front cover image: found
Back cover image: found
Author image: found
TOC page numbers: generated
Output: pdf/senior-frontend-system-design-handbook-v1.1.pdf
```

If an asset is missing, print:

```text
Front cover image: missing — falling back to HTML cover
```

This helps avoid silent failures.

---

# Part 9 — Validation

Run:

```bash
npm run book:pdf
```

Then inspect the generated PDF.

Verify:

1. Front cover is the actual designed image, not a solid fill.
2. Back cover is the actual designed image, not a solid fill.
3. No page number appears on the cover.
4. No page number appears on the back cover.
5. TOC includes page numbers for:
   - Preface
   - Chapter 1
   - Chapter 2
   - Chapter 3
   - Chapter 4
   - Chapter 5
   - Chapter 6
   - Chapter 7
   - Chapter 8
   - Chapter 9
   - Chapter 10
   - Closing Note
   - About the Author
6. TOC page numbers are reasonably accurate.
7. Chapter title pages still render.
8. About the Author starts separately.
9. Diagrams still render.
10. No broken image icons.
11. No major layout regression.

Also run if available:

```bash
npm run lint
npm run typecheck
npm run build
```

---

# Part 10 — Final report required

At the end, summarize:

1. files changed
2. why cover images were rendering blank
3. how front cover rendering was fixed
4. how back cover rendering was fixed
5. whether image paths are resolved using file URLs
6. whether image loading is awaited before PDF generation
7. whether cover/back cover headers/footers/page numbers are suppressed
8. TOC page-number strategy used
9. TOC entries now showing page numbers
10. validation command results
11. remaining limitations, if any
