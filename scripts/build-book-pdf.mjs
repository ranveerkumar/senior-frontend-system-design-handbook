#!/usr/bin/env node
/**
 * Senior Frontend System Design Handbook — Premium PDF Build Script
 *
 * Strategy: Three-pass PDF generation
 *   Pass 1 — cover.pdf      (front cover, no header/footer, zero margins, full-bleed)
 *   Pass 2 — body.pdf       (copyright → TOC → chapters → author, with page numbers)
 *   Pass 3 — back-cover.pdf (back cover, no header/footer, zero margins, full-bleed)
 *   Merge   — pdf-lib merges cover + body + back-cover into the final output PDF
 *
 * Usage:  npm run book:pdf
 * Output: pdf/senior-frontend-system-design-handbook.pdf
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");
const BOOK_DIR  = join(ROOT, "book");
const OUTPUT_DIR = join(ROOT, "pdf");

// ─── Load dependencies ───────────────────────────────────────────────────────

let marked, puppeteer, PDFDocument;

try {
  ({ marked } = await import("marked"));
} catch {
  console.error("\n[book:pdf] Missing dependency: marked\n  Run: npm install --save-dev marked\n");
  process.exit(1);
}

try {
  puppeteer = (await import("puppeteer")).default;
} catch {
  console.error("\n[book:pdf] Missing dependency: puppeteer\n  Run: npm install --save-dev puppeteer\n");
  process.exit(1);
}

try {
  ({ PDFDocument } = await import("pdf-lib"));
} catch {
  console.error("\n[book:pdf] Missing dependency: pdf-lib\n  Run: npm install --save-dev pdf-lib\n");
  process.exit(1);
}

// ─── Book metadata ────────────────────────────────────────────────────────────

const metadata = JSON.parse(readFileSync(join(BOOK_DIR, "metadata.json"), "utf-8"));

// ─── Parts structure ──────────────────────────────────────────────────────────

const PARTS = [
  {
    number: "I",
    title: "The Senior Frontend Mental Model",
    description: "From component thinking to system design judgment",
    chapters: [1],
  },
  {
    number: "II",
    title: "Data, State, and Dynamic UI",
    description: "Real-time systems, high-density data, dynamic UI, and state architecture",
    chapters: [2, 3, 4, 5],
  },
  {
    number: "III",
    title: "Performance, Platform, and Reliability",
    description: "Performance architecture, frontend platforms, and failure handling at system scale",
    chapters: [6, 7, 8],
  },
  {
    number: "IV",
    title: "Security and Interviews",
    description: "Security architecture and senior system design interview playbook",
    chapters: [9, 10],
  },
];

// chapter number → part (for part divider injection)
const CHAPTER_TO_PART = {};
for (const part of PARTS) {
  for (const ch of part.chapters) CHAPTER_TO_PART[ch] = part;
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const CSS_PATH            = join(BOOK_DIR, "styles", "book.css");
const DIAGRAMS_DIR        = join(BOOK_DIR, "assets", "diagrams");
const FRONT_COVER_PATH    = join(BOOK_DIR, "assets", "cover", "senior-frontend-system-design-front-cover.png");
const BACK_COVER_PATH     = join(BOOK_DIR, "assets", "cover", "senior-frontend-system-design-back-cover.png");

// ─── Configure marked ─────────────────────────────────────────────────────────

marked.setOptions({ gfm: true, breaks: false });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readFile(path) {
  return readFileSync(path, "utf-8");
}

function cssUrl() {
  return readFile(CSS_PATH);
}

function rewriteSvgPaths(html) {
  return html.replace(
    /src="\.\.\/assets\/diagrams\/([^"]+\.svg)"/g,
    (_, filename) => `src="${pathToFileURL(join(DIAGRAMS_DIR, filename)).href}"`
  );
}

function filterNavLines(lines) {
  return lines.filter(
    (line) =>
      !/^\[← /.test(line) &&
      !/^\*Source: /.test(line) &&
      !/^\[Table of Contents\]/.test(line)
  );
}

function trimTrailingBlankLines(lines) {
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}

function mdToHtml(markdown) {
  const html = marked.parse(markdown);
  return rewriteSvgPaths(html);
}

function htmlDoc(css, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${metadata.title}</title>
  <style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}

// ─── Parse chapter markdown ───────────────────────────────────────────────────

function parseChapter(filePath, chapterNum) {
  const raw = readFile(join(BOOK_DIR, filePath));
  const lines = raw.split("\n");

  // Extract title from first # heading
  let title = "";
  let shortTitle = "";
  let titleLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) {
      title = lines[i].replace(/^#\s+/, "").trim();
      shortTitle = title.replace(/^Chapter\s+\d+:\s*/i, "").trim();
      titleLineIndex = i;
      break;
    }
  }

  // Extract subtitle from **Chapter objective:** line
  let subtitle = "";
  for (const line of lines) {
    const m = line.match(/^\*\*Chapter objective:\*\*\s*(.+)/);
    if (m) {
      subtitle = m[1].trim();
      break;
    }
  }

  // Body: everything after the h1, navigation stripped, trailing blanks removed
  const bodyLines = titleLineIndex >= 0 ? lines.slice(titleLineIndex + 1) : lines;
  const cleaned = trimTrailingBlankLines(filterNavLines(bodyLines));
  const bodyHtml = mdToHtml(cleaned.join("\n"));

  return { number: chapterNum, title, shortTitle, subtitle, bodyHtml };
}

