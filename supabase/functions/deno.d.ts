// deno-lint-ignore-file no-explicit-any
// Stubs so typescript-language-server stays quiet on Deno-specific code.
// See tsconfig.json in this directory for full context.
// Can be removed if Zed ever supports path-scoped language server activation.

declare module "constants" {
  const _: any;
  export = _;
}

declare module "googleapis" {
  export const google: any;
  export namespace calendar_v3 {
    export type Schema$Event = any;
    export type Params$Resource$Events$Insert = any;
    export type Params$Resource$Events$Update = any;
    export type Params$Resource$Events$Delete = any;
    export type Params$Resource$Events$List = any;
    export class Calendar {
      [key: string]: any;
    }
  }
}

declare module "google-auth-library" {
  export class JWT {
    constructor(options?: any);
    [key: string]: any;
  }
  export class OAuth2Client {
    [key: string]: any;
  }
}

declare module "node-ts/lib/node-ts.js" {
  export class TeamSpeakClient {
    constructor(...args: any[]);
    [key: string]: any;
  }
}

// Catch-all for any other unresolvable npm: specifiers
declare module "*" {
  const _: any;
  export = _;
}

declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
  function serve(
    options: ServeOptions,
    handler: (req: Request) => Response | Promise<Response>,
  ): void;

  const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    has(key: string): boolean;
    toObject(): Record<string, string>;
  };

  function readTextFile(path: string): Promise<string>;
  function writeTextFile(path: string, data: string): Promise<void>;
  function readFile(path: string): Promise<Uint8Array>;

  const args: string[];
  const pid: number;
  const version: { deno: string; v8: string; typescript: string };

  interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
    onError?: (error: unknown) => Response | Promise<Response>;
    onListen?: (params: { hostname: string; port: number }) => void;
  }
}
