/// <reference lib="webworker" />
import { LocalDbRuntime, type DbRequest } from './runtime';

type Request = DbRequest & { id: number };

type Response =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

const runtime = new LocalDbRuntime();

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    const { id, ...payload } = request;
    const result = await runtime.handle(payload as DbRequest);
    const response: Response = { id, ok: true, result };
    if (payload.type === 'export' && result instanceof ArrayBuffer) {
      self.postMessage(response, [result]);
    } else {
      self.postMessage(response);
    }
  } catch (error) {
    const response: Response = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
