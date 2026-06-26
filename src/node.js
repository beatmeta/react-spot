import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cwd } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

const DEFAULT_ALLOWED_HOSTS = new Set([
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "localhost"
]);

const VSCODE_LIKE_EDITORS = new Set([
  "code",
  "code-insiders",
  "codium",
  "cursor",
  "windsurf"
]);

const INTELLIJ_LIKE_EDITORS = new Set([
  "idea",
  "webstorm",
  "phpstorm",
  "pycharm",
  "rubymine",
  "goland"
]);

export async function openInEditor(source, options = {}) {
  if (!options.force && process.env.NODE_ENV === "production") {
    throw new OpenInEditorError("Opening files is disabled in production.", {
      code: "PRODUCTION_DISABLED"
    });
  }

  const normalized = normalizeEditorSource(source, options);
  const command = resolveEditorCommand(options);
  const args = createEditorArgs(command.name, normalized, options);

  await spawnEditor(command.name, args, options);
  return normalized;
}

export async function handleOpenInEditorRequest(request, options = {}) {
  if (!options.force && process.env.NODE_ENV === "production") {
    return jsonResponse({ ok: false, error: "Not found" }, 404);
  }

  if (options.requireLocalhost !== false && !isLocalRequest(request, options)) {
    return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  }

  try {
    const source = await readSourceFromRequest(request);
    const opened = await openInEditor(source, options);
    return jsonResponse({ ok: true, source: opened }, 200);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error?.message ?? "Unable to open source"
    }, error?.status ?? 400);
  }
}

export function normalizeEditorSource(source, options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? cwd());
  const fileName = source?.fileName ?? source?.file ?? source?.url;

  if (typeof fileName !== "string" || fileName.length === 0) {
    throw new OpenInEditorError("Missing file name.", {
      code: "MISSING_FILE",
      status: 400
    });
  }

  if (fileName.includes("\0")) {
    throw new OpenInEditorError("Invalid file name.", {
      code: "INVALID_FILE",
      status: 400
    });
  }

  const lineNumber = toPositiveInteger(source.lineNumber ?? source.line);
  const columnNumber = toPositiveInteger(source.columnNumber ?? source.column);
  const resolvedFromChunk = resolveNextChunkSource({
    fileName,
    lineNumber,
    columnNumber
  }, {
    projectRoot
  });

  const cleaned = cleanBundlerFileName(resolvedFromChunk?.fileName ?? fileName);
  const absoluteFile = resolveSourceFile(cleaned, projectRoot);
  const nextLineNumber = resolvedFromChunk?.lineNumber ?? lineNumber;
  const nextColumnNumber = resolvedFromChunk?.columnNumber ?? columnNumber;

  if (options.mustExist !== false && !existsSync(absoluteFile)) {
    throw new OpenInEditorError(`Source file does not exist: ${absoluteFile}`, {
      code: "FILE_NOT_FOUND",
      status: 404
    });
  }

  return {
    fileName: absoluteFile,
    lineNumber: nextLineNumber,
    columnNumber: nextColumnNumber
  };
}

export function cleanBundlerFileName(fileName) {
  let cleaned = fileName.trim();

  const hashIndex = cleaned.search(/[?#]/);
  if (hashIndex >= 0) {
    cleaned = cleaned.slice(0, hashIndex);
  }

  cleaned = cleaned.replace(/^about:\/\/react\/server\//i, "");

  if (cleaned.startsWith("file://")) {
    return fileURLToPath(cleaned);
  }

  cleaned = safeDecodePath(cleaned);

  cleaned = cleaned
    .replace(/^webpack-internal:\/\/\/(?:\([^)]*\)\/)?/, "")
    .replace(/^webpack:\/\/\/(?:\([^)]*\)\/)?/, "")
    .replace(/^turbopack:\/\/\/(?:\([^)]*\)\/)?/, "")
    .replace(/^\[[^\]]*\]\//, "")
    .replace(/^\([^)]*\)\//, "")
    .replace(/^\.\/+/, "");

  return cleaned;
}

