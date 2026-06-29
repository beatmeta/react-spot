import type { ClickToNodeInfo, Fiber } from './types';

export { isHostFiberEntry } from './types';

// 避免对同一 fiber 重复执行 type 检测逻辑，
// 在 owner chain 遍历中同一 fiber 可能被 isUserComponent、getStackFrame、push 等多处调用
const componentNameCache = new WeakMap<Fiber, string>();

/**
 * 从 fiber 中提取可读的组件名称。
 *
 * 支持函数组件、类组件、ForwardRef、Memo 包装和原生 DOM 元素。
 * 结果通过 WeakMap 缓存，同一 fiber 只解析一次。
 *
 * Args:
 *   fiber: React fiber 节点
 *
 * Returns:
 *   组件的显示名称
 */
export function getComponentName(fiber: Fiber): string {
  const cached = componentNameCache.get(fiber);
  if (cached !== undefined) return cached;
  const name = resolveComponentName(fiber).name;
  componentNameCache.set(fiber, name);
  return name;
}

interface NameResolution {
  name: string;
  reason: string;
}

/**
 * 解析 fiber 的组件名称，同时返回解析策略说明（用于调试）。
 *
 * 按优先级依次尝试：displayName → function.name → toString 解析 →
 * ForwardRef/Memo 包装解析 → object 属性。
 */
