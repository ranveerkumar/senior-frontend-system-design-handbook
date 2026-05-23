#!/usr/bin/env node
/**
 * Extract inline SVG diagrams from book chapters into standalone SVG files.
 *
 * - Reads each book/chapters/*.md
 * - Finds all <figure>...</figure> blocks
 * - Extracts SVG content, converts JSX attrs → SVG XML attrs
 * - Writes standalone .svg files to book/assets/diagrams/
 * - Replaces figure blocks with Markdown image refs + captions
 *
 * Run: node scripts/extract-book-diagrams.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOK_DIR = join(__dirname, "..", "book");
const CHAPTERS_DIR = join(BOOK_DIR, "chapters");
const DIAGRAMS_DIR = join(BOOK_DIR, "assets", "diagrams");

mkdirSync(DIAGRAMS_DIR, { recursive: true });

// ─── Filename map: SVG ID prefix → output filename stem ─────────────────────
const DIAGRAM_FILENAMES = {
  "diagram-1":    "01-system-design-equation",
  "diagram-2":    "01-component-vs-system-thinking",
  "diagram-3":    "01-requirements-before-code",
  "rt-diagram-1": "02-real-time-architecture",
  "rt-diagram-2": "02-websocket-lifecycle",
  "rt-diagram-3": "02-event-reconciliation",
  "data-diagram-1":     "03-table-architecture",
  "dynamic-diagram-1":  "04-schema-rendering-pipeline",
  "state-diagram-1":    "05-state-classification",
  "state-diagram-3":    "05-workflow-state-machine",
  "perf-diagram-1":     "06-rendering-strategy",
  "platform-diagram-1": "07-design-system-operating-model",
  "failure-diagram-1":  "08-failure-taxonomy",
  "failure-diagram-2":  "08-error-boundaries",
  "failure-diagram-3":  "08-retry-fallback-sequence",
  "failure-diagram-4":  "08-observability-pipeline",
  "security-diagram-1": "09-auth-session-flow",
  "security-diagram-2": "09-rbac-pipeline",
  "security-diagram-3": "09-browser-security-boundary",
  "security-diagram-4": "09-csp-governance",
  "interview-diagram-1": "10-answer-flow",
  "interview-diagram-2": "10-requirements-to-architecture",
  "interview-diagram-3": "10-tradeoff-matrix",
  "interview-diagram-4": "10-interview-rubric",
};

// ─── JSX camelCase → SVG XML hyphenated attribute names ─────────────────────
const JSX_TO_SVG_ATTRS = [
  ["fontSize",          "font-size"],
  ["fontWeight",        "font-weight"],
  ["fontStyle",         "font-style"],
  ["fontFamily",        "font-family"],
  ["textAnchor",        "text-anchor"],
  ["strokeWidth",       "stroke-width"],
  ["strokeDasharray",   "stroke-dasharray"],
  ["strokeDashoffset",  "stroke-dashoffset"],
  ["strokeLinecap",     "stroke-linecap"],
  ["strokeLinejoin",    "stroke-linejoin"],
  ["strokeOpacity",     "stroke-opacity"],
  ["markerEnd",         "marker-end"],
  ["markerStart",       "marker-start"],
  ["markerMid",         "marker-mid"],
  ["fillOpacity",       "fill-opacity"],
  ["fillRule",          "fill-rule"],
  ["clipPath",          "clip-path"],
  ["clipRule",          "clip-rule"],
  ["stopColor",         "stop-color"],
  ["stopOpacity",       "stop-opacity"],
  ["dominantBaseline",  "dominant-baseline"],
  ["alignmentBaseline", "alignment-baseline"],
  ["baselineShift",     "baseline-shift"],
  ["letterSpacing",     "letter-spacing"],
  ["wordSpacing",       "word-spacing"],
  ["textDecoration",    "text-decoration"],
  ["textRendering",     "text-rendering"],
  ["shapeRendering",    "shape-rendering"],
  ["pointerEvents",     "pointer-events"],
];

function convertJsxAttrs(svgContent) {
  let result = svgContent;
  for (const [jsx, xml] of JSX_TO_SVG_ATTRS) {
    // Match attribute name followed by = and (optionally) whitespace
    result = result.replace(new RegExp(`\\b${jsx}=`, "g"), `${xml}=`);
  }
  return result;
}

// ─── Wrap SVG with proper standalone XML + responsive width ─────────────────
function wrapSvg(svgContent) {
  // Ensure xmlns is present
  let wrapped = svgContent.trim();

  if (!wrapped.includes('xmlns="http://www.w3.org/2000/svg"')) {
    wrapped = wrapped.replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg"`);
  }

  // Add width="100%" for responsiveness (keep viewBox)
  if (!wrapped.includes('width="')) {
    wrapped = wrapped.replace("<svg", `<svg width="100%"`);
  }

  return wrapped;
}

// ─── Extract figure blocks from markdown ─────────────────────────────────────
function extractFigures(content) {
  const figures = [];
  // Match <figure>...</figure> blocks (multiline)
  const figureRegex = /<figure>([\s\S]*?)<\/figure>/g;
  let match;

  while ((match = figureRegex.exec(content)) !== null) {
    const block = match[0];
    const inner = match[1];

    // Extract caption from **Figure:** Title — Caption line
    const captionMatch = inner.match(/\*\*Figure:\*\*\s*([^\n]+)/);
    const captionFull = captionMatch ? captionMatch[1].trim() : "";
    // Split "Title — Caption" or "Title — Caption"
    const dashIndex = captionFull.indexOf("—");
    const figureTitle = dashIndex > -1 ? captionFull.slice(0, dashIndex).trim() : captionFull;
    const figureCaption = dashIndex > -1 ? captionFull.slice(dashIndex + 1).trim() : "";

    // Extract SVG block
    const svgMatch = inner.match(/<svg[\s\S]*?<\/svg>/);
    if (!svgMatch) continue;

    const svgContent = svgMatch[0];

    // Determine diagram ID from aria-labelledby
    const labelledByMatch = svgContent.match(/aria-labelledby="([^"]+)"/);
    const labelledBy = labelledByMatch ? labelledByMatch[1] : "";
    const idPrefix = labelledBy.split(" ")[0].replace(/-title$/, "");

    // Get alt text from <title> inside SVG
    const titleMatch = svgContent.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const altText = titleMatch ? titleMatch[1].trim() : figureTitle;

    figures.push({
      block,
      svgContent,
      figureTitle,
      figureCaption,
      captionFull,
      altText,
      idPrefix,
      filename: DIAGRAM_FILENAMES[idPrefix] || null,
    });
  }

  return figures;
}

// ─── Process each chapter ────────────────────────────────────────────────────
const chapters = [
  "01-beyond-the-component.md",
  "02-real-time-frontend-systems.md",
  "03-high-density-data-management.md",
  "04-dynamic-scalable-ui.md",
  "05-frontend-state-architecture.md",
  "06-frontend-performance-architecture.md",
  "07-frontend-platforms.md",
  "08-failure-handling.md",
  "09-security-architecture.md",
  "10-system-design-interviews.md",
];

const manifest = [];
let totalFigures = 0;
let totalCreated = 0;
const updatedChapters = [];

for (const chapterFile of chapters) {
  const chapterPath = join(CHAPTERS_DIR, chapterFile);
  let content;

  try {
    content = readFileSync(chapterPath, "utf-8");
  } catch {
    console.warn(`  [WARN] Could not read ${chapterFile}`);
    continue;
  }

  const figures = extractFigures(content);
  if (figures.length === 0) continue;

  console.log(`\n[${chapterFile}] Found ${figures.length} figure(s)`);
  totalFigures += figures.length;

  let updatedContent = content;

  for (const fig of figures) {
    const filename = fig.filename;
    if (!filename) {
      console.warn(`  [WARN] No filename mapping for idPrefix="${fig.idPrefix}" in ${chapterFile}`);
      // Fall back to a generated name
    }

    const svgFilename = (filename || `${chapterFile.slice(0, 2)}-diagram-${totalCreated + 1}`) + ".svg";
    const svgOutputPath = join(DIAGRAMS_DIR, svgFilename);

    // Convert JSX attributes to proper SVG XML attributes
    let cleanSvg = convertJsxAttrs(fig.svgContent);
    cleanSvg = wrapSvg(cleanSvg);

    // Write SVG file
    writeFileSync(svgOutputPath, cleanSvg, "utf-8");
    console.log(`  ✓ ${svgFilename}`);
    totalCreated++;

    // Figure caption line (used as italic caption in markdown)
    const captionText = fig.captionFull
      ? `_${fig.captionFull}_`
      : `_${fig.figureTitle}_`;

    // Markdown image reference
    const imgRef = `![${fig.altText}](../assets/diagrams/${svgFilename})\n\n${captionText}`;

    // Replace the original <figure>...</figure> block
    updatedContent = updatedContent.replace(fig.block, imgRef);

    manifest.push({
      filename: svgFilename,
      chapter: chapterFile,
      title: fig.figureTitle,
      description: fig.altText,
      caption: fig.figureCaption,
      idPrefix: fig.idPrefix,
      status: "extracted",
    });
  }

  // Write updated chapter
  writeFileSync(chapterPath, updatedContent, "utf-8");
  updatedChapters.push(chapterFile);
  console.log(`  → Chapter updated`);
}

// ─── Write manifest ──────────────────────────────────────────────────────────
const manifestPath = join(DIAGRAMS_DIR, "manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
console.log(`\n[manifest] Written: ${manifestPath}`);

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`
┌─────────────────────────────────────────────┐
│  Book Diagram Extraction Complete           │
│                                             │
│  Figure blocks found:   ${String(totalFigures).padEnd(5)}               │
│  SVG files created:     ${String(totalCreated).padEnd(5)}               │
│  Chapters updated:      ${String(updatedChapters.length).padEnd(5)}               │
└─────────────────────────────────────────────┘
`);
