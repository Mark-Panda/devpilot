/**
 * DSL 适配层错误类型
 */

export class DslAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DslAdapterError';
  }
}

export class NodeTypeNotFoundError extends DslAdapterError {
  constructor(public nodeType: string) {
    super(`Unsupported node type: ${nodeType}`);
    this.name = 'NodeTypeNotFoundError';
  }
}

export class InvalidDslFormatError extends DslAdapterError {
  constructor(message: string) {
    super(`Invalid DSL format: ${message}`);
    this.name = 'InvalidDslFormatError';
  }
}

export class ConnectionError extends DslAdapterError {
  constructor(
    public fromId: string,
    public toId: string,
    message: string
  ) {
    super(`Connection error (${fromId} → ${toId}): ${message}`);
    this.name = 'ConnectionError';
  }
}