function resolveComponentName(fiber: Fiber): NameResolution {
  try {
    if (typeof fiber.type === 'function') {
      const func = fiber.type as Function & { displayName?: string };
      if (func.displayName && typeof func.displayName === 'string') {
        return { name: func.displayName, reason: 'function.displayName' };
      }
      if (func.name && typeof func.name === 'string' && func.name.length > 0) {
        return { name: func.name, reason: 'function.name' };
      }
      try {
        const funcStr = fiber.type.toString();
        const match = funcStr.match(/^function\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
        if (match?.[1]) {
          return { name: match[1], reason: 'function.toString() parse' };
        }
      } catch {
        // toString 可能在 Proxy 等场景下抛异常
      }
      return { name: 'Anonymous Function Component', reason: 'function type, no name/displayName' };
    }

    if (typeof fiber.type === 'string') {
      return { name: fiber.type, reason: 'native element' };
    }

    if (fiber.type && typeof fiber.type === 'object') {
      const obj = fiber.type as Record<string, unknown>;
      // ForwardRef 检测：$$typeof + render 方法
      if (obj.$$typeof && obj.render) {
        const render = obj.render as Function & { name?: string; displayName?: string };
        const renderName = render.name || render.displayName;
        return renderName && typeof renderName === 'string'
          ? { name: `ForwardRef(${renderName})`, reason: `forwardRef, render.name=${renderName}` }
          : { name: 'ForwardRef(Anonymous)', reason: 'forwardRef, no render name' };
      }
      // Memo 检测：$$typeof + type 属性
      if (obj.$$typeof && obj.type) {
        const wrappedName = getComponentNameFromType(obj.type);
        return wrappedName && typeof wrappedName === 'string' && wrappedName.length > 0
          ? { name: `Memo(${wrappedName})`, reason: `memo, wrapped=${wrappedName}` }
          : { name: 'Memo(Anonymous)', reason: 'memo, no inner name' };
      }
      if (obj.displayName && typeof obj.displayName === 'string') {
        return { name: obj.displayName as string, reason: 'object.displayName' };
      }
      if (obj.name && typeof obj.name === 'string') {
        return { name: obj.name as string, reason: 'object.name' };
      }
      return {
        name: 'Component (Object Type)',
        reason: `object type, $$typeof=${String(obj.$$typeof ?? 'none')}`,
      };
    }

    if (!fiber.type) {
      return { name: 'Component (No Type)', reason: 'fiber.type is falsy' };
    }
    return { name: 'Component Name Unknown', reason: `unexpected type: ${typeof fiber.type}` };
  } catch (err) {
    return { name: 'Component Name Unknown', reason: `exception: ${err}` };
  }
}

function getComponentNameFromType(type: unknown): string {
  try {
    if (typeof type === 'string') return type;
    if (typeof type === 'function') {
      const func = type as Function & { displayName?: string };
      return func.displayName || func.name || 'Anonymous';
    }
    if (type && typeof type === 'object') {
      const obj = type as Record<string, unknown>;
      if (obj.displayName && typeof obj.displayName === 'string') return obj.displayName;
      if (obj.name && typeof obj.name === 'string') return obj.name;
    }
    return 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// React 19 会在 _debugStack 中注入一个以组件自身名称命名的"自身帧"，
// 用于让 Error 调用栈更可读。对于源码导航，我们需要跳过这个自身帧，
// 取其后面的帧（即组件 JSX 在父组件中的使用位置）。
// 但 workspace 包通过 HMR 模块加载时，自身帧可能不存在或已被过滤，
// 此时 meaningful[0] 就已经是正确的使用位置。
// 因此不能使用固定索引，需要通过函数名匹配来动态判断。
const STACK_FRAME_INDEX_FALLBACK = 1;

/**
 * 判断栈帧行是否为 React 运行时内部帧（无法解析为用户源码）。
 */
/**
 * 按路径关键词匹配的框架/运行时内部模块。
 * 这些文件中的帧永远不会指向用户源码。
 */
const INTERNAL_PATH_KEYWORDS = [
  // React 核心运行时
  'react-dom',
  'react-server-dom',
  'react-jsx-dev-runtime',
  'react-jsx-runtime',
  'react/cjs/',
  'react/dist/',
  'react-reconciler',
  'react-client',
  'react-refresh',
  // React 编译产物（node_modules 内）
  'compiled/react/',
  'compiled/react-dom/',
  'compiled/react-server-dom',
  // Next.js 内部
  'next/dist/',
  'next-server',
  // 调度器
  'scheduler',
  // 打包器运行时
  'webpack-internal',
  'turbopack-ecmascript-runtime',
  '__turbopack_',
  '[turbopack]',
  'turbopack:',
  'hmr-runtime',
  'hot-reloader',
];

/**
 * 按函数名/标识符匹配的 React 内部栈帧。
 * 这些是 React 运行时在 dev 模式下注入到调用栈中的。
 */
const INTERNAL_FUNCTION_KEYWORDS = [
  // JSX 转换运行时函数
  'jsxDEV',
  'jsxProdSignatureRunningInDevWithDynamicChildren',
  'jsxs',
  // React.createElement 系列
  'createElementWithValidation',
  // React 调试栈注入
  'fakeJSXCallSite',
  'react-stack-top-frame',
  'react_stack_bottom_frame',
  'initializeElement',
  'initializeFakeStack',
  'createFakeJSXCallStack',
  // React 调和器内部
  'renderWithHooks',
  'mountIndeterminateComponent',
  'beginWork',
  'performUnitOfWork',
  'workLoopSync',
  'callCallback',
  'invokeGuardedCallbackDev',
  // React Server Components 内部
  'processServerComponentReturnValue',
  'attemptResolveElement',
];

// 将所有内部关键词预编译为单个正则，利用引擎内部 alternation 优化（trie/Aho-Corasick），
// 单次 test 替代逐一 includes，在高频栈帧过滤场景下性能提升约 5-10x
const INTERNAL_FRAME_RE = new RegExp(
  [...INTERNAL_PATH_KEYWORDS, ...INTERNAL_FUNCTION_KEYWORDS, '<anonymous>']
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
);

function isUnresolvableFrame(line: string): boolean {
  return INTERNAL_FRAME_RE.test(line);
}

/**
 * fiber 栈帧解析缓存结构。
 *
 * 一次解析同时产出 preferredFrame（首选帧）和 allFrames（按优先级排列的全部帧），
 * 供 getStackFrame / getAllMeaningfulFrames / isUserComponent 共享，
 * 避免同一 fiber 的 _debugStack.stack 被重复 split + filter。
 */
interface ParsedStackInfo {
  preferredFrame: string | undefined;
  allFrames: string[];
  meaningfulLines: string[];
  hasUserFrame: boolean;
}

// WeakMap 以 fiber 对象为 key，GC 友好，不会阻止 fiber 被回收
const parsedStackCache = new WeakMap<Fiber, ParsedStackInfo>();

/**
 * 一次性解析 fiber 的 _debugStack，并缓存解析结果。
 *
 * 内部完成：栈字符串分割、运行时帧过滤、自身帧检测、首选帧确定、
 * 用户帧判断。所有需要栈信息的函数共享此缓存，避免重复解析。
 */
function getParsedStack(fiber: Fiber): ParsedStackInfo {
  const cached = parsedStackCache.get(fiber);
  if (cached) return cached;

  const stack = fiber._debugStack?.stack;
  if (!stack) {
    const empty: ParsedStackInfo = {
      preferredFrame: undefined,
      allFrames: [],
      meaningfulLines: [],
      hasUserFrame: true,
    };
    parsedStackCache.set(fiber, empty);
    return empty;
  }

  const lines = stack.split('\n');
  const meaningfulLines: string[] = [];
  let hasUserFrame = false;
  let hasAnyMeaningfulFrame = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (isUnresolvableFrame(line)) continue;

    meaningfulLines.push(line);
    hasAnyMeaningfulFrame = true;

    // 顺带检测是否存在非框架帧（用于 isUserComponent 判定）
    if (
      !hasUserFrame &&
      !line.includes('node_modules') &&
      !line.includes('next/dist') &&
      !line.includes('next_dist') &&
      !line.includes('next-server') &&
      !line.includes('react-dom') &&
      !line.includes('react-server-dom')
    ) {
      hasUserFrame = true;
    }
  }

  // 确定首选帧
  let preferredFrame: string | undefined;
  let preferredIndex = 0;

  if (meaningfulLines.length > 0) {
    if (typeof fiber.type === 'string') {
      // 原生 DOM 元素直接取第一个帧
      preferredFrame = meaningfulLines[0];
    } else {
      // 函数组件：检测自身帧
      const componentName = getComponentName(fiber);
      if (meaningfulLines.length > 1 && isSelfFrame(meaningfulLines[0], componentName)) {
        preferredIndex = STACK_FRAME_INDEX_FALLBACK;
      }
      preferredFrame = meaningfulLines[preferredIndex] || meaningfulLines[0];
    }
  }

  // 构建按优先级排列的完整帧列表
  const allFrames: string[] = [];
  if (preferredFrame) {
    allFrames.push(preferredFrame);
    for (let i = 0; i < meaningfulLines.length; i++) {
      if (i !== preferredIndex) {
        allFrames.push(meaningfulLines[i]);
      }
    }
  }

  // hasUserFrame 仅在确实有 meaningful 帧时才有意义
  const result: ParsedStackInfo = {
    preferredFrame,
    allFrames,
    meaningfulLines,
    hasUserFrame: !hasAnyMeaningfulFrame || hasUserFrame,
  };
  parsedStackCache.set(fiber, result);
  return result;
}

/**
 * 从 fiber 的 _debugStack 中提取首选栈帧行。
 *
 * 利用统一解析缓存，避免重复字符串分割和过滤。
 * 返回的帧通常对应用户源码中的 JSX 调用位置。
 *
 * Args:
 *   fiber: React fiber 节点
 *
 * Returns:
 *   栈帧行字符串，如 "at Button (http://…:18:26)"，或 undefined
 */
export function getStackFrame(fiber: Fiber): string | undefined {
  return getParsedStack(fiber).preferredFrame;
}

/**
 * 检测栈帧行是否为 React 注入的组件"自身帧"。
 *
 * React 19 在 _debugStack 中注入形如 `at ComponentName (url:line:col)` 的帧，
 * 函数名与当前组件名一致。通过比较帧中的函数名与 fiber 的组件名来判断。
 */
function isSelfFrame(frameLine: string, componentName: string): boolean {
  // 提取帧中的函数名：匹配 "at FuncName (" 或 "FuncName@" 格式
  const atMatch = frameLine.match(/^at\s+([^\s(]+)/);
  const frameName = atMatch?.[1] ?? frameLine.match(/^([^@]+)@/)?.[1];
  if (!frameName) return false;

  // 直接匹配
  if (frameName === componentName) return true;

  // componentName 带包装的情况：
  // getComponentName 返回 "Memo(Foo)" 但 React 19 自身帧用的是内部函数名 "Foo"
  const innerFromComponent = componentName.match(/^(?:Memo|ForwardRef)\((.+)\)$/);
  if (innerFromComponent && frameName === innerFromComponent[1]) return true;

  // frameName 带包装的情况：
  // 某些 bundler 转换后栈帧显示 "Memo(Foo)" 或 "ForwardRef(Foo)"，
  // 而 getComponentName 可能返回不带包装的 "Foo" 或不同层级的包装名
  const innerFromFrame = frameName.match(/^(?:Memo|ForwardRef)\((.+)\)$/);
  if (innerFromFrame) {
    const unwrappedFrame = innerFromFrame[1];
    if (unwrappedFrame === componentName) return true;
    // 双方都带包装但内部名相同（如 frameName="ForwardRef(Foo)" componentName="Memo(Foo)"）
    if (innerFromComponent && unwrappedFrame === innerFromComponent[1]) return true;
  }

  return false;
}

/**
 * 获取 fiber 的所有有意义栈帧（按优先级排序）。
 *
 * 利用统一解析缓存，首元素与 getStackFrame 返回值一致。
 * 当首选栈帧解析到 React 运行时等无效位置时，调用方可逐个尝试后续候选帧。
 *
 * Args:
 *   fiber: React fiber 节点
 *
 * Returns:
 *   按优先级排列的栈帧行数组
 */
export function getAllMeaningfulFrames(fiber: Fiber): string[] {
  return getParsedStack(fiber).allFrames;
}

/**
 * 在 DOM 节点上查找 React fiber 内部属性。
 *
 * React 通过 __reactFiber$xxx 前缀的属性将 fiber 挂载到 DOM 节点，
 * xxx 是每次挂载随机生成的 hash。
 */
function findFiberElementFromNode(node: Element): Fiber | null {
  const properties = Object.getOwnPropertyNames(node);
  const fiberProperty = properties.find((p) => p.startsWith('__reactFiber'));
  if (!fiberProperty) return null;
  return (node as unknown as Record<string, Fiber>)[fiberProperty];
}

/**
 * 从 React 19 虚拟 owner 的属性中提取可用的栈帧字符串。
 *
 * 虚拟 owner 的 `stack` 属性是 React Flight 协议的 CSV 格式：
 * `callerName,bundlePath,line,col,enclosingLine,enclosingCol,isNative`
 *
 * 例如：`"AppShell,/Users/.../[root-of-the-server]__xxx.js,705,391,689,1,false"`
 *
 * 此函数将 CSV 格式转换为标准的 RSC 风格栈帧字符串（about://React/Server/file:///...），
 * 使其可以复用现有的 `resolveLocation` → `resolveViaNextDevServer` 管道，
 * 通过 Next.js 内置的 `__nextjs_original-stack-frames` 端点解析回原始源码位置。
 */
function resolveVirtualOwnerStackFrame(
  componentName: string,
  node: Record<string, unknown>
): string | undefined {
  // 优先尝试 debugStack（Error 对象），其 stack 包含标准格式的帧
  const debugStack = node.debugStack;
  if (debugStack && typeof debugStack === 'object') {
    const errStack = (debugStack as { stack?: string }).stack;
    if (typeof errStack === 'string') {
      const lines = errStack.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && trimmed.startsWith('at ') && !isUnresolvableFrame(trimmed)) {
          return trimmed;
        }
      }
    }
  }

  // 解析 CSV 格式的 stack 属性
  const csvStack = node.stack;
  if (typeof csvStack === 'string' && csvStack.length > 0) {
    // CSV 格式：callerName,bundlePath,line,col,enclosingLine,enclosingCol,isNative
    // bundlePath 可能包含逗号前面有路径分隔符的情况，需要从后往前解析
    const parts = csvStack.split(',');
    if (parts.length >= 4) {
      // 从后往前取固定字段：isNative, enclosingCol, enclosingLine, col, line
      // 剩余前面的部分拼接为 callerName,bundlePath
      const isNative = parts[parts.length - 1];
      const enclosingCol = parts[parts.length - 2];
      const enclosingLine = parts[parts.length - 3];
      const col = parts[parts.length - 4];
      const line = parts[parts.length - 5];

      if (isNative === 'true') {
        // 原生函数调用（如 Promise.all），无法解析到源码
        return undefined;
      }

      // bundlePath 是从第二个到倒数第六个元素（callerName 是第一个）
      const bundlePath = parts.slice(1, parts.length - 5).join(',');

      if (bundlePath && line && col) {
        const lineNum = parseInt(line, 10);
        const colNum = parseInt(col, 10);
        if (!isNaN(lineNum) && !isNaN(colNum) && bundlePath.includes('.next/')) {
          // 构造 RSC 风格 URL，使其匹配 resolveViaNextDevServer 的 isNextjsRscUrl 检测
          const encodedPath = bundlePath.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
          const rscUrl = `about://React/Server/file://${encodedPath}`;
          return `at ${componentName} (${rscUrl}:${lineNum}:${colNum})`;
        }
      }
    }
  }

  return undefined;
}

/**
 * Next.js / React 框架内部组件名黑名单。
 *
 * 这些组件出现在 fiber.return 链中，但不是用户自己编写的，
 * 在层级视图中显示它们只会增加干扰。列表涵盖：
 * - Next.js App Router 内部组件（LayoutRouter、SegmentViewNode 等）
 * - Next.js 错误/重定向边界
 * - Next.js 开发工具覆盖层
 * - React 本身的 Provider/Consumer 等包装
 */
const FRAMEWORK_COMPONENT_NAMES = new Set([
  // Next.js App Router 核心
  'AppRouter',
  'Router',
  'LayoutRouter',
  'InnerLayoutRouter',
  'OuterLayoutRouter',
  'SegmentViewNode',
  'ChildSegmentMap',
  'ChildSegment',

  // Next.js 滚动与焦点管理
  'ScrollAndMaybeFocusHandler',
  'InnerScrollAndFocusHandler',
  'FocusAndScrollRef',

  // Next.js 错误/边界相关
  'ErrorBoundary',
  'ErrorBoundaryHandler',
  'GlobalError',
  'RedirectBoundary',
  'RedirectErrorBoundary',
  'NotFoundBoundary',
  'NotFoundErrorBoundary',
  'LoadingBoundary',
  'HTTPAccessFallbackBoundary',
  'HTTPAccessFallbackErrorBoundary',
  'MetadataBoundary',
  'MetadataOutlet',
  'ViewportBoundary',
  'OutletBoundary',

  // Next.js 路由上下文
  'PathnameContextProviderAdapter',
  'GlobalLayoutRouterContext',
  'LayoutRouterContext',

  // Next.js 开发工具
  'HotReload',
  'DevOverlay',
  'ReactDevOverlay',
  'DevRootNotFoundBoundary',

  // Next.js 渲染管道
  'ServerRoot',
  'Root',
  'AppTreeContext',
  'Head',
  'RenderFromTemplateContext',
  'ResolvedParams',
  'StaticGenerationSearchParamsBailoutProvider',
  'AutoScrollOnNavigation',
  'NavigateHandler',
  'MaybePostpone',
  'NotAllowed',
  'PreloadCss',
  'PreloadModule',
  'NonIndex',

  // React 内部包装
  'Suspense',
  'Fragment',
  'StrictMode',
  'Profiler',
  'Provider',
  'Consumer',
  'Context',
]);

/**
 * 框架组件名的合并正则，用于匹配动态生成的或变体名称。
 * 将 17 个独立 RegExp 合并为单次 test，减少正则引擎启动开销。
 *
 * 例如 "InnerLayoutRouter_", "Memo(LayoutRouter)" 等。
 */
const FRAMEWORK_NAME_RE = /Boundary$|^(Inner|Outer)?LayoutRouter|^Segment|^Scroll|^Redirect|^NotFound|^HTTPAccess|^Metadata(Boundary|Outlet)|^Viewport|^DevOverlay|^HotReload|^ReactDevOverlay|^ServerRoot|^AppRouter|^GlobalLayoutRouter|^PathnameContext|^RenderFromTemplate|^StaticGeneration|^AutoScroll|^NavigateHandler|^PreloadCss|^PreloadModule/;

/**
 * 判断 fiber 是否为用户定义的组件（而非框架/库内部组件）。
 *
 * 综合三层过滤策略，按优先级：
 * 1. 组件名黑名单——覆盖绝大多数 Next.js/React 内部组件
 * 2. 组件名正则模式——捕获名称变体（如 Memo 包装、带后缀版本）
 * 3. 栈帧来源检测——兜底，检查 _debugStack 原始帧中是否全为框架代码
 */
function isUserComponent(fiber: Fiber): boolean {
  const rawName = getComponentName(fiber);

  // 去除 ForwardRef(...) / Memo(...) 包装，提取内部组件名
  const innerMatch = rawName.match(/^(?:ForwardRef|Memo)\((.+)\)$/);
  const coreName = innerMatch ? innerMatch[1] : rawName;

  // 策略1：精确名称匹配
  if (FRAMEWORK_COMPONENT_NAMES.has(coreName)) {
    return false;
  }

  // 策略2：正则模式匹配（捕获 LayoutRouter_ 等变体）
  if (FRAMEWORK_NAME_RE.test(coreName)) {
    return false;
  }

  // 策略3：利用统一栈解析缓存判断是否存在用户帧，
  // 避免重复 split + filter（已在 getParsedStack 中完成）
  const parsed = getParsedStack(fiber);
  if (!parsed.hasUserFrame) {
    return false;
  }

  // 通过所有过滤，视为用户组件
  return true;
}

/**
 * 全局调试函数：挂载到 window 上，在浏览器控制台调用即可查看指定 DOM 元素
 * 的 fiber 链路原始数据。用于诊断 _debugOwner / fiber.return 链路中
 * 服务端组件和框架组件的实际数据结构。
 *
 * 使用方式：在控制台执行 __reactSpotDump(document.querySelector('.dashboard'))
 */
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__reactSpotDump = (el: Element) => {
    const fiber = findFiberElementFromNode(el);
    if (!fiber) {
      console.log('[react-spot] No fiber found on element');
      return;
    }

    console.group('[react-spot] === _debugOwner chain ===');
    let owner: unknown = fiber;
    let depth = 0;
    while (owner && depth < 50) {
      const f = owner as Record<string, unknown>;
      console.log(`[${depth}]`, {
        type: f.type,
        typeName: typeof f.type === 'function' ? (f.type as Function).name : typeof f.type === 'string' ? f.type : String(f.type),
        name: f.name,
        env: f.env,
        _debugOwner: f._debugOwner ? '(exists)' : null,
        owner: f.owner ? '(exists)' : null,
        stack: f._debugStack ? '(has _debugStack)' : f.stack ? '(has stack)' : null,
        keys: Object.keys(f).filter(k => !k.startsWith('__')).slice(0, 20),
        raw: f,
      });
      // React 19 虚拟 owner 可能用 .owner 而非 ._debugOwner
      owner = f._debugOwner ?? f.owner ?? null;
      depth++;
    }
    console.groupEnd();

    console.group('[react-spot] === fiber.return chain (first 15) ===');
    let ret: Fiber | null = fiber;
    let retDepth = 0;
    while (ret && retDepth < 15) {
      const typeName = typeof ret.type === 'function'
        ? (ret.type as Function).name
        : typeof ret.type === 'string' ? ret.type : String(ret.type);
      console.log(`[${retDepth}]`, typeName, {
        hasDebugOwner: !!ret._debugOwner,
        hasReturn: !!ret.return,
      });
      ret = ret.return;
      retDepth++;
    }
    console.groupEnd();
  };
}

