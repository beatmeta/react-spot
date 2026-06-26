import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  findFiberFromElement,
  findSourceFromFiber,
  parseSourceFromStack,
  createOpenInEditorUrl
} from "../src/index.js";
import {
  cleanBundlerFileName,
  createEditorArgs,
  normalizeEditorSource
} from "../src/node.js";

test("finds a React fiber expando on a DOM node", () => {
  const fiber = { type: function Button() {} };
  const node = {
    nodeType: 1,
    "__reactFiber$abc": fiber
  };

  assert.deepEqual(findFiberFromElement(node), { element: node, fiber });
});

test("walks up Fiber.return and reads _debugSource", () => {
  function Button() {}
  const parent = {
    type: Button,
    _debugSource: {
      fileName: "/app/src/Button.tsx",
      lineNumber: 12,
      columnNumber: 7
    }
  };
  const child = {
    type: "span",
    return: parent
  };

  assert.deepEqual(findSourceFromFiber(child), {
    source: {
      fileName: "/app/src/Button.tsx",
      lineNumber: 12,
      columnNumber: 7
    },
    componentName: "Button",
    strategy: "fiber"
  });
});

test("parses React 19-style owner stack source lines", () => {
  const stack = [
    "Error: react-stack-top-frame",
    "    at div (<anonymous>)",
    "    at Card (webpack-internal:///(app-pages-browser)/./src/app/Card.tsx:22:11)",
    "    at App (webpack-internal:///(app-pages-browser)/./node_modules/react/index.js:1:1)"
  ].join("\n");

  assert.deepEqual(parseSourceFromStack(stack), {
    fileName: "webpack-internal:///(app-pages-browser)/./src/app/Card.tsx",
    lineNumber: 22,
    columnNumber: 11
  });
});

test("parses relative source paths in owner stack lines", () => {
  const stack = "    at Card (src/app/Card.tsx:22:11)";

  assert.deepEqual(parseSourceFromStack(stack), {
    fileName: "src/app/Card.tsx",
    lineNumber: 22,
    columnNumber: 11
  });
});

test("parses turbopack [project]/ paths in owner stack lines", () => {
  const stack = "    at MetricCard ([project]/examples/next-turbopack/src/components/MetricCard.tsx:14:9)";

  assert.deepEqual(parseSourceFromStack(stack), {
    fileName: "[project]/examples/next-turbopack/src/components/MetricCard.tsx",
    lineNumber: 14,
    columnNumber: 9
  });
});

test("reads source from debug stack metadata", () => {
  function Card() {}
  const fiber = {
    type: Card,
    _debugStack: new Error("at Card (/app/src/Card.tsx:5:3)")
  };

  assert.deepEqual(findSourceFromFiber(fiber)?.source, {
    fileName: "/app/src/Card.tsx",
    lineNumber: 5,
    columnNumber: 3
  });
});

test("prefers owner source over generated chunk source", () => {
  function Panel() {}
  const owner = {
    type: Panel,
    _debugSource: {
      fileName: "/app/src/Panel.tsx",
      lineNumber: 18,
      columnNumber: 2
    }
  };
  const child = {
    type: "div",
    _debugStack: "    at div (http://localhost:3000/_next/static/chunks/16rq_next_dist_compiled_react-server-dom-turbopack_1tdb4mb._.js:1981:16)",
    return: owner
  };

  assert.deepEqual(findSourceFromFiber(child), {
    source: {
      fileName: "/app/src/Panel.tsx",
      lineNumber: 18,
      columnNumber: 2
    },
    componentName: "Panel",
    strategy: "fiber"
  });
});

test("skips RSC runtime stack and reads debugInfo for server component source", () => {
  function ServerPanel() {}
  const fiber = {
    type: ServerPanel,
    _debugStack: "    at ServerPanel (http://localhost:3000/_next/static/chunks/16rq_next_dist_compiled_react-server-dom-turbopack_1tdb4mb._.js:1981:16)",
    _debugInfo: [
      {
        owner: {
          _debugSource: {
            fileName: "/app/src/components/ServerPanel.tsx",
            lineNumber: 8,
            columnNumber: 3
          }
        }
      }
    ]
  };

  assert.deepEqual(findSourceFromFiber(fiber)?.source, {
    fileName: "/app/src/components/ServerPanel.tsx",
    lineNumber: 8,
    columnNumber: 3
  });
});

