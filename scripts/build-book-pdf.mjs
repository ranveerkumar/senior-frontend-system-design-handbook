#!/usr/bin/env node
/**
 * Senior Frontend System Design Handbook — PDF Build Script
 *
 * Usage: npm run book:pdf
 * Output: book/output/senior-frontend-system-design-handbook.pdf
 *
 * Requires: npm install --save-dev marked puppeteer
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BOOK_DIR = join(ROOT, "book");
const OUTPUT_DIR = join(BOOK_DIR, "output");

// ─── Load dependencies ──────────────────────────────────────────────────────

let marked, puppeteer;

try {
  ({ marked } = await import("marked"));
} catch {
  console.error(
    "\n[book:pdf] Missing dependency: marked\n" +
    "  Run: npm install --save-dev marked\n"
  );
  process.exit(1);
}

try {
  puppeteer = (await import("puppeteer")).default;
} catch {
  console.error(
    "\n[book:pdf] Missing dependency: puppeteer\n" +
    "  Run: npm install --save-dev puppeteer\n"
  );
  process.exit(1);
}

// ─── Load book metadata ─────────────────────────────────────────────────────

const metadata = JSON.parse(readFileSync(join(BOOK_DIR, "metadata.json"), "utf-8"));
const CSS_PATH = join(BOOK_DIR, "styles", "book.css");
const cssContent = readFileSync(CSS_PATH, "utf-8");

// ─── Configure marked ───────────────────────────────────────────────────────

marked.setOptions({
  gfm: true,
  breaks: false,
});

// ─── Helper: read chapter markdown ─────────────────────────────────────────

function readChapter(filePath) {
  const fullPath = join(BOOK_DIR, filePath);
  return readFileSync(fullPath, "utf-8");
}

// ─── Helper: convert markdown to HTML chapter block ─────────────────────────

function mdToChapterHtml(markdown, chapterIndex) {
  // Strip footer navigation lines (last 2–3 lines with [← ... | TOC | ...→] pattern)
  const lines = markdown.split("\n");
  const filtered = [];
  for (const line of lines) {
    // Skip navigation links and source lines at the end
    if (/^\[← /.test(line) || /^\*Source: /.test(line) || /^\[Table of Contents\]/.test(line)) continue;
    filtered.push(line);
  }

  // Remove trailing empty lines
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === "") {
    filtered.pop();
  }

  const cleanedMarkdown = filtered.join("\n");
  const html = marked.parse(cleanedMarkdown);

  // Rewrite ../assets/diagrams/*.svg paths to absolute file:// URLs.
  // Chapters live in book/chapters/, so ../assets/diagrams/ → book/assets/diagrams/.
  // Using absolute file:// URLs ensures Puppeteer resolves them regardless of
  // where the intermediate HTML file sits.
  const DIAGRAMS_DIR = join(BOOK_DIR, "assets", "diagrams");
  const rewrittenHtml = html.replace(
    /src="\.\.\/assets\/diagrams\/([^"]+\.svg)"/g,
    (_, filename) => {
      const absPath = join(DIAGRAMS_DIR, filename);
      return `src="${pathToFileURL(absPath).href}"`;
    }
  );

  return `<div class="chapter" id="chapter-${chapterIndex}">\n${rewrittenHtml}\n</div>\n`;
}

// ─── Build cover HTML ───────────────────────────────────────────────────────

function buildCoverHtml() {
  const template = readFileSync(join(BOOK_DIR, "templates", "cover.html"), "utf-8");

  return template
    .replace(/{{TITLE}}/g, metadata.title)
    .replace(/{{SUBTITLE}}/g, metadata.subtitle)
    .replace(/{{AUTHOR}}/g, metadata.author)
    .replace(/{{BLOG_URL}}/g, metadata.blogUrl)
    .replace(/{{VERSION}}/g, metadata.version)
    .replace(/{{PUBLICATION_DATE}}/g, metadata.publicationDate)
    .replace(/{{LICENSE}}/g, metadata.license)
    .replace(/{{CSS_PATH}}/g, "");
}

// ─── Build full book HTML ───────────────────────────────────────────────────

function buildBookHtml(chaptersHtml) {
  const template = readFileSync(join(BOOK_DIR, "templates", "book.html"), "utf-8");

  const fullContent = chaptersHtml.join("\n<hr class='chapter-break' />\n");

  return template
    .replace(/{{TITLE}}/g, metadata.title)
    .replace(/{{SUBTITLE}}/g, metadata.subtitle)
    .replace(/{{CSS_PATH}}/g, "")
    .replace(/{{CONTENT}}/g, fullContent);
}

// ─── Inline CSS into HTML ───────────────────────────────────────────────────

function inlineCss(html) {
  return html.replace(
    /<link rel="stylesheet" href=""[^/]*\/>/,
    `<style>\n${cssContent}\n</style>`
  );
}

// ─── Main build ─────────────────────────────────────────────────────────────

async function buildPdf() {
  console.log("\n[book:pdf] Building Senior Frontend System Design Handbook PDF...\n");

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Build chapter HTML blocks
  const chaptersHtml = metadata.chapters.map((chapter, index) => {
    console.log(`  [${String(index + 1).padStart(2, "0")}] ${chapter.title}`);
    const markdown = readChapter(chapter.file);
    return mdToChapterHtml(markdown, index);
  });

  // Build full HTML
  const coverHtml = buildCoverHtml();
  const bodyHtml = buildBookHtml(chaptersHtml);

  // Combine: cover page + chapters
  const fullHtml = inlineCss(coverHtml) + "\n" + inlineCss(bodyHtml);

  // Write intermediate HTML to disk — Puppeteer will load it via file:// URL
  // so that local SVG assets resolve correctly (page.setContent blocks file:// access)
  const htmlOutputPath = join(OUTPUT_DIR, "senior-frontend-system-design-handbook.html");
  writeFileSync(htmlOutputPath, fullHtml, "utf-8");
  console.log(`\n  HTML written: ${htmlOutputPath}`);

  // Launch Puppeteer and render to PDF
  console.log("\n  Launching headless browser...");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--allow-file-access-from-files",
    ],
  });

  const page = await browser.newPage();

  // Load via file:// URL so relative and absolute local SVG paths resolve
  const htmlFileUrl = pathToFileURL(htmlOutputPath).href;
  await page.goto(htmlFileUrl, {
    waitUntil: "networkidle0",
  });

  const pdfOutputPath = join(OUTPUT_DIR, "senior-frontend-system-design-handbook.pdf");

  await page.pdf({
    path: pdfOutputPath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "2cm",
      right: "2.2cm",
      bottom: "2.4cm",
      left: "2.2cm",
    },
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `
      <div style="width: 100%; text-align: center; font-size: 9pt;
                  color: #68645e; font-family: Inter, sans-serif;
                  padding-bottom: 0.5cm;">
        <span class="pageNumber"></span>
      </div>
    `,
  });

  await browser.close();

  console.log(`  PDF written:  ${pdfOutputPath}`);
  console.log(`\n[book:pdf] Done.\n`);
}

buildPdf().catch((err) => {
  console.error("\n[book:pdf] Build failed:", err.message);
  process.exit(1);
});
