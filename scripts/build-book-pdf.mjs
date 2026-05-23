#!/usr/bin/env node
/**
 * Senior Frontend System Design Handbook — Premium PDF Build Script
 *
 * Strategy: Three-pass Puppeteer PDF + pdf-lib merge, with two-pass TOC page numbers
 *
 *   Measurement pass — load body HTML in print media, measure section positions → page numbers
 *   Pass 1 — front cover PDF  (no header/footer, zero margins, full-bleed image)
 *   Pass 2 — body PDF         (copyright → TOC with page numbers → chapters → author)
 *   Pass 3 — back cover PDF   (no header/footer, zero margins, full-bleed image)
 *   Merge   — pdf-lib: front cover + body + back cover → final output
 *
 * Usage:  npm run book:pdf
 * Output: pdf/senior-frontend-system-design-handbook.pdf
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(__dirname, "..");
const BOOK_DIR   = join(ROOT, "book");
const OUTPUT_DIR = join(ROOT, "pdf");

// ─── Load dependencies ────────────────────────────────────────────────────────

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

// ─── Book metadata ─────────────────────────────────────────────────────────────

const metadata = JSON.parse(readFileSync(join(BOOK_DIR, "metadata.json"), "utf-8"));

// ─── Parts structure ───────────────────────────────────────────────────────────

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

const CHAPTER_TO_PART = {};
for (const part of PARTS) {
  for (const ch of part.chapters) CHAPTER_TO_PART[ch] = part;
}

// ─── Asset paths ───────────────────────────────────────────────────────────────

const CSS_PATH         = join(BOOK_DIR, "styles", "book.css");
const DIAGRAMS_DIR     = join(BOOK_DIR, "assets", "diagrams");
const FRONT_COVER_PATH = join(BOOK_DIR, "assets", "cover", "senior-frontend-system-design-front-cover.png");
const BACK_COVER_PATH  = join(BOOK_DIR, "assets", "cover", "senior-frontend-system-design-back-cover.png");
const AUTHOR_IMG_PATHS = [
  join(BOOK_DIR, "assets", "author", "ranveer-kumar-author.png"),
  join(BOOK_DIR, "assets", "author", "ranveer-kumar-author.webp"),
];

// ─── Configure marked ──────────────────────────────────────────────────────────

marked.setOptions({ gfm: true, breaks: false });

// ─── Helpers ───────────────────────────────────────────────────────────────────

const readFile = (p) => readFileSync(p, "utf-8");
const cssContent = () => readFile(CSS_PATH);

function rewriteSvgPaths(html) {
  return html.replace(
    /src="\.\.\/assets\/diagrams\/([^"]+\.svg)"/g,
    (_, filename) => `src="${pathToFileURL(join(DIAGRAMS_DIR, filename)).href}"`
  );
}

function filterNavLines(lines) {
  return lines.filter(
    (l) =>
      !/^\[← /.test(l) &&
      !/^\*Source: /.test(l) &&
      !/^\[Table of Contents\]/.test(l)
  );
}

function trimTrailing(lines) {
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}

function mdToHtml(md) {
  return rewriteSvgPaths(marked.parse(md));
}

function htmlDoc(css, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${metadata.title}</title>
  <style>${css}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

// ─── Parse chapter markdown ────────────────────────────────────────────────────

function parseChapter(filePath, chapterNum) {
  const raw = readFile(join(BOOK_DIR, filePath));
  const lines = raw.split("\n");

  let title = "", shortTitle = "", titleLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) {
      title = lines[i].replace(/^#\s+/, "").trim();
      shortTitle = title.replace(/^Chapter\s+\d+:\s*/i, "").trim();
      titleLineIndex = i;
      break;
    }
  }

  let subtitle = "";
  for (const line of lines) {
    const m = line.match(/^\*\*Chapter objective:\*\*\s*(.+)/);
    if (m) { subtitle = m[1].trim(); break; }
  }

  const bodyLines = titleLineIndex >= 0 ? lines.slice(titleLineIndex + 1) : lines;
  const cleaned = trimTrailing(filterNavLines(bodyLines));
  const bodyHtml = mdToHtml(cleaned.join("\n"));

  return { number: chapterNum, title, shortTitle, subtitle, bodyHtml };
}

// ─── Page builders ─────────────────────────────────────────────────────────────

