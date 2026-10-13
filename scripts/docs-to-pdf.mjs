#!/usr/bin/env node
// Renders docs/*.md to PDF (A4, with a table of contents and page numbers).
//
//   node scripts/docs-to-pdf.mjs                       RUNBOOK + DEPLOYMENT -> docs/pdf/
//   node scripts/docs-to-pdf.mjs RUNBOOK ARCHITECTURE  any docs by name
//
// Needs Google Chrome (or set CHROME=/path/to/chrome) and network for the first
// `npx marked`. The PDFs are generated: edit the Markdown, then run this again.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "docs");
const outDir = path.join(docsDir, "pdf");
const names = process.argv.slice(2).length ? process.argv.slice(2) : ["RUNBOOK", "DEPLOYMENT"];

const chrome =
  process.env.CHROME ??
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((p) => fs.existsSync(p));
if (!chrome) {
  console.error("Chrome not found. Set CHROME=/path/to/chrome.");
  process.exit(1);
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const stripTags = (s) => s.replace(/<[^>]+>/g, "");
const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
/** GitHub-style heading slug, so `[x](#2-the-section)` links in the Markdown keep working. */
const slug = (text) =>
  decode(stripTags(text))
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");

const CSS = `
  @page { size: A4; margin: 18mm 15mm 20mm;
    @bottom-left { content: "Wadzzo monorepo"; font: 8pt Helvetica, Arial, sans-serif; color: #6b7280; }
    @bottom-right { content: counter(page) " / " counter(pages); font: 8pt Helvetica, Arial, sans-serif; color: #6b7280; } }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 9.6pt/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1f2933; margin: 0; }
  header.title { border-bottom: 3px solid #0f7a43; padding-bottom: 8pt; margin-bottom: 14pt; }
  header.title .kicker { font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; color: #0f7a43; font-weight: 700; }
  header.title h1 { font-size: 22pt; margin: 2pt 0 4pt; line-height: 1.15; }
  header.title .meta { font-size: 8.5pt; color: #6b7280; }
  nav.toc { background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 4pt; padding: 8pt 12pt; margin-bottom: 14pt; break-inside: avoid; }
  nav.toc h2 { font-size: 10.5pt; margin: 0 0 4pt; border: 0; padding: 0; }
  nav.toc ol { margin: 0; padding-left: 0; list-style: none; columns: 2; column-gap: 20pt; font-size: 9pt; }
  nav.toc li { margin: 1pt 0; break-inside: avoid; }
  h1, h2, h3, h4 { line-height: 1.25; break-after: avoid; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px solid #d0d7de; color: #0b5a33; }
  h3 { font-size: 11.5pt; margin: 13pt 0 4pt; }
  h4 { font-size: 10pt; margin: 10pt 0 3pt; }
  p { margin: 5pt 0; }
  ul, ol { margin: 4pt 0 6pt; padding-left: 18pt; }
  li { margin: 2pt 0; }
  a { color: #0b5fa5; text-decoration: none; }
  blockquote { margin: 8pt 0; padding: 4pt 10pt; border-left: 3pt solid #f0b429; background: #fffbea; color: #3f2f00; }
  blockquote p { margin: 2pt 0; }
  code { font: 8.4pt/1.35 "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; background: #f1f3f5; padding: 0 3pt; border-radius: 2pt; overflow-wrap: anywhere; }
  pre { background: #f6f8fa; border: 1px solid #e1e4e8; border-left: 3pt solid #0f7a43; border-radius: 3pt; padding: 7pt 9pt; margin: 7pt 0; break-inside: avoid; white-space: pre-wrap; overflow-wrap: anywhere; }
  pre code { background: none; padding: 0; font-size: 8pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 8.4pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #d0d7de; padding: 3.5pt 6pt; vertical-align: top; text-align: left; overflow-wrap: break-word; }
  th { background: #eef2f6; font-weight: 700; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  hr { border: 0; border-top: 1px solid #d0d7de; margin: 14pt 0; }
  strong { color: #111827; }
`;

function render(name) {
  const mdPath = path.join(docsDir, `${name}.md`);
  const markdown = fs.readFileSync(mdPath, "utf8");
  let body = execFileSync("npx", ["--yes", "marked@15", "--gfm", "-i", mdPath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  // title: the first H1 becomes the cover block
  let title = name;
  body = body.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/, (_m, inner) => {
    title = decode(stripTags(inner));
    return "";
  });

  // ids on h2/h3 and a table of contents of the h2s
  const toc = [];
  body = body.replace(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/g, (_m, level, inner) => {
    const id = slug(inner);
    if (level === "2") toc.push({ id, text: stripTags(inner) });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });

  // links to the other docs: another PDF if we make one, plain text otherwise
  body = body.replace(
    /<a href="([A-Za-z0-9_-]+)\.md(#[^"]*)?">([\s\S]*?)<\/a>/g,
    (_m, doc, hash, text) =>
      names.includes(doc)
        ? `<a href="${doc}.pdf${hash ?? ""}">${text}</a>`
        : `<span>${text}</span>`,
  );
  // links to repository paths (README.md, ../apps/...) can't work inside a PDF
  body = body.replace(/<a href="(?!https?:|#|mailto:)[^"]*">([\s\S]*?)<\/a>/g, "<span>$1</span>");

  const tocHtml = toc.length
    ? `<nav class="toc"><h2>Contents</h2><ol>${toc.map((t) => `<li><a href="#${t.id}">${t.text}</a></li>`).join("")}</ol></nav>`
    : "";
  const date = new Date().toISOString().slice(0, 10);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${CSS}</style></head>
<body><header class="title"><div class="kicker">Wadzzo · ${escapeHtml(name)}.md</div><h1>${escapeHtml(title)}</h1><div class="meta">Generated ${date} from docs/${name}.md · ${markdown.split("\n").length} lines of source</div></header>
${tocHtml}${body}</body></html>`;

  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "docs-pdf-"));
  const htmlPath = path.join(tmp, `${name}.html`);
  fs.writeFileSync(htmlPath, html);
  const pdfPath = path.join(outDir, `${name}.pdf`);
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--user-data-dir=${path.join(tmp, "profile")}`,
      `--print-to-pdf=${pdfPath}`,
      `file://${htmlPath}`,
    ],
    { stdio: "pipe" },
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`  ${path.relative(root, pdfPath)}`);
}

for (const name of names) render(name);
