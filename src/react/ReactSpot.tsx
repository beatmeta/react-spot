import JsonView from '@uiw/react-json-view';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChainTransformContext,
  ChainTransformer,
  TransformedEntry,
} from '../core/chain-transformer';
import { applyTransformer } from '../core/chain-transformer';
import { buildFiberChain, buildFiberReturnChain, getAllMeaningfulFrames, getComponentName, getStackFrame, isHostFiberEntry } from '../core/fiber-utils';
import { configureSourceRoot, resolveLocation } from '../core/source-location-resolver';
import type { ClickToNodeInfo, ComponentHandle, NavigationEvent } from '../core/types';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';

/* ── Inline SVG icons (replaces lucide-react to avoid 43 MB dependency) ── */

function BracesIcon({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" />
      <path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}

function ExternalLinkIcon({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

export type {
  ChainTransformContext,
  ChainTransformer,
  TransformedEntry,
  ClickToNodeInfo,
  ComponentHandle,
  NavigationEvent,
};

export interface ReactSpotProps {
  /**
   * Called when the user triggers a navigation (Alt+Click or selecting a
   * component from the chain popover).  When provided the default
   * `window.open("cursor://…")` call is skipped; the consumer decides
   * what to do with the resolved location.
   */
  onNavigate?: (event: NavigationEvent) => void;

  /**
   * Absolute filesystem path to the project root.  Used to convert
   * URL-relative paths (like `/src/components/Foo.tsx`) into absolute
   * paths the editor can open (like `/Users/me/project/src/components/Foo.tsx`).
   *
   * Can also be set globally via `window.__SHOW_COMPONENT_SOURCE_ROOT__`.
   */
  sourceRoot?: string;

  /**
   * URL scheme used for editor navigation (the part before `://`).
   *
   * Common values: `"cursor"`, `"vscode"`, `"vscode-insiders"`, `"windsurf"`.
   *
   * @default "cursor"
   *
   * @example
   * // Open files in VS Code instead of Cursor
   * <ReactSpot editorScheme="vscode" />
   */
  editorScheme?: string;

  /**
   * Customise which component is navigated to on Alt + Right-Click.
   *
   * Receives the full component chain (closest-to-DOM-first) as an array
   * of {@link ComponentHandle} objects.  Each handle exposes the component
   * name and props immediately, plus a lazy `resolveSource()` that only
   * performs source-map resolution when called.
   *
   * Return a chain index to navigate to, or `null` / `undefined` to use
   * the default behaviour (index 0 — the closest component).
   *
   * May return synchronously (when only names/props are needed) or
   * asynchronously (when source resolution is required).
   */
  getClickTarget?: (
    chain: ComponentHandle[]
  ) => number | null | undefined | Promise<number | null | undefined>;

  /**
   * When `true`, logs a detailed debug trace for every source-map
   * resolution step, the resolved result, and the final editor URL to
   * the browser console.
   *
   * Useful for diagnosing why a click isn't opening the right file.
   *
   * @default false
   */
  debug?: boolean;

  /**
   * Transform the component chain before it is displayed in the popover.
   *
   * A {@link ChainTransformer} receives the raw fiber chain and returns a
   * new chain of {@link TransformedEntry} objects.  This allows collapsing
   * entries (e.g. `span → FormattedMessage` → `"message text"`), relabelling
   * components, and overriding navigation targets.
   *
   * @example
   * ```tsx
   * import { createFormattedMessageTransformer } from 'react-spot';
   *
   * <ReactSpot
   *   chainTransformer={createFormattedMessageTransformer()}
   * />
   * ```
   */
  chainTransformer?: ChainTransformer;
}

/**
 * Opens a file in the editor via a custom protocol (e.g. cursor://file/{path}:{L}:{C}).
 * When `onNavigate` is provided, the callback receives the resolved location
 * instead of triggering the protocol handler.
 */
function openInEditor(
  source: string,
  line: number,
  column: number,
  onNavigate?: ReactSpotProps['onNavigate'],
  componentName?: string,
  editorScheme = 'cursor',
  debug?: boolean
): void {
  let cleanPath = source.replace(/^file:\/\//, '');
  cleanPath = decodeURIComponent(cleanPath);
  // Ensure the path starts with / so the protocol URL is well-formed
  // (e.g. cursor://file/… not cursor://filesrc/…)
  if (!cleanPath.startsWith('/')) {
    cleanPath = `/${cleanPath}`;
  }
  // Encode each path segment so special characters (parentheses, brackets,
  // spaces, #, etc.) produce a well-formed protocol URL while preserving
  // the '/' separators.
  const encodedPath = cleanPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const url = `${editorScheme}://file${encodedPath}:${line}:${column + 1}`;

  if (debug) {
    console.log('[show-component] openInEditor:', {
      source: cleanPath,
      line,
      column,
      componentName,
      url,
      mode: onNavigate ? 'onNavigate callback' : 'location.href',
    });
  }

  if (onNavigate) {
    onNavigate({ source: cleanPath, line, column, url, componentName });
  } else {
    // location.href (not window.open) is needed for custom protocol URLs —
    // some browsers won't trigger the OS handler otherwise.
    window.location.href = url;
  }
}

/**
 * 解析组件源码位置并跳转到编辑器。
 *
 * 首先尝试首选栈帧；若解析失败（如 source map 错误地映射到 React 运行时），
 * 则从 fiber 提取所有候选帧逐个尝试，直到找到有效的用户源码位置。
 * 此回退机制解决 monorepo workspace 包在 Turbopack 编译后 source map 链路断裂的问题。
 */
async function resolveAndNavigate(
  component: ClickToNodeInfo,
  onNavigate?: ReactSpotProps['onNavigate'],
  editorScheme?: string,
  debug?: boolean
): Promise<boolean> {
  if (!component.stackFrame) return false;

  try {
    const resolved = await resolveLocation(component.stackFrame, debug);
    if (resolved) {
      openInEditor(
        resolved.source,
        resolved.line,
        resolved.column,
        onNavigate,
        component.componentName,
        editorScheme,
        debug
      );
      return true;
    }

    // 首选帧解析失败，尝试 fiber 的所有候选帧
    const fallbackFrames = getAllMeaningfulFrames(component.fiber);
    for (const frame of fallbackFrames) {
      if (frame === component.stackFrame) continue;
      const fallbackResolved = await resolveLocation(frame, debug);
      if (fallbackResolved) {
        if (debug) {
          console.log('[react-spot] Resolved via fallback frame:', frame);
        }
        openInEditor(
          fallbackResolved.source,
          fallbackResolved.line,
          fallbackResolved.column,
          onNavigate,
          component.componentName,
          editorScheme,
          debug
        );
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * 沿 owner chain 逐个尝试解析源码位置并跳转。
 *
 * 解决第三方库组件（如 next/image）的场景：当用户点击由库组件渲染的 DOM 元素时，
 * 该 DOM 的栈帧指向库内部实现（不存在或不可达），此时应沿 chain 向上
 * 找到最近的用户代码位置（即使用该库组件的 JSX 所在行）。
 */
async function resolveAndNavigateWithChainFallback(
  chain: ClickToNodeInfo[],
  onNavigate?: ReactSpotProps['onNavigate'],
  editorScheme?: string,
  debug?: boolean
): Promise<boolean> {
  for (const entry of chain) {
    if (!entry.stackFrame) continue;
    const success = await resolveAndNavigate(entry, onNavigate, editorScheme, debug);
    if (success) return true;
  }
  return false;
}

export function ReactSpot({
  onNavigate,
  sourceRoot,
  editorScheme,
  getClickTarget,
  debug,
  chainTransformer,
}: ReactSpotProps = {}) {
  // Keep stable refs so event handlers registered once (in useEffect [])
  // always see the latest callbacks without re-registering listeners.
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const editorSchemeRef = useRef(editorScheme);
  editorSchemeRef.current = editorScheme;

  const getClickTargetRef = useRef(getClickTarget);
  getClickTargetRef.current = getClickTarget;

  const debugRef = useRef(debug);
  debugRef.current = debug;

  const chainTransformerRef = useRef(chainTransformer);
  chainTransformerRef.current = chainTransformer;

  useEffect(() => {
    configureSourceRoot(sourceRoot);
  }, [sourceRoot]);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [displayChain, setDisplayChain] = useState<TransformedEntry[]>([]);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  interface PropsPopup {
    id: string;
    entry: TransformedEntry;
    position: { x: number; y: number };
    size: { width: number; height: number };
  }

  const [propsPopups, setPropsPopups] = useState<PropsPopup[]>([]);
  const [draggingPopup, setDraggingPopup] = useState<{
    id: string;
    offset: { x: number; y: number };
  } | null>(null);
  const [resizingPopup, setResizingPopup] = useState<{
    id: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startPosX: number;
    startPosY: number;
    direction: string;
  } | null>(null);

  // 检查模式：按住 Option 键时高亮悬停元素并显示组件链路面包屑
  const [inspectMode, setInspectMode] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{
    rect: DOMRect;
    breadcrumb: { name: string; isComponent: boolean }[];
    parentRects: DOMRect[];
  } | null>(null);

  const buildTransformContext = useCallback(
    (): ChainTransformContext => ({
      resolveLocation: (sf, dbg) => resolveLocation(sf, dbg ?? debugRef.current),
      getComponentName,
      getStackFrame,
      getAllMeaningfulFrames,
    }),
    []
  );

  const navigateFromEntry = useCallback(async (entry: TransformedEntry): Promise<boolean> => {
    if (entry.resolveLocation) {
      const loc = await entry.resolveLocation();
      if (loc) {
        openInEditor(
          loc.source,
          loc.line,
          loc.column,
          onNavigateRef.current,
          entry.label,
          editorSchemeRef.current,
          debugRef.current
        );
        return true;
      }
      return false;
    }
    return resolveAndNavigate(
      entry.sourceEntry,
      onNavigateRef.current,
      editorSchemeRef.current,
      debugRef.current
    );
  }, []);

  const handleComponentClick = async (index: number) => {
    setIsPopoverOpen(false);
    await navigateFromEntry(displayChain[index]);
  };

  const handleNavigateFromPopup = async (entry: TransformedEntry) => {
    await navigateFromEntry(entry);
  };

  const handlePropsClick = (entry: TransformedEntry) => {
    const popupId = `props-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const popupWidth = 400;
    const popupHeight = 300;
    const cascadeOffset = 40;

    let baseX = 200 + propsPopups.length * cascadeOffset;
    let baseY = 200 + propsPopups.length * cascadeOffset;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Wrap to next column when cascading would go off-screen
    if (baseX + popupWidth > viewportWidth - 20) {
      const column = Math.floor(propsPopups.length / 5);
      const row = propsPopups.length % 5;
      baseX = 50 + column * 200;
      baseY = 100 + row * cascadeOffset;
    }
    if (baseY + popupHeight > viewportHeight - 20) {
      baseY = 100;
    }

    const newPopup: PropsPopup = {
      id: popupId,
      entry,
      position: { x: baseX, y: baseY },
      size: { width: popupWidth, height: popupHeight },
    };

    setPropsPopups((prev) => [...prev, newPopup]);
    setIsPopoverOpen(false);
  };

  // Handle dragging of props popups
  const handleMouseDown = (popupId: string) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('drag-handle')) {
      const popup = propsPopups.find((p) => p.id === popupId);
      if (popup) {
        setDraggingPopup({
          id: popupId,
          offset: {
            x: e.clientX - popup.position.x,
            y: e.clientY - popup.position.y,
          },
        });
        e.preventDefault();
      }
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingPopup) {
        setPropsPopups((prev) =>
          prev.map((popup) =>
            popup.id === draggingPopup.id
              ? {
                  ...popup,
                  position: {
                    x: e.clientX - draggingPopup.offset.x,
                    y: e.clientY - draggingPopup.offset.y,
                  },
                }
              : popup
          )
        );
      }
      if (resizingPopup) {
        const MIN_W = 200;
        const MIN_H = 120;
        const dx = e.clientX - resizingPopup.startX;
        const dy = e.clientY - resizingPopup.startY;
        const dir = resizingPopup.direction;
        let newW = resizingPopup.startW;
        let newH = resizingPopup.startH;
        let newX = resizingPopup.startPosX;
        let newY = resizingPopup.startPosY;

        if (dir.includes('e')) newW = Math.max(MIN_W, resizingPopup.startW + dx);
        if (dir.includes('s')) newH = Math.max(MIN_H, resizingPopup.startH + dy);
        if (dir.includes('w')) {
          const proposed = resizingPopup.startW - dx;
          if (proposed >= MIN_W) {
            newW = proposed;
            newX = resizingPopup.startPosX + dx;
          } else {
            newW = MIN_W;
            newX = resizingPopup.startPosX + (resizingPopup.startW - MIN_W);
          }
        }
        if (dir.includes('n')) {
          const proposed = resizingPopup.startH - dy;
          if (proposed >= MIN_H) {
            newH = proposed;
            newY = resizingPopup.startPosY + dy;
          } else {
            newH = MIN_H;
            newY = resizingPopup.startPosY + (resizingPopup.startH - MIN_H);
          }
        }

        setPropsPopups((prev) =>
          prev.map((popup) =>
            popup.id === resizingPopup.id
              ? { ...popup, position: { x: newX, y: newY }, size: { width: newW, height: newH } }
              : popup
          )
        );
      }
    },
    [draggingPopup, resizingPopup]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingPopup(null);
    setResizingPopup(null);
  }, []);

  const closePopup = (popupId: string) => {
    setPropsPopups((prev) => prev.filter((p) => p.id !== popupId));
  };

  const startResize =
    (popupId: string, direction: string, popup: PropsPopup) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizingPopup({
        id: popupId,
        direction,
        startX: e.clientX,
        startY: e.clientY,
        startW: popup.size.width,
        startH: popup.size.height,
        startPosX: popup.position.x,
        startPosY: popup.position.y,
      });
    };

  // ── 检查模式：Option 键按下/释放 ───────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        e.preventDefault();
        setInspectMode(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setInspectMode(false);
        setHoverInfo(null);
      }
    };
    // 窗口失焦时退出检查模式，防止 Alt 键状态残留
    const onBlur = () => {
      setInspectMode(false);
      setHoverInfo(null);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // ── 检查模式：悬停追踪 + Option+左键直接跳转 ─────────────────────────────────
  useEffect(() => {
    if (!inspectMode) return;

    document.body.style.cursor = 'crosshair';
    document.body.style.userSelect = 'none';

    // 闭包变量：保存当前悬停元素的 fiber 链路，供左键点击时使用，
    // 避免 React state 的异步更新导致点击时读到过期数据
    let currentChain: ClickToNodeInfo[] = [];

    const onMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el || el.closest('[data-react-spot-overlay]')) return;

      const rect = el.getBoundingClientRect();
      currentChain = buildFiberChain(el);

      // 面包屑只展示用户组件，不显示 span/div 等原生 DOM
      const breadcrumb = currentChain
        .filter((c) => c.componentName !== 'Component (No Type)')
        .filter((c) => !isHostFiberEntry(c))
        .map((c) => ({
          name: c.componentName,
          isComponent: true,
        }))
        .reverse();

      // 收集父级 DOM 元素的定位矩形用于多层高亮
      const parentRects: DOMRect[] = [];
      let parent = el.parentElement;
      while (parent && parentRects.length < 4) {
        if (parent !== document.body && parent !== document.documentElement) {
          const pr = parent.getBoundingClientRect();
          if (pr.width > rect.width + 4 || pr.height > rect.height + 4) {
            parentRects.push(pr);
          }
        }
        parent = parent.parentElement;
      }

      setHoverInfo({ rect, breadcrumb, parentRects });
    };

    // Option + 左键 → 跳转到最近的用户组件源码
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || !e.altKey) return;

      e.preventDefault();
      e.stopPropagation();
      setInspectMode(false);
      setHoverInfo(null);

      if (currentChain.length === 0) return;

      // 优先用叶节点栈帧（含原生 DOM），实现 JSX 标签级定位
      const target = currentChain.find((c) => c.stackFrame) ?? currentChain[0];

      if (getClickTargetRef.current) {
        const dbg = debugRef.current;
        const handles: ComponentHandle[] = currentChain.map((c, i) => ({
          componentName: c.componentName,
          props: c.props,
          index: i,
          resolveSource: async () => {
            if (!c.stackFrame) return null;
            const r = await resolveLocation(c.stackFrame, dbg);
            if (r) return { source: r.source, line: r.line, column: r.column };
            // 首选帧失败，尝试 fiber 的其他候选帧
            const fallbacks = getAllMeaningfulFrames(c.fiber);
            for (const frame of fallbacks) {
              if (frame === c.stackFrame) continue;
              const fr = await resolveLocation(frame, dbg);
              if (fr) return { source: fr.source, line: fr.line, column: fr.column };
            }
            return null;
          },
        }));
        Promise.resolve(getClickTargetRef.current(handles)).then((targetIndex) => {
          const idx = targetIndex ?? 0;
          if (idx >= 0 && idx < currentChain.length) {
            // 从选中位置开始沿 chain 向上回退，处理库组件源码不可达的情况
            resolveAndNavigateWithChainFallback(
              currentChain.slice(idx),
              onNavigateRef.current,
              editorSchemeRef.current,
              debugRef.current
            );
          }
        });
      } else if (chainTransformerRef.current) {
        const ctx = buildTransformContext();
        const transformed = applyTransformer(currentChain, chainTransformerRef.current, ctx);
        if (transformed.length > 0) navigateFromEntry(transformed[0]);
      } else {
        // 尝试解析首选目标；若失败（如第三方库组件源码不存在），
        // 沿 owner chain 向上逐个尝试，直到找到可导航的用户代码位置
        resolveAndNavigateWithChainFallback(
          currentChain,
          onNavigateRef.current,
          editorSchemeRef.current,
          debugRef.current
        );
      }
    };

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [inspectMode, buildTransformContext, navigateFromEntry]);

  // ── Option + 右键 → 弹出组件链路菜单 ─────────────────────────────────────
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      if (!event.altKey) return;

      event.preventDefault();
      event.stopPropagation();

      // 关闭检查模式高亮，让弹出菜单获得焦点
      setInspectMode(false);
      setHoverInfo(null);

      // 右键菜单只展示组件层级，原生 DOM 保留在完整 chain 中供跳转
      const fullChain = buildFiberReturnChain(event.target as HTMLElement).filter(
        (c) => !isHostFiberEntry(c)
      );
      if (fullChain.length === 0) return;

      const ctx = buildTransformContext();
      const transformed = applyTransformer(fullChain, chainTransformerRef.current, ctx);
      setDisplayChain(transformed);
      setPopoverPosition({ x: event.clientX, y: event.clientY });
      setIsPopoverOpen(true);
    };

    // 阻止 Alt+右键时浏览器默认的 mousedown 行为（如文本选中）
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 2 && event.altKey) {
        event.preventDefault();
      }
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [buildTransformContext]);

  useEffect(() => {
    const active = draggingPopup || resizingPopup;
    if (active) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      const resizeCursors: Record<string, string> = {
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        nw: 'nwse-resize',
        se: 'nwse-resize',
      };
      document.body.style.cursor = resizingPopup
        ? resizeCursors[resizingPopup.direction] || 'nwse-resize'
        : 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [draggingPopup, resizingPopup, handleMouseMove, handleMouseUp]);

  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS string, no user input */}
      <style dangerouslySetInnerHTML={{ __html: SC_STYLES }} />

      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <div
            style={{
              position: 'fixed',
              left: popoverPosition.x,
              top: popoverPosition.y,
              width: 1,
              height: 1,
              pointerEvents: 'none',
              zIndex: 2147483647,
            }}
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          style={{
            width: '20rem',
            padding: 0,
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,.15), 0 4px 10px -4px rgba(0,0,0,.08)',
            color: '#1f2937',
            zIndex: 2147483647,
          }}
        >
          <div style={{ padding: '8px 6px' }}>
            {/* 反转：根组件在上、被点击元素在下，缩进体现层级深度 */}
            {[...displayChain].reverse().map((entry, visualIndex) => {
              const realIndex = displayChain.length - 1 - visualIndex;
              const entryProps = entry.props ?? entry.sourceEntry.props;
              const hasProps = entryProps && Object.keys(entryProps).some((k) => k !== 'children');
              const isLeaf = visualIndex === displayChain.length - 1;

              return (
                <div key={`${entry.label}-${realIndex}`} className="sc-chain-row">
                  <button
                    type="button"
                    className={`sc-chain-item ${isLeaf ? 'sc-chain-item-active' : ''}`}
                    style={{ paddingLeft: `${8 + visualIndex * 12}px` }}
                    onClick={() => handleComponentClick(realIndex)}
                  >
                    <span className="sc-chain-indent" aria-hidden="true">
                      {visualIndex > 0 ? '└ ' : ''}
                    </span>
                    {entry.label}
                  </button>
                  {hasProps && (
                    <button
                      type="button"
                      className="sc-icon-btn"
                      onClick={() => handlePropsClick(entry)}
                      title="Inspect props"
                    >
                      <BracesIcon size={14} strokeWidth={2} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {propsPopups.map((popup) => (
        <div
          key={popup.id}
          style={{
            position: 'fixed',
            left: popup.position.x,
            top: popup.position.y,
            width: popup.size.width,
            height: popup.size.height,
            zIndex: 2147483647,
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,.15), 0 4px 10px -4px rgba(0,0,0,.08)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            color: '#1f2937',
          }}
          onMouseDown={handleMouseDown(popup.id)}
        >
          <div
            className="drag-handle"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              background: '#f3f4f6',
              borderBottom: '1px solid #e5e7eb',
              cursor: 'move',
              userSelect: 'none',
              flexShrink: 0,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 13 }}>{popup.entry.label}</span>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <button
                type="button"
                className="sc-icon-btn"
                onClick={() => handleNavigateFromPopup(popup.entry)}
                title="Go to source"
              >
                <ExternalLinkIcon size={13} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="sc-icon-btn"
                onClick={() => closePopup(popup.id)}
                title="Close"
              >
                <svg
                  aria-hidden="true"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 10,
              overscrollBehavior: 'contain',
            }}
            onWheel={(e) => {
              const el = e.currentTarget;
              const { scrollTop, scrollHeight, clientHeight } = el;
              if (
                (e.deltaY > 0 && scrollTop + clientHeight >= scrollHeight) ||
                (e.deltaY < 0 && scrollTop <= 0)
              ) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            {(() => {
              const popupProps = popup.entry.props ?? popup.entry.sourceEntry.props;
              return popupProps ? (
                <JsonView
                  value={popupProps}
                  style={{
                    fontSize: '12px',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  }}
                  collapsed={1}
                  displayDataTypes={false}
                  displayObjectSize={false}
                  shortenTextAfterLength={Math.max(20, Math.floor((popup.size.width - 60) / 7.2))}
                />
              ) : (
                <div style={{ color: '#9ca3af', fontSize: 13 }}>No props available</div>
              );
            })()}
          </div>

          {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const).map((dir) => (
            <div
              key={dir}
              className={`sc-resize-edge sc-resize-${dir}`}
              onMouseDown={startResize(popup.id, dir, popup)}
            />
          ))}
        </div>
      ))}

      {/* 检查模式覆盖层：高亮悬停元素 + 父级边框 + 组件链路面包屑 */}
      {inspectMode && !isPopoverOpen && hoverInfo && (
        <div data-react-spot-overlay="" className="sc-inspect-overlay">
          {hoverInfo.parentRects.map((pr, i) => (
            <div
              key={`p${i}`}
              className="sc-highlight-parent"
              style={{
                left: pr.left,
                top: pr.top,
                width: pr.width,
                height: pr.height,
                opacity: 0.6 - i * 0.12,
              }}
            />
          ))}

          <div
            className="sc-highlight"
            style={{
              left: hoverInfo.rect.left,
              top: hoverInfo.rect.top,
              width: hoverInfo.rect.width,
              height: hoverInfo.rect.height,
            }}
          />

          <div
            className="sc-breadcrumb"
            style={{
              left: Math.max(4, hoverInfo.rect.left),
              top: hoverInfo.rect.top > 28 ? hoverInfo.rect.top - 24 : hoverInfo.rect.bottom + 4,
            }}
          >
            {hoverInfo.breadcrumb.slice(-5).map((item, i) => (
              <span key={`b${i}`}>
                {i > 0 && (
                  <svg className="sc-breadcrumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                )}
                <span className={item.isComponent ? 'sc-breadcrumb-cmp' : 'sc-breadcrumb-el'}>
                  {item.name}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Scoped CSS injected via <style> — keeps the component self-contained
// without requiring Tailwind CSS variables in the consumer's app.
const SC_STYLES = `
.sc-chain-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
.sc-chain-item {
  flex: 1;
  display: block;
  padding: 5px 8px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 500;
  color: #1f2937;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s;
  line-height: 1.4;
}
.sc-chain-item:hover {
  background-color: #f3f4f6;
}
.sc-chain-item-active {
  color: #2563eb;
  font-weight: 600;
}
.sc-chain-indent {
  color: #d1d5db;
  font-weight: 400;
}
.sc-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 5px;
  color: #6b7280;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.1s, color 0.1s;
}
.sc-icon-btn:hover {
  background-color: #e5e7eb;
  color: #1f2937;
}
/* Resize handles — invisible hit zones */
.sc-resize-edge { position: absolute; z-index: 1; }
.sc-resize-n  { top: 0; left: 8px; right: 8px; height: 5px; cursor: ns-resize; }
.sc-resize-s  { bottom: 0; left: 8px; right: 8px; height: 5px; cursor: ns-resize; }
.sc-resize-e  { top: 8px; right: 0; bottom: 8px; width: 5px; cursor: ew-resize; }
.sc-resize-w  { top: 8px; left: 0; bottom: 8px; width: 5px; cursor: ew-resize; }
.sc-resize-ne { top: 0; right: 0; width: 10px; height: 10px; cursor: nesw-resize; }
.sc-resize-nw { top: 0; left: 0; width: 10px; height: 10px; cursor: nwse-resize; }
.sc-resize-se { bottom: 0; right: 0; width: 14px; height: 14px; cursor: nwse-resize; }
.sc-resize-sw { bottom: 0; left: 0; width: 10px; height: 10px; cursor: nesw-resize; }
.sc-resize-se::after {
  content: '';
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 8px;
  height: 8px;
  background:
    linear-gradient(135deg, transparent 50%, #94a3b8 50%, #94a3b8 55%, transparent 55%,
      transparent 65%, #94a3b8 65%, #94a3b8 70%, transparent 70%,
      transparent 80%, #94a3b8 80%, #94a3b8 85%, transparent 85%);
  opacity: 0.4;
  transition: opacity 0.15s;
  pointer-events: none;
}
.sc-resize-se:hover::after {
  opacity: 0.8;
}
/* ── Inspect mode overlay ── */
.sc-inspect-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: none;
}
.sc-highlight {
  position: fixed;
  border: 1.5px dashed #60a5fa;
  background: rgba(96, 165, 250, 0.06);
  pointer-events: none;
  border-radius: 2px;
  transition: left 0.04s, top 0.04s, width 0.04s, height 0.04s;
}
.sc-highlight-parent {
  position: fixed;
  border: 1px dashed rgba(96, 165, 250, 0.45);
  pointer-events: none;
  border-radius: 2px;
  transition: left 0.04s, top 0.04s, width 0.04s, height 0.04s;
}
.sc-breadcrumb {
  position: fixed;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  max-width: 80vw;
  padding: 2px 8px;
  background: rgba(15, 23, 42, 0.88);
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
  pointer-events: none;
  backdrop-filter: blur(6px);
  z-index: 2147483647;
}
.sc-breadcrumb-sep {
  color:rgb(64, 113, 182);
  display: inline-block;
  vertical-align: middle;
  margin: 0 1px;
  flex-shrink: 0;
}
.sc-breadcrumb-cmp {
  color: #93c5fd;
  font-weight: 600;
}
.sc-breadcrumb-el {
  color: #94a3b8;
}
`;