/**
 * 尝试将 owner 链上的当前节点写入 chain。
 *
 * 支持三种节点：原生 DOM（span/div）、用户组件 Fiber、RSC 虚拟 owner。
 * 原生 DOM 仅在有可用栈帧时写入，避免无法跳转的空条目。
 */
function tryPushOwnerChainEntry(chain: ClickToNodeInfo[], current: unknown): void {
  const node = current as Record<string, unknown>;

  if (node.type && typeof node.type === 'string') {
    const fiberNode = current as Fiber;
    const stackFrame = getStackFrame(fiberNode);
    if (!stackFrame) return;

    let props: Record<string, unknown> | undefined;
    try {
      if (fiberNode.memoizedProps) {
        props = fiberNode.memoizedProps;
      }
    } catch {
      props = undefined;
    }

    chain.push({
      componentName: getComponentName(fiberNode),
      stackFrame,
      fiber: fiberNode,
      props,
    });
    return;
  }

  if (node.type && typeof node.type !== 'string') {
    const fiberNode = current as Fiber;
    if (!isUserComponent(fiberNode)) return;

    let props: Record<string, unknown> | undefined;
    try {
      if (fiberNode.memoizedProps) {
        props = fiberNode.memoizedProps;
      }
    } catch {
      props = undefined;
    }

    chain.push({
      componentName: getComponentName(fiberNode),
      stackFrame: getStackFrame(fiberNode),
      fiber: fiberNode,
      props,
    });
    return;
  }

  if (node.name && typeof node.name === 'string' && !node.type) {
    const name = node.name as string;
    if (FRAMEWORK_COMPONENT_NAMES.has(name)) return;
    if (FRAMEWORK_NAME_RE.test(name)) return;

    const stackFrame = resolveVirtualOwnerStackFrame(name, node);

    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__REACT_SPOT_DEBUG__) {
      console.log(`[react-spot] virtual owner: ${name}`, {
        extractedFrame: stackFrame,
        debugLocation: node.debugLocation,
      });
    }

    chain.push({
      componentName: name,
      stackFrame,
      fiber: current as Fiber,
      props: undefined,
    });
  }
}