// ─── Page builders ────────────────────────────────────────────────────────────

function coverImageHtml() {
  if (existsSync(FRONT_COVER_PATH)) {
    const coverUrl = pathToFileURL(FRONT_COVER_PATH).href;
    return `
<div class="cover-page cover-page--image">
  <img src="${coverUrl}" alt="${metadata.title}" class="cover-full-image" />
</div>`;
  }

  // Auto-generated styled cover
  return `
<div class="cover-page cover-page--html">
  <div class="cover-inner">
    <p class="cover-eyebrow">Senior Frontend System Design</p>
    <h1 class="cover-title">${metadata.title}</h1>
    <p class="cover-subtitle">${metadata.subtitle}</p>
    <hr class="cover-rule" />
    <p class="cover-author">${metadata.author}</p>
    <p class="cover-meta">${metadata.authorTitle}</p>
    <p class="cover-meta">${metadata.blogUrl}</p>
    <div class="cover-footer-meta">
      <span>Version ${metadata.version}</span>
      <span class="cover-meta-sep">·</span>
      <span>${metadata.publicationDate}</span>
      <span class="cover-meta-sep">·</span>
      <span>${metadata.license}</span>
    </div>
  </div>
</div>`;
}

function backCoverHtml() {
  if (existsSync(BACK_COVER_PATH)) {
    const backCoverUrl = pathToFileURL(BACK_COVER_PATH).href;
    return `
<div class="back-cover-page back-cover-page--image">
  <img src="${backCoverUrl}" alt="${metadata.title} — Back Cover" class="cover-full-image" />
</div>`;
  }

  // HTML fallback — mirrors the front cover style
  return `
<div class="back-cover-page back-cover-page--html">
  <div class="cover-inner">
    <p class="cover-eyebrow">Beyond the Component</p>
    <p class="back-cover-blurb">${metadata.description}</p>
    <hr class="cover-rule" />
    <p class="cover-author">${metadata.author}</p>
    <p class="cover-meta">${metadata.authorUrl}</p>
    <p class="cover-meta">${metadata.blogUrl}</p>
    <div class="cover-footer-meta">
      <span>Version ${metadata.version}</span>
      <span class="cover-meta-sep">·</span>
      <span>${metadata.license}</span>
    </div>
  </div>
</div>`;
}