function coverHtml() {
  if (existsSync(FRONT_COVER_PATH)) {
    const url = pathToFileURL(FRONT_COVER_PATH).href;
    return `
<div class="cover-page cover-page--image">
  <img src="${url}" alt="${metadata.title} — Front Cover" class="cover-full-image" />
</div>`;
  }
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
    const url = pathToFileURL(BACK_COVER_PATH).href;
    return `
<div class="back-cover-page back-cover-page--image">
  <img src="${url}" alt="${metadata.title} — Back Cover" class="cover-full-image" />
</div>`;
  }
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

// TOC entry builders
function tocEntry(label, name, pageNum) {
  const numHtml = pageNum != null ? `<span class="toc-pagenum">${pageNum}</span>` : `<span class="toc-pagenum"></span>`;
  return `
  <div class="toc-entry">
    <span class="toc-label">${label}</span>
    <span class="toc-name">${name}</span>
    <span class="toc-leader"></span>
    ${numHtml}
  </div>`;
}

function tocHtml(chapters, pageNums = {}) {
  const pg = (id) => pageNums[id] ?? null;
  const mainChapters = chapters.filter((c) => c.number >= 1 && c.number <= 10);

  let partRows = "";
  for (const part of PARTS) {
    partRows += `\n  <div class="toc-part-block">
    <div class="toc-part-heading">Part ${part.number} &mdash; ${part.title}</div>`;
    for (const chNum of part.chapters) {
      const ch = mainChapters.find((c) => c.number === chNum);
      if (ch) {
        partRows += tocEntry(
          `Chapter&nbsp;${ch.number}`,
          ch.shortTitle,
          pg(`chapter-${ch.number}`)
        );
      }
    }
    partRows += `\n  </div>`;
  }

  return `
<div class="toc-page">
  <h1 class="toc-heading">Contents</h1>
  <nav class="toc">
    ${tocEntry("Preface", "Preface", pg("preface"))}
    ${partRows}
    <div class="toc-divider"></div>
    ${tocEntry("", "Closing Note", pg("closing-note"))}
    ${tocEntry("", "About the Author", pg("about-author"))}
  </nav>
</div>`;
}

function prefaceHtml(chapter) {
  return `
<div class="front-matter-page chapter-content" id="preface"
     data-toc-id="preface" data-toc-title="Preface">
  <h1 class="front-matter-heading">Preface</h1>
  ${chapter.bodyHtml}
</div>`;
}

function partDividerHtml(part) {
  const chapterList = part.chapters.map((n) => `<li>Chapter ${n}</li>`).join("\n        ");
  return `
<div class="part-divider-page" id="part-${part.number}"
     data-toc-id="part-${part.number}" data-toc-title="Part ${part.number} — ${part.title}">
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
<div class="chapter-title-page" id="chapter-${chapter.number}-title"
     data-toc-id="chapter-${chapter.number}" data-toc-title="Chapter ${chapter.number} — ${chapter.shortTitle}">
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
<div class="chapter-content closing-note-page" id="closing-note"
     data-toc-id="closing-note" data-toc-title="Closing Note">
  <h1 class="front-matter-heading">Closing Note</h1>
  ${chapter.bodyHtml}
</div>`;
}