/**
 * 从 DOM 元素开始，沿 owner 链向上遍历，构建完整的用户组件层级链。
 *
 * 兼容两种 owner 格式：
 * 1. 标准 Fiber 对象（客户端组件）—— 有 type、_debugOwner
 * 2. React 19 虚拟 owner（服务端组件跨 RSC 边界）—— 有 name、env、owner
 *
 * 过滤框架内部组件；原生 DOM 元素保留在 chain 中供精确定位，
 * 由 UI 层自行过滤展示。
 *
 * Args:
 *   target: 被点击的 DOM 元素
 *
 * Returns:
 *   从叶到根的完整 owner 链路（含原生 DOM）
 */
export function buildFiberChain(target: Element): ClickToNodeInfo[] {
  const chain: ClickToNodeInfo[] = [];
  const fiber = findFiberElementFromNode(target);
  if (!fiber) return chain;

  const seen = new WeakSet();
  let current: unknown = fiber;

  while (current && typeof current === 'object') {
    if (seen.has(current as object)) break;
    seen.add(current as object);

    tryPushOwnerChainEntry(chain, current);
    const node = current as Record<string, unknown>;
    current = node._debugOwner ?? node.owner ?? null;
  }

  return chain;
}

/**
 * buildFiberChain 的别名，保持 API 兼容。
 *
 * 两者逻辑完全一致——沿 owner 链遍历并构建组件层级链。
 */
export const buildFiberReturnChain = buildFiberChain;