function copyrightHtml() {
  return `
<div class="copyright-page">
  <div class="copyright-content">
    <p class="copyright-book-title">${metadata.title}</p>
    <p class="copyright-subtitle">${metadata.subtitle}</p>

    <p>Copyright &copy; ${new Date(metadata.publicationDate).getFullYear()} ${metadata.author}</p>
    <p>All rights reserved.</p>

    <p>This work is licensed under the
       <strong>Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International</strong>
       (CC&nbsp;BY-NC-ND&nbsp;4.0) License.</p>
    <p>You are free to share this work with attribution for non-commercial purposes.
       You may not distribute modified versions or use it for commercial purposes
       without prior written permission.</p>

    <p>Published: ${metadata.publicationDate}</p>
    <p>Version: ${metadata.version}</p>

    <p>Author: <a href="${metadata.authorUrl}">${metadata.authorUrl}</a></p>
    <p>Blog: <a href="${metadata.blogUrl}">${metadata.blogUrl}</a></p>
    <p>Source series: <a href="${metadata.sourceSeriesUrl}">${metadata.sourceSeriesUrl}</a></p>
  </div>
</div>`;
}

function tocHtml(chapters) {
  // Build chapter entries grouped by part
  const mainChapters = chapters.filter((ch) => ch.number >= 1 && ch.number <= 10);

  let partRows = "";
  for (const part of PARTS) {
    partRows += `
      <div class="toc-part">
        <div class="toc-part-label">Part ${part.number} &mdash; ${part.title}</div>`;
    for (const chNum of part.chapters) {
      const ch = mainChapters.find((c) => c.number === chNum);
      if (ch) {
        partRows += `
        <div class="toc-chapter">
          <span class="toc-chapter-num">Chapter ${ch.number}</span>
          <span class="toc-chapter-dot">&middot;</span>
          <span class="toc-chapter-name">${ch.shortTitle}</span>
        </div>`;
      }
    }
    partRows += `\n      </div>`;
  }

  return `
<div class="toc-page">
  <h1 class="toc-heading">Contents</h1>
  <nav class="toc">
    <div class="toc-item toc-item--front">Preface</div>
    ${partRows}
    <div class="toc-divider"></div>
    <div class="toc-item toc-item--back">Closing Note</div>
    <div class="toc-item toc-item--back">About the Author</div>
  </nav>
</div>`;
}

function prefaceHtml(chapter) {
  return `
<div class="front-matter-page chapter-content" id="preface">
  <h1 class="front-matter-heading">Preface</h1>
  ${chapter.bodyHtml}
</div>`;
}

function partDividerHtml(part) {
  // Simple bullet list of chapter titles for this part
  const chapterList = part.chapters
    .map((n) => `<li>Chapter ${n}</li>`)
    .join("\n        ");

  return `
<div class="part-divider-page" id="part-${part.number}">
  <div class="part-divider-content">
    <div class="part-divider-eyebrow">Part ${part.number}</div>
    <div class="part-divider-title">${part.title}</div>
    <div class="part-divider-rule"></div>
    <div class="part-divider-desc">${part.description}</div>
    <ul class="part-divider-chapters">
      ${chapterList}
    </ul>
  </div>
</div>`;
}

function chapterTitlePageHtml(chapter) {
  return `
<div class="chapter-title-page" id="chapter-${chapter.number}-title">
  <div class="chapter-title-content">
    <div class="chapter-title-eyebrow">Chapter ${chapter.number}</div>
    <div class="chapter-title-rule"></div>
    <h1 class="chapter-title-heading">${chapter.shortTitle}</h1>
    ${chapter.subtitle ? `<p class="chapter-title-subtitle">${chapter.subtitle}</p>` : ""}
  </div>
</div>`;
}

function chapterContentHtml(chapter) {
  return `
<div class="chapter-content" id="chapter-${chapter.number}">
  ${chapter.bodyHtml}
</div>`;
}

function closingNoteHtml(chapter) {
  return `
<div class="chapter-content closing-note-page" id="closing-note">
  <h1 class="front-matter-heading">Closing Note</h1>
  ${chapter.bodyHtml}
</div>`;
}

