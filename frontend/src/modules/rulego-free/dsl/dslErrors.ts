/**
 * DSL 加载/构建时的可分类错误（T7.3）
 */

export class NodeTypeNotFoundError extends Error {
  readonly code = 'NODE_TYPE_NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'NodeTypeNotFoundError';
  }
}

export class InvalidDslFormatError extends Error {
  readonly code = 'INVALID_DSL_FORMAT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDslFormatError';
  }
}

export class ConnectionError extends Error {
  readonly code = 'CONNECTION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

export function formatDslError(error: unknown): string {
  if (error instanceof InvalidDslFormatError) return error.message;
  if (error instanceof NodeTypeNotFoundError) return error.message;
  if (error instanceof ConnectionError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
