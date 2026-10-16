// A minimal Chrome DevTools Protocol client over WebSocket, for the app's WebView (through `adb forward`) and for
// desktop Chrome.

interface CdpMessage {
  readonly id?: number;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: { readonly message: string };
}

interface RemoteObject {
  readonly value?: unknown;
  readonly description?: string;
  readonly preview?: { readonly properties: readonly { readonly name: string; readonly value?: string }[] };
}

function describe(a: RemoteObject): string {
  if (a.value !== undefined) return String(a.value);
  const props = a.preview?.properties.map((p) => `${p.name}: ${p.value ?? '?'}`).join(', ');
  return props ? `${a.description ?? 'Object'} { ${props} }` : (a.description ?? '');
}

interface EvaluateResult {
  readonly result: RemoteObject;
  readonly exceptionDetails?: { readonly text: string; readonly exception?: RemoteObject };
}

interface ConsoleEvent {
  readonly type: string;
  readonly args: readonly RemoteObject[];
}

export interface Cdp {
  send(method: string, params?: object): Promise<unknown>;
  /** Evaluates `expression` in the page (awaiting a returned promise) and returns its JSON value. */
  evaluate(expression: string, timeoutMs?: number): Promise<unknown>;
  /** Calls `listener` with the params of every `method` event (enable its domain first). */
  on(method: string, listener: (params: unknown) => void): void;
  close(): void;
}

export interface Target {
  readonly type: string;
  readonly url: string;
  readonly webSocketDebuggerUrl: string;
}

export async function targets(httpPort: number): Promise<readonly Target[]> {
  const res = await fetch(`http://127.0.0.1:${httpPort}/json/list`);
  return (await res.json()) as readonly Target[];
}

/** Connects to a page target. Page console lines go to `onConsole` (type, text). */
export async function connect(wsUrl: string, onConsole?: (type: string, text: string) => void): Promise<Cdp> {
  const ws = new WebSocket(wsUrl);
  const opened = Promise.withResolvers<void>();
  ws.onopen = () => opened.resolve();
  ws.onerror = () => opened.reject(new Error(`Cannot connect to ${wsUrl}`));
  await opened.promise;
  const pending = new Map<number, PromiseWithResolvers<unknown>>();
  const listeners: { readonly method: string; readonly listener: (params: unknown) => void }[] = [];
  let nextId = 0;
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data)) as CdpMessage;
    if (msg.id !== undefined) {
      const call = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) call?.reject(new Error(msg.error.message));
      else call?.resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled' && onConsole) {
      const { type, args } = msg.params as ConsoleEvent;
      onConsole(type, args.map(describe).join(' '));
    } else if (msg.method !== undefined) {
      for (const l of listeners) if (l.method === msg.method) l.listener(msg.params);
    }
  };
  ws.onclose = () => {
    for (const call of pending.values()) call.reject(new Error('The page connection closed.'));
    pending.clear();
  };
  const send = (method: string, params: object = {}): Promise<unknown> => {
    const call = Promise.withResolvers<unknown>();
    const id = ++nextId;
    pending.set(id, call);
    ws.send(JSON.stringify({ id, method, params }));
    return call.promise;
  };
  await send('Runtime.enable');
  return {
    send,
    async evaluate(expression, timeoutMs = 30_000) {
      const timeout = Promise.withResolvers<never>();
      const timer = setTimeout(
        () => timeout.reject(new Error(`Timed out after ${timeoutMs} ms: ${expression.slice(0, 80)}`)),
        timeoutMs,
      );
      try {
        const res = (await Promise.race([
          send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }),
          timeout.promise,
        ])) as EvaluateResult;
        if (res.exceptionDetails) {
          throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
        }
        return res.result.value;
      } finally {
        clearTimeout(timer);
      }
    },
    on: (method, listener) => listeners.push({ method, listener }),
    close: () => ws.close(),
  };
}