function resolveSourceFile(cleaned, projectRoot) {
  if (path.isAbsolute(cleaned)) {
    return cleaned;
  }

  // 直接相对 projectRoot 解析
  const directPath = path.resolve(projectRoot, cleaned);
  if (existsSync(directPath)) {
    return directPath;
  }

  // Turbopack [project]/ 剥离后路径可能是相对于 workspace root
  // 而 projectRoot（cwd）是其子目录，需要向上探测
  const segments = cleaned.replace(/\\/g, "/").split("/");
  for (let i = 1; i < segments.length; i++) {
    const suffix = segments.slice(i).join("/");
    const candidate = path.resolve(projectRoot, suffix);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // 尝试从 projectRoot 向上查找 git/package root 再解析
  let searchDir = projectRoot;
  for (let depth = 0; depth < 5; depth++) {
    const parent = path.dirname(searchDir);
    if (parent === searchDir) {
      break;
    }
    const fromParent = path.resolve(parent, cleaned);
    if (existsSync(fromParent)) {
      return fromParent;
    }
    searchDir = parent;
  }

  return directPath;
}

function resolveNextChunkSource(source, options = {}) {
  if (!source?.fileName) {
    return null;
  }

  const projectRoot = path.resolve(options.projectRoot ?? cwd());
  const candidates = resolveNextChunkFileCandidates(source.fileName, projectRoot);
  if (candidates.length === 0) {
    return null;
  }

  for (const chunkFile of candidates) {
    const mapped = mapSourceFromChunk({
      chunkFile,
      lineNumber: source.lineNumber,
      columnNumber: source.columnNumber,
      projectRoot
    });
    if (mapped) {
      return mapped;
    }
  }

  return null;
}

function resolveNextChunkFileCandidates(fileName, projectRoot) {
  const value = typeof fileName === "string" ? fileName : "";
  if (value.length === 0) {
    return [];
  }

  const candidates = [];
  const pushIfExists = (entry) => {
    if (typeof entry !== "string" || entry.length === 0) {
      return;
    }
    if (existsSync(entry) && !candidates.includes(entry)) {
      candidates.push(entry);
    }
  };

  if (isLocalNextChunkUrl(value)) {
    const url = new URL(value);
    const chunkPath = decodeURIComponent(url.pathname.replace(/^\/_next\//, ""));
    pushIfExists(path.resolve(projectRoot, ".next", chunkPath));
    pushIfExists(path.resolve(projectRoot, ".next/dev", chunkPath));
  }

  if (value.startsWith("/_next/static/chunks/") || value.startsWith("_next/static/chunks/")) {
    const normalizedPath = value.replace(/^\/?_next\//, "");
    pushIfExists(path.resolve(projectRoot, ".next", normalizedPath));
    pushIfExists(path.resolve(projectRoot, ".next/dev", normalizedPath));
  }

  const cleaned = cleanBundlerFileName(value);
  if (path.isAbsolute(cleaned)) {
    pushIfExists(cleaned);
  } else {
    const nextStatic = path.resolve(projectRoot, ".next/static/chunks", cleaned);
    const nextDevStatic = path.resolve(projectRoot, ".next/dev/static/chunks", cleaned);
    pushIfExists(nextStatic);
    pushIfExists(nextDevStatic);
    pushIfExists(path.resolve(projectRoot, cleaned));
  }

  return candidates.filter((entry) => /\.(?:[cm]?js)$/i.test(entry));
}

function mapSourceFromChunk(options) {
  const { chunkFile, lineNumber, columnNumber, projectRoot } = options;
  const mapPath = `${chunkFile}.map`;
  if (!existsSync(mapPath)) {
    return null;
  }

  try {
    const mapText = readFileSync(mapPath, "utf8");
    const parsedMap = JSON.parse(mapText);
    const map = createTraceMap(parsedMap);
    const generatedLine = toPositiveInteger(lineNumber);
    const generatedColumn = toPositiveInteger(columnNumber);
    const mappedByPosition = map && generatedLine
      ? originalPositionFor(map, {
        line: generatedLine,
        column: Math.max(0, (generatedColumn ?? 1) - 1)
      })
      : null;

    const pickedSource = pickOriginalSourcePath(
      mappedByPosition?.source,
      collectSourceCandidatesFromMap(parsedMap, map)
    );
    if (!pickedSource) {
      return null;
    }

    const absoluteFile = resolveSourcePathFromMap(pickedSource, {
      mapPath,
      projectRoot
    });
    if (!absoluteFile || !existsSync(absoluteFile)) {
      return null;
    }

    return {
      fileName: absoluteFile,
      lineNumber: toPositiveInteger(mappedByPosition?.line) ?? generatedLine,
      columnNumber: toPositiveInteger(mappedByPosition?.column != null ? mappedByPosition.column + 1 : undefined) ?? generatedColumn
    };
  } catch {
    return null;
  }
}

function pickOriginalSourcePath(preferredSource, candidates = []) {
  if (typeof preferredSource === "string" && isLikelyUserSourcePath(preferredSource)) {
    return preferredSource;
  }

  for (const candidate of candidates) {
    if (typeof candidate === "string" && isLikelyUserSourcePath(candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

function resolveSourcePathFromMap(sourcePath, options) {
  if (typeof sourcePath !== "string" || sourcePath.length === 0) {
    return null;
  }

  const projectRoot = path.resolve(options.projectRoot ?? cwd());
  const mapDir = path.dirname(options.mapPath);
  const cleaned = cleanBundlerFileName(sourcePath);

  if (path.isAbsolute(cleaned)) {
    if (existsSync(cleaned)) {
      return cleaned;
    }

    const inferredProjectRelative = inferProjectRelativePath(cleaned);
    if (inferredProjectRelative) {
      const inferredPath = path.resolve(projectRoot, inferredProjectRelative);
      if (existsSync(inferredPath)) {
        return inferredPath;
      }
    }
  }

  const normalized = cleaned.replace(/^webpack:\/\/\/(?:\([^)]*\)\/)?/, "").replace(/^turbopack:\/\/\/(?:\([^)]*\)\/)?/, "").replace(/^\[[^\]]*\]\//, "");
  const relative = normalized.replace(/^\.\/+/, "");
  const fromMap = path.resolve(mapDir, relative);
  if (existsSync(fromMap)) {
    return fromMap;
  }

  const fromProject = path.resolve(projectRoot, relative);
  if (existsSync(fromProject)) {
    return fromProject;
  }

  return null;
}

function isLocalNextChunkUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && DEFAULT_ALLOWED_HOSTS.has(url.hostname)
      && url.pathname.startsWith("/_next/static/chunks/");
  } catch {
    return false;
  }
}

function isLikelyUserSourcePath(fileName) {
  const lower = String(fileName).toLowerCase();
  if (
    lower.includes("about://react/server/") ||
    lower.includes("/node_modules/") ||
    lower.includes("\\node_modules\\") ||
    lower.includes("next/dist/") ||
    lower.includes("/_next/static/chunks/") ||
    lower.includes("\\_next\\static\\chunks\\") ||
    lower.includes("/.next/server/chunks/") ||
    lower.includes("\\.next\\server\\chunks\\") ||
    lower.includes("/.next/dev/server/chunks/") ||
    lower.includes("\\.next\\dev\\server\\chunks\\") ||
    lower.includes("/chunks/ssr/") ||
    lower.includes("\\chunks\\ssr\\")
  ) {
    return false;
  }

  return /\.(?:[cm]?[jt]sx?|mdx)(?:$|\?)/i.test(lower);
}

function collectSourceCandidatesFromMap(parsedMap, traceMap) {
  const sources = new Set();
  const addSource = (value) => {
    if (typeof value === "string" && value.length > 0) {
      sources.add(value);
    }
  };

  for (const source of traceMap?.resolvedSources ?? []) {
    addSource(source);
  }
  for (const source of traceMap?.sources ?? []) {
    addSource(source);
  }

  const visit = (mapLike) => {
    if (!mapLike || typeof mapLike !== "object") {
      return;
    }
    if (Array.isArray(mapLike.sources)) {
      for (const source of mapLike.sources) {
        addSource(source);
      }
    }
    if (Array.isArray(mapLike.sections)) {
      for (const section of mapLike.sections) {
        visit(section?.map);
      }
    }
  };

  visit(parsedMap);
  return [...sources];
}

function createTraceMap(parsedMap) {
  try {
    return new TraceMap(parsedMap);
  } catch {
    return null;
  }
}

function inferProjectRelativePath(absolutePath) {
  const normalized = String(absolutePath ?? "").replace(/\\/g, "/");
  const markers = ["/src/", "/app/", "/pages/", "/components/", "/lib/"];
  for (const marker of markers) {
    const markerIndex = normalized.lastIndexOf(marker);
    if (markerIndex >= 0) {
      return normalized.slice(markerIndex + 1);
    }
  }
  return null;
}

function safeDecodePath(value) {
  if (typeof value !== "string" || !value.includes("%")) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveEditorCommand(options = {}) {
  const editor = options.editor ??
    process.env.REACT_SPOT_EDITOR ??
    process.env.VISUAL ??
    process.env.EDITOR ??
    "code";

  if (typeof editor === "string") {
    const [name, ...args] = splitCommand(editor);
    return { name, args };
  }

  if (editor && typeof editor === "object" && typeof editor.name === "string") {
    return {
      name: editor.name,
      args: Array.isArray(editor.args) ? editor.args : []
    };
  }

  throw new OpenInEditorError("Invalid editor command.", {
    code: "INVALID_EDITOR"
  });
}

export function createEditorArgs(commandName, source, options = {}) {
  if (typeof options.createArgs === "function") {
    return options.createArgs(source, commandName);
  }

  const command = path.basename(commandName).toLowerCase();
  const line = source.lineNumber ?? 1;
  const column = source.columnNumber ?? 1;
  const location = `${source.fileName}:${line}:${column}`;

  if (VSCODE_LIKE_EDITORS.has(command)) {
    return ["-g", location];
  }

  if (INTELLIJ_LIKE_EDITORS.has(command)) {
    return ["--line", String(line), source.fileName];
  }

  if (command === "subl" || command === "sublime") {
    return [location];
  }

  return [location];
}

export class OpenInEditorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "OpenInEditorError";
    Object.assign(this, details);
  }
}

async function readSourceFromRequest(request) {
  const url = new URL(request.url);

  if (request.method === "POST") {
    const body = await request.json();
    return {
      fileName: body.fileName ?? body.file,
      lineNumber: body.lineNumber ?? body.line,
      columnNumber: body.columnNumber ?? body.column
    };
  }

  return {
    fileName: url.searchParams.get("file"),
    lineNumber: url.searchParams.get("line"),
    columnNumber: url.searchParams.get("column")
  };
}

function spawnEditor(commandName, args, options) {
  return new Promise((resolve, reject) => {
    const command = resolveEditorCommand(options);
    const child = spawn(commandName, [...command.args, ...args], {
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32"
    });

    child.once("error", (error) => {
      reject(new OpenInEditorError(error.message, {
        code: "SPAWN_FAILED",
        cause: error
      }));
    });

    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function isLocalRequest(request, options) {
  const allowedHosts = new Set(options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS);
  const url = new URL(request.url);
  return allowedHosts.has(url.hostname);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function splitCommand(command) {
  return command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
    ?.map((part) => part.replace(/^["']|["']$/g, "")) ?? [command];
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}
