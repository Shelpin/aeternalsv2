/**
 * Custom TypeScript declarations for Node.js or browser environments
 */

// This allows us to use browser-like functions in Node.js
// Since our code needs to run in both environments
declare global {
  // Provide fetch API if not available
  function fetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response>;

  // Add timer functions if not available
  function setTimeout(
    callback: (...args: any[]) => void,
    ms: number,
    ...args: any[]
  ): number;

  function clearTimeout(timeoutId: number): void;

  function setInterval(
    callback: (...args: any[]) => void,
    ms: number,
    ...args: any[]
  ): number;

  function clearInterval(intervalId: number): void;

  // Add Response and RequestInit types if not available
  interface Response {
    ok: boolean;
    status: number;
    statusText: string;
    json(): Promise<any>;
    text(): Promise<string>;
  }

  interface RequestInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    mode?: string;
    credentials?: string;
    cache?: string;
    redirect?: string;
    referrer?: string;
    referrerPolicy?: string;
    integrity?: string;
    keepalive?: boolean;
    signal?: AbortSignal;
  }

  type RequestInfo = string | URL | Request;

  interface Request {
    url: string;
    method: string;
    headers: Record<string, string>;
  }

  class URL {
    constructor(url: string, base?: string | URL);
    href: string;
    origin: string;
    protocol: string;
    host: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    hash: string;
  }

  interface AbortSignal {
    aborted: boolean;
    reason: any;
    onabort: ((this: AbortSignal, event: Event) => any) | null;
    throwIfAborted(): void;
  }
}

export {}; 