function aboutAuthorHtml(chapter) {
  // Check for author image
  const authorImagePaths = [
    join(BOOK_DIR, "assets", "author", "ranveer-kumar-author.png"),
    join(BOOK_DIR, "assets", "author", "ranveer-kumar-author.webp"),
  ];
  const authorImagePath = authorImagePaths.find((p) => existsSync(p));
  const authorImageHtml = authorImagePath
    ? `<img src="${pathToFileURL(authorImagePath).href}" alt="${metadata.author}" class="author-portrait" />`
    : `<div class="author-portrait-monogram">RK</div>`;

  // Strip the leading "## Ranveer Kumar" h2 — it's already shown in the header above
  const bodyHtml = chapter.bodyHtml.replace(/^\s*<h2>[^<]*<\/h2>\s*/, "");

  return `
<div class="about-author-page" id="about-author">
  <div class="about-author-header">
    ${authorImageHtml}
    <div class="about-author-title-block">
      <div class="about-author-eyebrow">About the Author</div>
      <h1 class="about-author-name">${metadata.author}</h1>
      <p class="about-author-role">${metadata.authorTitle}</p>
    </div>
  </div>
  ${bodyHtml}
</div>`;
}

// ─── Build body HTML ──────────────────────────────────────────────────────────

function buildBodyHtml(parsedChapters) {
  const css = cssUrl();

  // Separate chapters by role
  const preface       = parsedChapters.find((c) => c.number === 0);
  const mainChapters  = parsedChapters.filter((c) => c.number >= 1 && c.number <= 10);
  const closingNote   = parsedChapters.find((c) => c.number === 11);
  const aboutAuthor   = parsedChapters.find((c) => c.number === 12);

  const sections = [];

  // Copyright page
  sections.push(copyrightHtml());

  // TOC
  sections.push(tocHtml(mainChapters));

  // Preface (front matter — no chapter title page)
  if (preface) sections.push(prefaceHtml(preface));

  // Parts + chapters
  let lastPartNum = null;
  for (const chapter of mainChapters) {
    const part = CHAPTER_TO_PART[chapter.number];
    if (part && part.number !== lastPartNum) {
      sections.push(partDividerHtml(part));
      lastPartNum = part.number;
    }
    sections.push(chapterTitlePageHtml(chapter));
    sections.push(chapterContentHtml(chapter));
  }

  // Closing note
  if (closingNote) sections.push(closingNoteHtml(closingNote));

  // About the Author (dedicated page)
  if (aboutAuthor) sections.push(aboutAuthorHtml(aboutAuthor));

  return htmlDoc(css, sections.join("\n"));
}

// ─── PDF rendering helpers ────────────────────────────────────────────────────

async function renderHtmlToPdf(browser, htmlPath, pdfPath, options = {}) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });
  await page.pdf({ path: pdfPath, format: "A4", printBackground: true, ...options });
  await page.close();
}

// ─── Main build ───────────────────────────────────────────────────────────────

