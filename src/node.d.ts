export interface EditorSource {
  fileName?: string;
  file?: string;
  url?: string;
  lineNumber?: number | string;
  line?: number | string;
  columnNumber?: number | string;
  column?: number | string;
}

export interface NormalizedEditorSource {
  fileName: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface EditorCommand {
  name: string;
  args?: string[];
}

export interface OpenInEditorOptions {
  editor?: string | EditorCommand;
  projectRoot?: string;
  force?: boolean;
  mustExist?: boolean;
  requireLocalhost?: boolean;
  allowedHosts?: Iterable<string>;
  createArgs?: (source: NormalizedEditorSource, commandName: string) => string[];
}

export declare function openInEditor(
  source: EditorSource,
  options?: OpenInEditorOptions
): Promise<NormalizedEditorSource>;

export declare function handleOpenInEditorRequest(
  request: Request,
  options?: OpenInEditorOptions
): Promise<Response>;

export declare function normalizeEditorSource(
  source: EditorSource,
  options?: OpenInEditorOptions
): NormalizedEditorSource;

export declare function cleanBundlerFileName(fileName: string): string;
export declare function resolveEditorCommand(options?: OpenInEditorOptions): Required<EditorCommand>;
export declare function createEditorArgs(
  commandName: string,
  source: NormalizedEditorSource,
  options?: OpenInEditorOptions
): string[];

export declare class OpenInEditorError extends Error {
  code?: string;
  status?: number;
  cause?: unknown;
}
