/**
 * file-crawler.ts
 * Scans a local folder for tax documents (PDFs, text, CSV, XML).
 * Returns structured extracted content ready for the Tax Analyzer.
 */

import fs from "fs/promises";
import path from "path";
import { createRequire } from "module";

// pdf-parse is CommonJS; use createRequire for ESM compatibility
const require = createRequire(import.meta.url);

export type DocType =
  | "W2"
  | "1099-NEC"
  | "1099-INT"
  | "1099-DIV"
  | "1099-B"
  | "1099-MISC"
  | "1099-R"
  | "1099-G"
  | "1099-K"
  | "SSA-1099"
  | "1098"
  | "1098-T"
  | "1098-E"
  | "K1"
  | "RECEIPT"
  | "OTHER";

export interface TaxDocument {
  filename: string;
  filePath: string;
  type: DocType;
  content: string;       // raw extracted text
  sizeBytes: number;
  mimeType: string;
}

const SUPPORTED_EXTENSIONS = new Set([".pdf", ".txt", ".csv", ".xml", ".json"]);

/** Infer document type from filename and content keywords. */
function inferDocType(filename: string, content: string): DocType {
  const name = filename.toUpperCase();
  const text = content.slice(0, 2000).toUpperCase(); // scan first 2k chars

  if (name.includes("W-2") || name.includes("W2") || text.includes("WAGES, TIPS, OTHER COMP") || text.includes("FORM W-2")) return "W2";
  if (name.includes("1099-NEC") || text.includes("NONEMPLOYEE COMPENSATION") || text.includes("1099-NEC")) return "1099-NEC";
  if (name.includes("1099-INT") || text.includes("INTEREST INCOME") && text.includes("1099")) return "1099-INT";
  if (name.includes("1099-DIV") || text.includes("DIVIDENDS AND DISTRIBUTIONS")) return "1099-DIV";
  if (name.includes("1099-B") || text.includes("PROCEEDS FROM BROKER") || text.includes("COST BASIS")) return "1099-B";
  if (name.includes("1099-R") || text.includes("DISTRIBUTIONS FROM PENSIONS") || text.includes("1099-R")) return "1099-R";
  if (name.includes("1099-G") || text.includes("CERTAIN GOVERNMENT PAYMENTS") || text.includes("UNEMPLOYMENT")) return "1099-G";
  if (name.includes("1099-K") || text.includes("PAYMENT CARD AND THIRD PARTY NETWORK")) return "1099-K";
  if (name.includes("SSA-1099") || text.includes("SOCIAL SECURITY BENEFIT STATEMENT")) return "SSA-1099";
  if (name.includes("1099-MISC") || text.includes("MISCELLANEOUS INFORMATION") && text.includes("1099")) return "1099-MISC";
  if (name.includes("1098-T") || text.includes("TUITION STATEMENT")) return "1098-T";
  if (name.includes("1098-E") || text.includes("STUDENT LOAN INTEREST")) return "1098-E";
  if (name.includes("1098") || text.includes("MORTGAGE INTEREST STATEMENT")) return "1098";
  if (name.includes("K-1") || name.includes("SCHEDULE K1") || text.includes("PARTNER'S SHARE") || text.includes("SHAREHOLDER'S SHARE")) return "K1";
  if (name.includes("RECEIPT") || name.includes("DONATION") || name.includes("CHARITY")) return "RECEIPT";

  return "OTHER";
}

/** Extract text from a PDF using pdf-parse. */
async function parsePdf(filePath: string): Promise<string> {
  try {
    const pdfParse = require("pdf-parse");
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return data.text ?? "";
  } catch {
    return "[PDF parse error — file may be scanned/image-based]";
  }
}

/** Read plain text / CSV / XML / JSON files. */
async function readTextFile(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath, "utf-8");
  // Truncate very large files at 50k characters
  return raw.length > 50_000 ? raw.slice(0, 50_000) + "\n\n[... truncated at 50,000 characters]" : raw;
}

/** Recursively scan a directory, honouring maxDepth to avoid runaway traversal. */
async function scanDirectory(
  dirPath: string,
  maxDepth = 3,
  depth = 0
): Promise<string[]> {
  if (depth > maxDepth) return [];

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden folders and common non-tax folders
      if (!entry.name.startsWith(".") && !["node_modules", "__pycache__"].includes(entry.name)) {
        files.push(...await scanDirectory(fullPath, maxDepth, depth + 1));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

/** Main export: crawl a folder and return structured tax documents. */
export async function crawlTaxDocuments(
  folderPath: string,
  maxFiles = 50
): Promise<{ documents: TaxDocument[]; errors: string[]; summary: string }> {
  const errors: string[] = [];
  const documents: TaxDocument[] = [];

  // Validate folder exists
  try {
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) {
      return { documents: [], errors: [`${folderPath} is not a directory`], summary: "Scan failed." };
    }
  } catch {
    return { documents: [], errors: [`Cannot access folder: ${folderPath}`], summary: "Scan failed." };
  }

  const filePaths = await scanDirectory(folderPath);
  const toProcess = filePaths.slice(0, maxFiles);

  if (filePaths.length > maxFiles) {
    errors.push(`Found ${filePaths.length} files; processing first ${maxFiles}. Increase maxFiles to process more.`);
  }

  for (const filePath of toProcess) {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);

    try {
      const stat = await fs.stat(filePath);
      let content = "";

      if (ext === ".pdf") {
        content = await parsePdf(filePath);
        if (!content.trim()) {
          errors.push(`${filename}: PDF appears to be image-based — text extraction failed. Consider running OCR.`);
          continue;
        }
      } else {
        content = await readTextFile(filePath);
      }

      const type = inferDocType(filename, content);
      documents.push({
        filename,
        filePath,
        type,
        content,
        sizeBytes: stat.size,
        mimeType: ext === ".pdf" ? "application/pdf" : "text/plain",
      });
    } catch (err) {
      errors.push(`${filename}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Build summary
  const typeCounts = documents.reduce<Record<string, number>>((acc, doc) => {
    acc[doc.type] = (acc[doc.type] ?? 0) + 1;
    return acc;
  }, {});

  const countStr = Object.entries(typeCounts)
    .map(([t, n]) => `${n}× ${t}`)
    .join(", ");

  const summary = `Scanned ${folderPath}. Found ${documents.length} documents: ${countStr || "none"}.${errors.length ? ` ${errors.length} errors.` : ""}`;

  return { documents, errors, summary };
}
