import type { ResolvedSourceInfo } from './source-location-resolver';

/**
 * React Fiber 节点的简化类型定义。
 *
 * 仅包含 react-spot 运行时需要访问的属性，
 * 不依赖 React 内部类型以降低耦合。
 */
export type Fiber = {
  type: string | ((...args: unknown[]) => unknown) | Record<string, unknown>;
  _debugOwner: Fiber | null;
  _debugStack: Error;
  /** fiber 树的父节点指针，沿此链可获得完整的组件层级（而非仅所有权链） */
  return: Fiber | null;
  memoizedProps?: Record<string, unknown>;
  child?: Fiber | null;
  sibling?: Fiber | null;
};

/**
 * 从 DOM 元素到其所属 React 组件的追踪信息。
 *
 * 由 buildFiberChain 生成，包含组件名、栈帧、fiber 引用和 props，
 * 是 react-spot 内部组件链路的核心数据结构。
 */
export type ClickToNodeInfo = {
  componentName: string;
  /** 原始栈帧行，如 "at LevelD (http://…:18:26)" */
  stackFrame: string | undefined;
  /** React fiber 节点引用 */
  fiber: Fiber;
  props: Record<string, unknown> | undefined;
};

/**
 * 判断链路条目是否对应原生 DOM 元素（span、div 等）。
 *
 * 此类条目保留在完整 chain 中供精确定位 JSX 标签，
 * 但不应出现在面包屑或右键菜单的组件层级视图中。
 */
export function isHostFiberEntry(entry: ClickToNodeInfo): boolean {
  return typeof entry.fiber.type === 'string';
}

/**
 * 组件链路中单个组件的轻量句柄。
 *
 * 暴露给外部消费者（如 getClickTarget 回调），
 * 提供组件名和 props 的即时访问，以及延迟的源码定位能力。
 */
export interface ComponentHandle {
  componentName: string;
  props: Record<string, unknown> | undefined;
  /** 在链路中的位置（0 = 最接近被点击 DOM 的组件） */
  index: number;
  /**
   * 延迟解析原始源码位置。
   * 仅在调用时才触发 source-map 解析，结果会被缓存。
   */
  resolveSource: () => Promise<{
    source: string;
    line: number;
    column: number;
  } | null>;
}

/**
 * 导航事件，在跳转到编辑器时触发。
 *
 * 当配置了 onNavigate 回调时，此事件替代默认的 protocol URL 跳转。
 */
export interface NavigationEvent {
  source: string;
  line: number;
  column: number;
  /** 编辑器协议 URL，如 cursor://file/… */
  url: string;
  componentName?: string;
}
