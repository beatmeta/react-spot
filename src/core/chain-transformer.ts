import type { ResolvedSourceInfo } from './source-location-resolver';
import type { ClickToNodeInfo, Fiber } from './types';

/**
 * 经过变换的组件链路条目，用于在弹出菜单中展示。
 *
 * 由 ChainTransformer 从原始 fiber 链路生成，
 * 支持重命名、折叠、覆盖导航目标等变换操作。
 */
export interface TransformedEntry {
  /** 在链路弹出菜单中显示的标签（替代原始组件名） */
  label: string;
  /**
   * 原始链路条目，用于：
   * - 当 resolveLocation 未提供时回退到默认源码解析
   * - 当 props 未提供时回退到 fiber props
   */
  sourceEntry: ClickToNodeInfo;
  /**
   * 覆盖源码位置解析。用户点击弹出菜单条目时延迟调用。
   * 返回 null 表示解析失败，UI 会回退到 sourceEntry 的默认解析。
   */
  resolveLocation?: () => Promise<{
    source: string;
    line: number;
    column: number;
  } | null>;
  /** 覆盖 props 检查器的数据，默认取 sourceEntry.props */
  props?: Record<string, unknown>;
}

/**
 * 链路变换器的上下文，提供源码解析和 fiber 内省工具。
 *
 * 由库注入，使变换器无需直接导入内部模块。
 */
export interface ChainTransformContext {
  resolveLocation: (
    stackFrame: string,
    debug?: boolean
  ) => Promise<ResolvedSourceInfo | null>;
  getComponentName: (fiber: Fiber) => string;
  getStackFrame: (fiber: Fiber) => string | undefined;
  /** 获取 fiber 的所有候选栈帧，用于首选帧解析失败时回退 */
  getAllMeaningfulFrames: (fiber: Fiber) => string[];
  debug?: boolean;
}

/**
 * 链路变换器函数签名。
 *
 * 接收原始 fiber 链路（DOM 最近元素在前），返回变换后的条目数组。
 * 必须同步执行——异步工作应延迟到 TransformedEntry.resolveLocation 闭包中。
 */
export type ChainTransformer = (
  chain: ClickToNodeInfo[],
  context: ChainTransformContext
) => TransformedEntry[];

/**
 * 默认变换：直接将 fiber 链路映射为展示条目，不做任何折叠或重命名。
 */
function defaultTransform(chain: ClickToNodeInfo[]): TransformedEntry[] {
  return chain.map((entry) => ({
    label: entry.componentName,
    sourceEntry: entry,
    props: entry.props,
  }));
}

/**
 * 应用链路变换器。
 *
 * 若未配置变换器则使用默认变换（直接映射组件名）。
 *
 * Args:
 *   chain: 原始 fiber 链路
 *   transformer: 可选的自定义变换器
 *   context: 变换上下文
 *
 * Returns:
 *   变换后的展示条目数组
 */
export function applyTransformer(
  chain: ClickToNodeInfo[],
  transformer: ChainTransformer | undefined,
  context: ChainTransformContext
): TransformedEntry[] {
  if (!transformer) return defaultTransform(chain);
  return transformer(chain, context);
}
