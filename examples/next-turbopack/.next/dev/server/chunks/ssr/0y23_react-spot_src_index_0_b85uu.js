module.exports = [
"[project]/examples/next-turbopack/node_modules/.pnpm/react-spot@file+..+../node_modules/react-spot/src/index.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ReactSpotError",
    ()=>ReactSpotError,
    "createOpenInEditorUrl",
    ()=>createOpenInEditorUrl,
    "findFiberFromElement",
    ()=>findFiberFromElement,
    "findSourceFromFiber",
    ()=>findSourceFromFiber,
    "getFiberFromDomNode",
    ()=>getFiberFromDomNode,
    "inspectElement",
    ()=>inspectElement,
    "installReactSpot",
    ()=>installReactSpot,
    "openSource",
    ()=>openSource,
    "parseSourceFromStack",
    ()=>parseSourceFromStack
]);
const REACT_FIBER_PREFIXES = [
    "__reactFiber$",
    "__reactInternalInstance$"
];
const DEFAULT_ENDPOINT = "/__open-in-editor";
const SOURCE_KEYS = [
    "_debugSource",
    "debugSource",
    "source"
];
const STACK_KEYS = [
    "_debugStack",
    "debugStack",
    "stack",
    "ownerStack",
    "_debugOwnerStack"
];
const OWNER_KEYS = [
    "_debugOwner",
    "debugOwner",
    "owner"
];
const USER_SOURCE_EXTENSIONS = [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
    ".mdx"
];
function installReactSpot(options = {}) {
    const win = options.window ?? globalThis.window;
    const doc = options.document ?? win?.document;
    if (!win || !doc) {
        return ()=>{};
    }
    if (!options.force && isProbablyProduction()) {
        return ()=>{};
    }
    const menuState = createContextMenuState(doc);
    const openTarget = (target)=>{
        if (!target?.source) {
            options.onError?.(new ReactSpotError("React source metadata was not found.", {
                code: "SOURCE_NOT_FOUND",
                detail: target
            }));
            return;
        }
        const opened = options.onOpen?.(target);
        if (opened === false) {
            return;
        }
        openSource(target.source, {
            endpoint: options.endpoint,
            fetch: options.fetch ?? win.fetch?.bind(win),
            extraQuery: {
                component: target.componentName ?? "",
                strategy: target.strategy ?? ""
            }
        }).catch((error)=>{
            options.onError?.(error);
            if (!options.onError) {
                win.console?.warn?.("[react-spot] Failed to open source.", error);
            }
        });
    };
    const clickListener = (event)=>{
        if (menuState.isOpen && isEventInsideNode(event, menuState.root)) {
            return;
        }
        if (!shouldHandleEvent(event, options.trigger)) {
            return;
        }
        if (event.button !== 0) {
            return;
        }
        const target = inspectEventTarget(event);
        event.preventDefault();
        event.stopPropagation();
        menuState.close();
        openTarget(target);
    };
    const contextMenuListener = (event)=>{
        if (!shouldHandleEvent(event, options.trigger)) {
            return;
        }
        const targets = inspectElementChain(event.target, {
            maxEntries: options.menuMaxEntries
        });
        if (targets.length === 0) {
            options.onError?.(new ReactSpotError("React source metadata was not found.", {
                code: "SOURCE_NOT_FOUND",
                detail: inspectEventTarget(event)
            }));
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        menuState.open({
            event,
            targets,
            onSelect (nextTarget) {
                menuState.close();
                openTarget(nextTarget);
            }
        });
    };
    const keyDownListener = (event)=>{
        if (!menuState.isOpen) {
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            menuState.close();
            return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            menuState.move(event.key === "ArrowDown" ? 1 : -1);
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            menuState.selectActive();
        }
    };
    const pointerDownListener = (event)=>{
        if (!menuState.isOpen) {
            return;
        }
        if (isEventInsideNode(event, menuState.root)) {
            return;
        }
        menuState.close();
    };
    doc.addEventListener("click", clickListener, true);
    doc.addEventListener("contextmenu", contextMenuListener, true);
    doc.addEventListener("keydown", keyDownListener, true);
    doc.addEventListener("pointerdown", pointerDownListener, true);
    return ()=>{
        menuState.destroy();
        doc.removeEventListener("click", clickListener, true);
        doc.removeEventListener("contextmenu", contextMenuListener, true);
        doc.removeEventListener("keydown", keyDownListener, true);
        doc.removeEventListener("pointerdown", pointerDownListener, true);
    };
}
function inspectElement(element) {
    const fiberResult = findFiberFromElement(element);
    if (!fiberResult) {
        return {
            element,
            fiber: null,
            source: null,
            componentName: null,
            strategy: "fiber-not-found"
        };
    }
    const sourceResult = findSourceFromFiber(fiberResult.fiber);
    return {
        element: fiberResult.element,
        fiber: fiberResult.fiber,
        source: sourceResult?.source ?? null,
        componentName: sourceResult?.componentName ?? getFiberDisplayName(fiberResult.fiber),
        strategy: sourceResult?.strategy ?? "source-not-found"
    };
}
function findFiberFromElement(element) {
    let current = element;
    while(current){
        const fiber = getFiberFromDomNode(current);
        if (fiber) {
            return {
                element: current,
                fiber
            };
        }
        current = current.parentElement ?? current.parentNode ?? null;
    }
    return null;
}
function getFiberFromDomNode(node) {
    if (!node || typeof node !== "object") {
        return null;
    }
    for (const key of Reflect.ownKeys(node)){
        if (typeof key !== "string") {
            continue;
        }
        if (REACT_FIBER_PREFIXES.some((prefix)=>key.startsWith(prefix))) {
            return node[key] ?? null;
        }
    }
    return null;
}
function findSourceFromFiber(startFiber) {
    const seen = new Set();
    const queue = [];
    let generatedFallback = null;
    let fiber = startFiber;
    while(fiber && !seen.has(fiber)){
        seen.add(fiber);
        queue.push({
            value: fiber,
            componentName: getFiberDisplayName(fiber),
            strategy: "fiber"
        });
        for (const ownerKey of OWNER_KEYS){
            const owner = fiber?.[ownerKey];
            if (owner && !seen.has(owner)) {
                queue.push({
                    value: owner,
                    componentName: getFiberDisplayName(owner),
                    strategy: ownerKey
                });
            }
        }
        fiber = fiber.return ?? null;
    }
    for (const candidate of queue){
        const source = readSourceDeep(candidate.value, seen);
        if (source) {
            if (isLikelyGeneratedSource(source.fileName)) {
                if (!generatedFallback) {
                    generatedFallback = {
                        source,
                        componentName: candidate.componentName,
                        strategy: candidate.strategy
                    };
                }
                continue;
            }
            return {
                source,
                componentName: candidate.componentName,
                strategy: candidate.strategy
            };
        }
    }
    return generatedFallback;
}
async function openSource(source, options = {}) {
    const requestFetch = options.fetch ?? globalThis.fetch;
    if (!requestFetch) {
        throw new ReactSpotError("fetch is not available.", {
            code: "FETCH_UNAVAILABLE"
        });
    }
    const url = createOpenInEditorUrl(source, {
        endpoint: options.endpoint,
        extraQuery: options.extraQuery
    });
    const response = await requestFetch(url, {
        method: "GET",
        cache: "no-store",
        keepalive: true
    });
    if (!response.ok) {
        throw new ReactSpotError(`Open in editor failed with HTTP ${response.status}.`, {
            code: "OPEN_FAILED",
            status: response.status
        });
    }
}
function createOpenInEditorUrl(source, options = {}) {
    const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    const url = new URL(endpoint, globalThis.location?.href ?? "http://localhost");
    const isAbsoluteEndpoint = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(endpoint);
    url.searchParams.set("file", source.fileName);
    if (source.lineNumber != null) {
        url.searchParams.set("line", String(source.lineNumber));
    }
    if (source.columnNumber != null) {
        url.searchParams.set("column", String(source.columnNumber));
    }
    for (const [key, value] of Object.entries(options.extraQuery ?? {})){
        if (value != null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    }
    return isAbsoluteEndpoint ? url.href : url.pathname + url.search + url.hash;
}
function parseSourceFromStack(stack) {
    if (typeof stack !== "string" || stack.length === 0) {
        return null;
    }
    let generatedFallback = null;
    for (const line of stack.split("\n")){
        const source = parseSourceFromStackLine(line);
        if (source && isLikelyUserSource(source.fileName)) {
            return source;
        }
        if (!generatedFallback && source) {
            generatedFallback = source;
        }
    }
    for (const line of stack.split("\n")){
        const source = parseSourceFromStackLine(line);
        if (source && !isLikelyGeneratedSource(source.fileName)) {
            return source;
        }
        if (!generatedFallback && source) {
            generatedFallback = source;
        }
    }
    return generatedFallback;
}
class ReactSpotError extends Error {
    constructor(message, details = {}){
        super(message);
        this.name = "ReactSpotError";
        Object.assign(this, details);
    }
}
function inspectEventTarget(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [
        event.target
    ];
    for (const entry of path){
        if (isDomNode(entry)) {
            const result = inspectElement(entry);
            if (result.fiber) {
                return result;
            }
        }
    }
    return inspectElement(event.target);
}
function inspectElementChain(element, options = {}) {
    const fiberResult = findFiberFromElement(element);
    if (!fiberResult) {
        return [];
    }
    const targets = [];
    const maxEntries = toPositiveInteger(options.maxEntries) ?? 8;
    const seenFibers = new Set();
    const seenSources = new Set();
    let fiber = fiberResult.fiber;
    while(fiber && !seenFibers.has(fiber) && targets.length < maxEntries){
        seenFibers.add(fiber);
        const sourceResult = findSourceFromFiber(fiber);
        const source = sourceResult?.source;
        if (source) {
            const sourceKey = `${source.fileName}:${source.lineNumber ?? 0}:${source.columnNumber ?? 0}`;
            if (!seenSources.has(sourceKey)) {
                seenSources.add(sourceKey);
                targets.push({
                    element: fiberResult.element,
                    fiber,
                    source,
                    componentName: sourceResult?.componentName ?? getFiberDisplayName(fiber),
                    strategy: sourceResult?.strategy ?? "fiber-return"
                });
            }
        }
        fiber = fiber.return ?? null;
    }
    return targets;
}
function shouldHandleEvent(event, trigger) {
    if (typeof trigger === "function") {
        return trigger(event);
    }
    if (trigger === "always") {
        return true;
    }
    if (trigger === "meta-shift") {
        return event.metaKey && event.shiftKey;
    }
    if (trigger === "ctrl-shift") {
        return event.ctrlKey && event.shiftKey;
    }
    if (trigger === "alt") {
        return event.altKey;
    }
    return event.altKey;
}
function createContextMenuState(doc) {
    const root = doc.createElement("div");
    root.style.position = "fixed";
    root.style.display = "none";
    root.style.zIndex = "2147483647";
    root.style.minWidth = "360px";
    root.style.maxWidth = "560px";
    root.style.maxHeight = "60vh";
    root.style.overflow = "auto";
    root.style.padding = "6px";
    root.style.borderRadius = "10px";
    root.style.border = "1px solid rgba(148, 163, 184, 0.45)";
    root.style.background = "rgba(15, 23, 42, 0.96)";
    root.style.backdropFilter = "blur(6px)";
    root.style.boxShadow = "0 14px 40px rgba(2, 6, 23, 0.45)";
    root.style.color = "#e2e8f0";
    root.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    root.style.fontSize = "12px";
    root.style.lineHeight = "1.45";
    root.setAttribute("role", "listbox");
    root.setAttribute("aria-label", "react-spot component source menu");
    (doc.body ?? doc.documentElement)?.appendChild(root);
    let targets = [];
    let activeIndex = 0;
    let onSelect = null;
    const render = ()=>{
        root.textContent = "";
        targets.forEach((target, index)=>{
            const button = doc.createElement("button");
            button.type = "button";
            button.style.display = "block";
            button.style.width = "100%";
            button.style.textAlign = "left";
            button.style.border = "0";
            button.style.padding = "8px 10px";
            button.style.borderRadius = "8px";
            button.style.marginBottom = "4px";
            button.style.cursor = "pointer";
            button.style.background = index === activeIndex ? "rgba(56, 189, 248, 0.20)" : "transparent";
            button.style.color = index === activeIndex ? "#bae6fd" : "#e2e8f0";
            button.style.outline = "none";
            button.setAttribute("role", "option");
            button.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
            const main = doc.createElement("div");
            main.textContent = formatMenuTitle(target);
            main.style.whiteSpace = "nowrap";
            main.style.overflow = "hidden";
            main.style.textOverflow = "ellipsis";
            main.style.fontWeight = "600";
            const detail = doc.createElement("div");
            detail.textContent = formatMenuDetail(target.source);
            detail.style.whiteSpace = "nowrap";
            detail.style.overflow = "hidden";
            detail.style.textOverflow = "ellipsis";
            detail.style.opacity = "0.85";
            const propsDetail = doc.createElement("div");
            propsDetail.textContent = formatPropsPreview(target.fiber?.memoizedProps ?? target.fiber?.pendingProps);
            propsDetail.style.whiteSpace = "nowrap";
            propsDetail.style.overflow = "hidden";
            propsDetail.style.textOverflow = "ellipsis";
            propsDetail.style.opacity = "0.7";
            button.append(main, detail, propsDetail);
            button.addEventListener("mouseenter", ()=>{
                activeIndex = index;
                syncActiveState();
            });
            button.addEventListener("pointerdown", (event)=>{
                event.preventDefault();
                event.stopPropagation();
                onSelect?.(targets[index]);
            });
            root.appendChild(button);
        });
    };
    const syncActiveState = ()=>{
        const children = root.children;
        for(let index = 0; index < children.length; index += 1){
            const child = children[index];
            if (!(child instanceof HTMLElement)) {
                continue;
            }
            const active = index === activeIndex;
            child.style.background = active ? "rgba(56, 189, 248, 0.20)" : "transparent";
            child.style.color = active ? "#bae6fd" : "#e2e8f0";
            child.setAttribute("aria-selected", active ? "true" : "false");
        }
    };
    const close = ()=>{
        root.style.display = "none";
        targets = [];
        activeIndex = 0;
        onSelect = null;
    };
    return {
        root,
        get isOpen () {
            return root.style.display !== "none";
        },
        open ({ event, targets: nextTargets, onSelect: nextOnSelect }) {
            targets = Array.isArray(nextTargets) ? nextTargets : [];
            activeIndex = 0;
            onSelect = nextOnSelect;
            render();
            if (targets.length === 0) {
                close();
                return;
            }
            const padding = 12;
            root.style.visibility = "hidden";
            root.style.display = "block";
            const rect = root.getBoundingClientRect();
            const maxLeft = (doc.defaultView?.innerWidth ?? 0) - rect.width - padding;
            const maxTop = (doc.defaultView?.innerHeight ?? 0) - rect.height - padding;
            const left = clamp(event.clientX, padding, Math.max(padding, maxLeft));
            const top = clamp(event.clientY, padding, Math.max(padding, maxTop));
            root.style.left = `${left}px`;
            root.style.top = `${top}px`;
            root.style.visibility = "visible";
            syncActiveState();
        },
        move (step) {
            if (!targets.length) {
                return;
            }
            const size = targets.length;
            activeIndex = (activeIndex + step + size) % size;
            syncActiveState();
        },
        selectActive () {
            if (!targets.length) {
                return;
            }
            onSelect?.(targets[activeIndex]);
        },
        close,
        destroy () {
            close();
            root.remove();
        }
    };
}
function formatMenuTitle(target) {
    return target.componentName ?? "(anonymous)";
}
function formatMenuDetail(source) {
    if (!source) {
        return "source not found";
    }
    const line = source.lineNumber ?? 1;
    const column = source.columnNumber ?? 1;
    return `${stripSourceSearch(source.fileName)}:${line}:${column}`;
}
function formatPropsPreview(props) {
    if (props == null) {
        return "props: (none)";
    }
    try {
        const seen = new Set();
        const json = JSON.stringify(props, (key, value)=>{
            if (typeof value === "function") {
                return `[function ${value.name || "anonymous"}]`;
            }
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) {
                    return "[circular]";
                }
                seen.add(value);
            }
            return value;
        });
        if (!json) {
            return "props: (empty)";
        }
        return `props: ${truncateText(json, 200)}`;
    } catch  {
        return "props: [unserializable]";
    }
}
function stripSourceSearch(fileName) {
    if (typeof fileName !== "string") {
        return "";
    }
    const [cleaned] = fileName.split("?");
    return cleaned;
}
function isEventInsideNode(event, node) {
    if (!node) {
        return false;
    }
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.includes(node);
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function truncateText(value, maxLength) {
    if (typeof value !== "string" || value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength - 1)}…`;
}
function readSourceDeep(value, seen, depth = 0) {
    if (!value || depth > 5) {
        return null;
    }
    const direct = normalizeSource(value);
    if (direct) {
        return direct;
    }
    if (typeof value === "string") {
        return parseSourceFromStack(value);
    }
    if (typeof value !== "object") {
        return null;
    }
    if (seen.has(value) && depth > 0) {
        return null;
    }
    seen.add(value);
    for (const sourceKey of SOURCE_KEYS){
        const source = normalizeSource(value[sourceKey]);
        if (source) {
            return source;
        }
    }
    let stackFallback = null;
    for (const stackKey of STACK_KEYS){
        const stackSource = readStackLike(value[stackKey]);
        if (stackSource) {
            // RSC 运行时产生的合成栈帧不应作为最终结果，留作 fallback 继续搜索更好的源
            if (isLikelyGeneratedSource(stackSource.fileName)) {
                if (!stackFallback) {
                    stackFallback = stackSource;
                }
                continue;
            }
            return stackSource;
        }
    }
    const debugInfo = value._debugInfo ?? value.debugInfo;
    if (Array.isArray(debugInfo)) {
        for (const info of debugInfo){
            const source = readSourceDeep(info, seen, depth + 1);
            if (source) {
                return source;
            }
        }
    }
    for (const ownerKey of OWNER_KEYS){
        const ownerSource = readSourceDeep(value[ownerKey], seen, depth + 1);
        if (ownerSource) {
            return ownerSource;
        }
    }
    return stackFallback ?? null;
}
function readStackLike(value) {
    if (!value) {
        return null;
    }
    if (typeof value === "string") {
        return parseSourceFromStack(value);
    }
    if (typeof value.stack === "string") {
        return parseSourceFromStack(value.stack);
    }
    if (typeof value.toString === "function") {
        const text = value.toString();
        if (text && text !== "[object Object]") {
            return parseSourceFromStack(text);
        }
    }
    return null;
}
function normalizeSource(value) {
    if (!value || typeof value !== "object") {
        return null;
    }
    const fileName = value.fileName ?? value.filename ?? value.file ?? value.url;
    if (typeof fileName !== "string" || fileName.length === 0) {
        return null;
    }
    return {
        fileName,
        lineNumber: toPositiveInteger(value.lineNumber ?? value.line ?? value.lineno),
        columnNumber: toPositiveInteger(value.columnNumber ?? value.column ?? value.colno)
    };
}
function parseSourceFromStackLine(line) {
    const cleaned = line.trim();
    const location = cleaned.match(/\((?<location>.*:\d+:\d+)\)$/)?.groups?.location ?? cleaned.match(/(?<location>(?:(?:webpack-internal:\/\/\/|webpack:\/\/\/|turbopack:\/\/\/|file:\/\/\/|https?:\/\/|[A-Za-z]:[\\/]|\/|\.\.?[\\/]).*|[^\s()]+\.[cm]?[jt]sx?|[^\s()]+\.mdx):\d+:\d+)\)?$/)?.groups?.location;
    if (!location) {
        return null;
    }
    const normalizedLocation = location.replace(/^about:\/\/react\/server\//i, "");
    const match = normalizedLocation.match(/^(?<file>.*):(?<line>\d+):(?<column>\d+)$/);
    if (!match?.groups || !hasSourcePrefix(match.groups.file) && !isLikelyUserSource(match.groups.file)) {
        return null;
    }
    return {
        fileName: match.groups.file,
        lineNumber: Number(match.groups.line),
        columnNumber: Number(match.groups.column)
    };
}
function hasSourcePrefix(fileName) {
    return /^(webpack-internal:\/\/\/|webpack:\/\/\/|turbopack:\/\/\/|file:\/\/\/|https?:\/\/|\[[^\]]*\]\/|[A-Za-z]:[\\/]|\/|\.\.?[\\/])/.test(fileName);
}
function isLikelyUserSource(fileName) {
    const lower = fileName.toLowerCase();
    if (lower.includes("about://react/server/") || lower.includes("/node_modules/") || lower.includes("\\node_modules\\") || lower.includes("react-dom") || lower.includes("next/dist/") || lower.includes("/_next/static/chunks/") || lower.includes("\\_next\\static\\chunks\\") || lower.includes("/.next/static/chunks/") || lower.includes("\\.next\\static\\chunks\\") || lower.includes("/.next/dev/static/chunks/") || lower.includes("\\.next\\dev\\static\\chunks\\") || lower.includes("/.next/server/chunks/") || lower.includes("\\.next\\server\\chunks\\") || lower.includes("/.next/dev/server/chunks/") || lower.includes("\\.next\\dev\\server\\chunks\\") || lower.includes("/chunks/ssr/") || lower.includes("\\chunks\\ssr\\")) {
        return false;
    }
    return USER_SOURCE_EXTENSIONS.some((extension)=>lower.split("?")[0].endsWith(extension));
}
function isLikelyGeneratedSource(fileName) {
    const lower = String(fileName ?? "").toLowerCase();
    return lower.includes("about://react/server/") || lower.includes("/node_modules/") || lower.includes("\\node_modules\\") || lower.includes("react-dom") || lower.includes("next/dist/") || lower.includes("/_next/static/chunks/") || lower.includes("\\_next\\static\\chunks\\") || lower.includes("/.next/static/chunks/") || lower.includes("\\.next\\static\\chunks\\") || lower.includes("/.next/dev/static/chunks/") || lower.includes("\\.next\\dev\\static\\chunks\\") || lower.includes("/.next/server/chunks/") || lower.includes("\\.next\\server\\chunks\\") || lower.includes("/.next/dev/server/chunks/") || lower.includes("\\.next\\dev\\server\\chunks\\") || lower.includes("/chunks/ssr/") || lower.includes("\\chunks\\ssr\\");
}
function getFiberDisplayName(fiber) {
    const type = fiber?.elementType ?? fiber?.type;
    if (typeof type === "string") {
        return type;
    }
    return type?.displayName ?? type?.name ?? fiber?._debugName ?? fiber?.tagName ?? null;
}
function isDomNode(value) {
    return value && typeof value === "object" && typeof value.nodeType === "number";
}
function toPositiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : undefined;
}
function isProbablyProduction() {
    return globalThis.process?.env?.NODE_ENV === "production";
}
}),
];

//# sourceMappingURL=0y23_react-spot_src_index_0_b85uu.js.map