function aboutAuthorHtml(chapter) {
  const authorImagePath = AUTHOR_IMG_PATHS.find((p) => existsSync(p));
  const authorImageHtml = authorImagePath
    ? `<img src="${pathToFileURL(authorImagePath).href}" alt="${metadata.author}" class="author-portrait" />`
    : `<div class="author-portrait-monogram">RK</div>`;

  // Strip leading "## Ranveer Kumar" h2 — already shown in the header
  const bodyHtml = chapter.bodyHtml.replace(/^\s*<h2>[^<]*<\/h2>\s*/, "");

  return `
<div class="about-author-page" id="about-author"
     data-toc-id="about-author" data-toc-title="About the Author">
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

// ─── Build body HTML ───────────────────────────────────────────────────────────

function buildBodyHtml(parsedChapters, pageNums = {}) {
  const css = cssContent();
  const preface      = parsedChapters.find((c) => c.number === 0);
  const mainChapters = parsedChapters.filter((c) => c.number >= 1 && c.number <= 10);
  const closingNote  = parsedChapters.find((c) => c.number === 11);
  const aboutAuthor  = parsedChapters.find((c) => c.number === 12);

  const sections = [];
  sections.push(copyrightHtml());
  sections.push(tocHtml(mainChapters, pageNums));
  if (preface) sections.push(prefaceHtml(preface));

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

  if (closingNote) sections.push(closingNoteHtml(closingNote));
  if (aboutAuthor) sections.push(aboutAuthorHtml(aboutAuthor));

  return htmlDoc(css, sections.join("\n"));
}

// ─── TOC page number measurement ──────────────────────────────────────────────

// A4 at Chromium's 96 DPI resolution
const A4_HEIGHT_PX = (297 / 25.4) * 96; // ≈ 1122.5

async function measureTocPageNumbers(browser, htmlPath) {
  const page = await browser.newPage();

  // A4 viewport width, tall enough to not clip
  await page.setViewport({ width: 794, height: Math.round(A4_HEIGHT_PX) });
  await page.emulateMediaType("print");
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });

  // Wait for any images to finish loading
  await page.evaluate(async () => {
    const pending = Array.from(document.images).filter((img) => !img.complete);
    await Promise.all(
      pending.map(
        (img) =>
          new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve; // don't stall on broken images
          })
      )
    );
  });

  const entries = await page.evaluate((pageH) => {
    return Array.from(document.querySelectorAll("[data-toc-id]")).map((el) => ({
      id: el.dataset.tocId,
      pageNum: Math.floor((el.getBoundingClientRect().top + window.scrollY) / pageH) + 1,
    }));
  }, A4_HEIGHT_PX);

  await page.close();

  // Map toc-id → final PDF page number (body page + 1 for front cover)
  const pageNums = {};
  for (const { id, pageNum } of entries) {
    pageNums[id] = pageNum + 1;
  }
  return pageNums;
}

// ─── PDF rendering helper ──────────────────────────────────────────────────────

async function renderHtmlToPdf(browser, htmlPath, pdfPath, options = {}) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });

  // Wait for images
  await page.evaluate(async () => {
    const pending = Array.from(document.images).filter((img) => !img.complete);
    await Promise.all(
      pending.map(
        (img) =>
          new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          })
      )
    );
  });

  await page.pdf({ path: pdfPath, format: "A4", printBackground: true, ...options });
  await page.close();
}

// ─── Main build ────────────────────────────────────────────────────────────────

async function buildPdf() {
  console.log("\n[book:pdf] Building Senior Frontend System Design Handbook PDF...\n");

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // ── Asset diagnostics ─────────────────────────────────────────────────────
  const frontCoverFound = existsSync(FRONT_COVER_PATH);
  const backCoverFound  = existsSync(BACK_COVER_PATH);
  const authorImgPath   = AUTHOR_IMG_PATHS.find((p) => existsSync(p));

  console.log(`  Front cover image : ${frontCoverFound ? "found" : "missing — falling back to HTML cover"}`);
  console.log(`  Back cover image  : ${backCoverFound  ? "found" : "missing — falling back to HTML back-cover"}`);
  console.log(`  Author image      : ${authorImgPath   ? "found (" + authorImgPath.split("/").pop() + ")" : "missing — using monogram fallback"}`);
  console.log("");

  // ── Parse all chapters ─────────────────────────────────────────────────────
  const parsedChapters = [];
  for (const chapter of metadata.chapters) {
    const fileNum = parseInt(chapter.file.match(/^chapters\/(\d+)/)?.[1] ?? "0", 10);
    process.stdout.write(`  [${String(fileNum).padStart(2, "0")}] Parsing: ${chapter.title}\n`);
    parsedChapters.push(parseChapter(chapter.file, fileNum));
  }

  // ── Launch browser ─────────────────────────────────────────────────────────
  console.log("\n  Launching headless browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--allow-file-access-from-files"],
  });

  try {
    // ── Measurement pass: determine TOC page numbers ─────────────────────────
    console.log("  Measuring page positions for TOC...");
    const measureHtmlPath = join(OUTPUT_DIR, "_measure.html");
    writeFileSync(measureHtmlPath, buildBodyHtml(parsedChapters, {}), "utf-8");
    const pageNums = await measureTocPageNumbers(browser, measureHtmlPath);
    unlinkSync(measureHtmlPath);

    const tocEntryCount = Object.keys(pageNums).length;
    console.log(`  TOC page numbers  : generated (${tocEntryCount} entries)`);

    // ── Build final HTML with TOC page numbers ───────────────────────────────
    const css = cssContent();

    const coverHtmlPath     = join(OUTPUT_DIR, "_cover.html");
    const bodyHtmlPath      = join(OUTPUT_DIR, "_body.html");
    const backCoverHtmlPath = join(OUTPUT_DIR, "_back-cover.html");
    const coverPdfPath      = join(OUTPUT_DIR, "_cover.pdf");
    const bodyPdfPath       = join(OUTPUT_DIR, "_body.pdf");
    const backCoverPdfPath  = join(OUTPUT_DIR, "_back-cover.pdf");

    writeFileSync(coverHtmlPath,     htmlDoc(css, coverHtml()),     "utf-8");
    writeFileSync(bodyHtmlPath,      buildBodyHtml(parsedChapters, pageNums), "utf-8");
    writeFileSync(backCoverHtmlPath, htmlDoc(css, backCoverHtml()), "utf-8");

    const fullBleedOpts = {
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      displayHeaderFooter: false,
    };
    const bodyOpts = {
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

    // ── Pass 1: Front cover ───────────────────────────────────────────────────
    console.log("  Rendering front cover PDF...");
    await renderHtmlToPdf(browser, coverHtmlPath, coverPdfPath, fullBleedOpts);

    // ── Pass 2: Body ──────────────────────────────────────────────────────────
    console.log("  Rendering body PDF...");
    await renderHtmlToPdf(browser, bodyHtmlPath, bodyPdfPath, bodyOpts);

    // ── Pass 3: Back cover ────────────────────────────────────────────────────
    console.log("  Rendering back cover PDF...");
    await renderHtmlToPdf(browser, backCoverHtmlPath, backCoverPdfPath, fullBleedOpts);

    // ── Merge: front + body + back ────────────────────────────────────────────
    console.log("  Merging PDFs...");
    const coverPdf     = await PDFDocument.load(readFileSync(coverPdfPath));
    const bodyPdf      = await PDFDocument.load(readFileSync(bodyPdfPath));
    const backCoverPdf = await PDFDocument.load(readFileSync(backCoverPdfPath));
    const finalPdf     = await PDFDocument.create();

    const [frontPage] = await finalPdf.copyPages(coverPdf, [0]);
    finalPdf.addPage(frontPage);

    const bodyIndices = Array.from({ length: bodyPdf.getPageCount() }, (_, i) => i);
    for (const pg of await finalPdf.copyPages(bodyPdf, bodyIndices)) finalPdf.addPage(pg);

    const [backPage] = await finalPdf.copyPages(backCoverPdf, [0]);
    finalPdf.addPage(backPage);

    finalPdf.setTitle(metadata.title);
    finalPdf.setAuthor(metadata.author);
    finalPdf.setSubject(metadata.description);
    finalPdf.setKeywords(["frontend", "system design", "architecture", "senior", "handbook"]);
    finalPdf.setCreationDate(new Date(metadata.publicationDate));
    finalPdf.setModificationDate(new Date());

    const finalPdfPath = join(OUTPUT_DIR, "senior-frontend-system-design-handbook.pdf");
    writeFileSync(finalPdfPath, await finalPdf.save());

    // Also write the body HTML for reference
    writeFileSync(
      join(OUTPUT_DIR, "senior-frontend-system-design-handbook.html"),
      buildBodyHtml(parsedChapters, pageNums),
      "utf-8"
    );

    // ── Cleanup temp files ────────────────────────────────────────────────────
    for (const p of [coverHtmlPath, coverPdfPath, bodyHtmlPath, bodyPdfPath, backCoverHtmlPath, backCoverPdfPath]) {
      try { unlinkSync(p); } catch { /* ignore */ }
    }

    const totalPages = 1 + bodyPdf.getPageCount() + 1;
    console.log(`\n  Output            : ${finalPdfPath}`);
    console.log(`  Total pages       : ${totalPages}`);
    console.log(`\n[book:pdf] Done.\n`);

  } finally {
    await browser.close();
  }
}

buildPdf().catch((err) => {
  console.error("\n[book:pdf] Build failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
