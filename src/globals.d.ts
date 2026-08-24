interface TurboWarpExtension {
  getInfo(): Record<string, unknown>;
}

interface TurboWarpThread {
  [key: string]: unknown;
}

interface TurboWarpBlockUtility {
  thread?: TurboWarpThread;
  startHats(opcode: string, fields?: Record<string, string>, target?: unknown): TurboWarpThread[];
}

interface ScratchTranslate {
  (text: string): string;
  (message: {default: string; description?: string}, placeholders?: Record<string, string | number>): string;
}

interface ScratchApi {
  extensions: {
    unsandboxed: boolean;
    register(extension: TurboWarpExtension): void;
  };
  BlockType: Record<'COMMAND' | 'REPORTER' | 'BOOLEAN' | 'HAT' | 'EVENT', string>;
  ArgumentType: Record<'STRING' | 'NUMBER' | 'BOOLEAN', string>;
  Cast: {
    toString(value: unknown): string;
    toNumber(value: unknown): number;
    toBoolean(value: unknown): boolean;
  };
  translate: ScratchTranslate;
  vm?: {
    runtime?: {
      startHats(opcode: string, fields?: Record<string, string>, target?: unknown): TurboWarpThread[];
    };
  };
}

declare const Scratch: ScratchApi;