test("returns next chunk frame when no user source exists", () => {
  const stack = "    at h1 (http://localhost:3001/_next/static/chunks/app_page_abc.js:10:20)";
  assert.deepEqual(parseSourceFromStack(stack), {
    fileName: "http://localhost:3001/_next/static/chunks/app_page_abc.js",
    lineNumber: 10,
    columnNumber: 20
  });
});

test("returns react server about frame as fallback source", () => {
  const stack = "    at Home (about://React/Server/file:///repo/.next/dev/server/chunks/ssr/%5Broot-of-the-server%5D__1l2mzai._.js:168:424)";
  assert.deepEqual(parseSourceFromStack(stack), {
    fileName: "file:///repo/.next/dev/server/chunks/ssr/%5Broot-of-the-server%5D__1l2mzai._.js",
    lineNumber: 168,
    columnNumber: 424
  });
});

test("cleans webpack and turbopack virtual file names", () => {
  assert.equal(
    cleanBundlerFileName("webpack-internal:///(app-pages-browser)/./src/app/page.tsx?abc"),
    "src/app/page.tsx"
  );
  assert.equal(
    cleanBundlerFileName("turbopack:///(browser)/./components/Button.tsx"),
    "components/Button.tsx"
  );
});

test("cleans turbopack [project]/ prefix from file names", () => {
  assert.equal(
    cleanBundlerFileName("[project]/src/components/MetricCard.tsx"),
    "src/components/MetricCard.tsx"
  );
  assert.equal(
    cleanBundlerFileName("[project]/examples/next-turbopack/src/components/MetricCard.tsx"),
    "examples/next-turbopack/src/components/MetricCard.tsx"
  );
  assert.equal(
    cleanBundlerFileName("[root-of-the-server]/src/app/page.tsx"),
    "src/app/page.tsx"
  );
});

test("normalizes relative source files against project root", () => {
  const normalized = normalizeEditorSource({
    fileName: "src/index.js",
    line: "3",
    column: "4"
  }, {
    projectRoot: "/repo",
    mustExist: false
  });

  assert.deepEqual(normalized, {
    fileName: "/repo/src/index.js",
    lineNumber: 3,
    columnNumber: 4
  });
});

test("resolves turbopack [project]/ path in monorepo layout", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "react-spot-test-"));
  const appDir = path.join(tempRoot, "packages/app");
  const sourceFile = path.join(appDir, "src/components/Card.tsx");

  mkdirSync(path.dirname(sourceFile), { recursive: true });
  writeFileSync(sourceFile, "export function Card() { return null; }\n", "utf8");

  const normalized = normalizeEditorSource({
    fileName: "[project]/packages/app/src/components/Card.tsx",
    lineNumber: 1,
    columnNumber: 1
  }, {
    projectRoot: appDir
  });

  assert.equal(normalized.fileName, sourceFile);
  assert.equal(normalized.lineNumber, 1);
  assert.equal(normalized.columnNumber, 1);
});

test("resolves turbopack [project]/ path when relative to project root", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "react-spot-test-"));
  const sourceFile = path.join(tempRoot, "src/app/page.tsx");

  mkdirSync(path.dirname(sourceFile), { recursive: true });
  writeFileSync(sourceFile, "export default function Page() { return null; }\n", "utf8");

  const normalized = normalizeEditorSource({
    fileName: "[project]/src/app/page.tsx",
    lineNumber: 5,
    columnNumber: 3
  }, {
    projectRoot: tempRoot
  });

  assert.equal(normalized.fileName, sourceFile);
  assert.equal(normalized.lineNumber, 5);
  assert.equal(normalized.columnNumber, 3);
});