async function buildPdf() {
  console.log("\n[book:pdf] Building Senior Frontend System Design Handbook PDF...\n");

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const css = cssUrl();

  // ── Parse all chapters ───────────────────────────────────────────────────
  const parsedChapters = [];
  for (const [index, chapter] of metadata.chapters.entries()) {
    // Determine chapter number from file name (00 = preface, 01–10 = chapters, 11 = closing, 12 = author)
    const fileNum = parseInt(chapter.file.match(/^chapters\/(\d+)/)?.[1] ?? "0", 10);
    console.log(`  [${String(fileNum).padStart(2, "0")}] Parsing: ${chapter.title}`);
    parsedChapters.push(parseChapter(chapter.file, fileNum));
  }

  // ── Generate cover HTML ─────────────────────────────────────────────────
  const coverHtmlContent     = htmlDoc(css, coverImageHtml());
  const coverHtmlPath        = join(OUTPUT_DIR, "_cover.html");
  const coverPdfPath         = join(OUTPUT_DIR, "_cover.pdf");

  writeFileSync(coverHtmlPath, coverHtmlContent, "utf-8");

  // ── Generate body HTML ──────────────────────────────────────────────────
  const bodyHtmlContent      = buildBodyHtml(parsedChapters);
  const bodyHtmlPath         = join(OUTPUT_DIR, "_body.html");
  const bodyPdfPath          = join(OUTPUT_DIR, "_body.pdf");

  writeFileSync(bodyHtmlPath, bodyHtmlContent, "utf-8");

  // ── Generate back cover HTML ─────────────────────────────────────────────
  const backCoverHtmlContent = htmlDoc(css, backCoverHtml());
  const backCoverHtmlPath    = join(OUTPUT_DIR, "_back-cover.html");
  const backCoverPdfPath     = join(OUTPUT_DIR, "_back-cover.pdf");

  writeFileSync(backCoverHtmlPath, backCoverHtmlContent, "utf-8");

  console.log(`\n  HTML files written.`);

  // ── Launch Puppeteer ────────────────────────────────────────────────────
  console.log("  Launching headless browser...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--allow-file-access-from-files"],
  });

  const fullBleedOptions = {
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    displayHeaderFooter: false,
  };
  const bodyOptions = {
    margin: { top: "2cm", right: "2.2cm", bottom: "2.4cm", left: "2.2cm" },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `
      <div style="width:100%;text-align:center;font-size:8.5pt;
                  color:#9a9589;font-family:Inter,sans-serif;
                  padding-bottom:0.4cm;">
        <span class="pageNumber"></span>
      </div>`,
  };

  // ── Pass 1: Front cover PDF (full-bleed, no header/footer) ─────────────
  console.log("  Rendering front cover PDF...");
  await renderHtmlToPdf(browser, coverHtmlPath, coverPdfPath, fullBleedOptions);

  // ── Pass 2: Body PDF (standard margins, page numbers in footer) ─────────
  console.log("  Rendering body PDF...");
  await renderHtmlToPdf(browser, bodyHtmlPath, bodyPdfPath, bodyOptions);

  // ── Pass 3: Back cover PDF (full-bleed, no header/footer) ──────────────
  console.log("  Rendering back cover PDF...");
  await renderHtmlToPdf(browser, backCoverHtmlPath, backCoverPdfPath, fullBleedOptions);

  await browser.close();

  // ── Merge: front cover + body + back cover ───────────────────────────────
  console.log("  Merging PDFs...");

  const coverBytes     = readFileSync(coverPdfPath);
  const bodyBytes      = readFileSync(bodyPdfPath);
  const backCoverBytes = readFileSync(backCoverPdfPath);

  const coverPdf     = await PDFDocument.load(coverBytes);
  const bodyPdf      = await PDFDocument.load(bodyBytes);
  const backCoverPdf = await PDFDocument.load(backCoverBytes);

  const finalPdf = await PDFDocument.create();

  // Front cover (page 1)
  const [coverPage] = await finalPdf.copyPages(coverPdf, [0]);
  finalPdf.addPage(coverPage);

  // Body pages
  const bodyPageIndices = Array.from({ length: bodyPdf.getPageCount() }, (_, i) => i);
  const bodyPages = await finalPdf.copyPages(bodyPdf, bodyPageIndices);
  for (const page of bodyPages) finalPdf.addPage(page);

  // Back cover (last page)
  const [backCoverPage] = await finalPdf.copyPages(backCoverPdf, [0]);
  finalPdf.addPage(backCoverPage);

  // Set PDF metadata
  finalPdf.setTitle(metadata.title);
  finalPdf.setAuthor(metadata.author);
  finalPdf.setSubject(metadata.description);
  finalPdf.setKeywords(["frontend", "system design", "architecture", "senior", "handbook"]);
  finalPdf.setCreationDate(new Date(metadata.publicationDate));
  finalPdf.setModificationDate(new Date());

  const finalPdfBytes = await finalPdf.save();
  const finalPdfPath  = join(OUTPUT_DIR, "senior-frontend-system-design-handbook.pdf");
  writeFileSync(finalPdfPath, finalPdfBytes);

  // Also copy the body HTML to the main output location for reference
  writeFileSync(
    join(OUTPUT_DIR, "senior-frontend-system-design-handbook.html"),
    bodyHtmlContent,
    "utf-8"
  );

  // ── Cleanup temp files ──────────────────────────────────────────────────
  for (const p of [coverHtmlPath, coverPdfPath, bodyHtmlPath, bodyPdfPath, backCoverHtmlPath, backCoverPdfPath]) {
    try { unlinkSync(p); } catch { /* ignore */ }
  }

  console.log(`\n  PDF written: ${finalPdfPath}`);
  console.log(`\n[book:pdf] Done.\n`);
}

buildPdf().catch((err) => {
  console.error("\n[book:pdf] Build failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