test("maps next chunk path to original source via sourcemap", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "react-spot-test-"));
  const sourceFile = path.join(tempRoot, "src/app/page.tsx");
  const chunkFile = path.join(tempRoot, ".next/dev/static/chunks/app_page_abc.js");
  const chunkMapFile = `${chunkFile}.map`;

  mkdirSync(path.dirname(sourceFile), { recursive: true });
  mkdirSync(path.dirname(chunkFile), { recursive: true });
  writeFileSync(sourceFile, "export default function Page() { return null; }\n", "utf8");
  writeFileSync(chunkFile, "console.log('chunk');\n", "utf8");
  writeFileSync(chunkMapFile, JSON.stringify({
    version: 3,
    file: "app_page_abc.js",
    sources: ["webpack:///(app-pages-browser)/./src/app/page.tsx"],
    sourcesContent: ["export default function Page() { return null; }\n"],
    names: [],
    mappings: "AAAA"
  }), "utf8");

  const normalized = normalizeEditorSource({
    fileName: "/_next/static/chunks/app_page_abc.js",
    lineNumber: 1,
    columnNumber: 1
  }, {
    projectRoot: tempRoot
  });

  assert.equal(normalized.fileName, sourceFile);
  assert.equal(normalized.lineNumber, 1);
  assert.equal(normalized.columnNumber, 1);
});

test("maps section sourcemap source back to project file", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "react-spot-test-"));
  const sourceFile = path.join(tempRoot, "src/app/page.tsx");
  const chunkFile = path.join(tempRoot, ".next/dev/static/chunks/app_page_section.js");
  const chunkMapFile = `${chunkFile}.map`;

  mkdirSync(path.dirname(sourceFile), { recursive: true });
  mkdirSync(path.dirname(chunkFile), { recursive: true });
  writeFileSync(sourceFile, "export default function Page() { return null; }\n", "utf8");
  writeFileSync(chunkFile, "console.log('chunk');\n", "utf8");
  writeFileSync(chunkMapFile, JSON.stringify({
    version: 3,
    sources: [],
    sections: [
      {
        offset: { line: 3, column: 0 },
        map: {
          version: 3,
          sources: ["file:///tmp/unknown-root/src/app/page.tsx"],
          names: [],
          mappings: "AAAA"
        }
      }
    ]
  }), "utf8");

  const normalized = normalizeEditorSource({
    fileName: "/_next/static/chunks/app_page_section.js"
  }, {
    projectRoot: tempRoot
  });

  assert.equal(normalized.fileName, sourceFile);
});

test("normalizes about-react-server file URL to source file", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "react-spot-test-"));
  const sourceFile = path.join(tempRoot, "src/app/page.tsx");
  const chunkFile = path.join(tempRoot, ".next/dev/server/chunks/ssr/[root-of-the-server]__hash._.js");
  const chunkMapFile = `${chunkFile}.map`;

  mkdirSync(path.dirname(sourceFile), { recursive: true });
  mkdirSync(path.dirname(chunkFile), { recursive: true });
  writeFileSync(sourceFile, "export default function Page() { return null; }\n", "utf8");
  writeFileSync(chunkFile, "console.log('server chunk');\n", "utf8");
  writeFileSync(chunkMapFile, JSON.stringify({
    version: 3,
    sources: [sourceFile],
    names: [],
    mappings: "AAAA"
  }), "utf8");

  const normalized = normalizeEditorSource({
    fileName: `about://React/Server/file://${chunkFile.replace(/\[/g, "%5B").replace(/\]/g, "%5D")}`,
    lineNumber: 1,
    columnNumber: 1
  }, {
    projectRoot: tempRoot
  });

  assert.equal(normalized.fileName, sourceFile);
  assert.equal(normalized.lineNumber, 1);
  assert.equal(normalized.columnNumber, 1);
});

test("creates editor arguments for common editors", () => {
  const source = {
    fileName: "/repo/src/index.js",
    lineNumber: 3,
    columnNumber: 4
  };

  assert.deepEqual(createEditorArgs("code", source), ["-g", "/repo/src/index.js:3:4"]);
  assert.deepEqual(createEditorArgs("webstorm", source), ["--line", "3", "/repo/src/index.js"]);
});

test("creates open endpoint URLs", () => {
  assert.equal(
    createOpenInEditorUrl({
      fileName: "/repo/src/index.js",
      lineNumber: 3,
      columnNumber: 4
    }),
    "/__open-in-editor?file=%2Frepo%2Fsrc%2Findex.js&line=3&column=4"
  );
});

test("preserves absolute open endpoint URLs", () => {
  assert.equal(
    createOpenInEditorUrl({
      fileName: "/repo/src/index.js"
    }, {
      endpoint: "http://localhost:4000/__open-in-editor"
    }),
    "http://localhost:4000/__open-in-editor?file=%2Frepo%2Fsrc%2Findex.js"
  );
});
