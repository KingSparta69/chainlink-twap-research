import WebSocket from "ws";
import { RTDS_WS_URL } from "../feeds.js";

export interface RtdsSubscription {
  topic: string;
  type: string;
  filters?: string;
}

export type RtdsMessageHandler = (raw: string) => void;
export type RtdsStatusHandler = (connected: boolean) => void;

export class RtdsClient {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private subscriptions: RtdsSubscription[] = [];
  private onMessage: RtdsMessageHandler | null = null;
  private onStatus: RtdsStatusHandler | null = null;
  private onError: ((err: unknown) => void) | null = null;

  constructor(private readonly url = RTDS_WS_URL) {}

  configure(opts: {
    subscriptions: RtdsSubscription[];
    onMessage: RtdsMessageHandler;
    onStatus?: RtdsStatusHandler;
    onError?: (err: unknown) => void;
  }): void {
    this.subscriptions = opts.subscriptions;
    this.onMessage = opts.onMessage;
    this.onStatus = opts.onStatus ?? null;
    this.onError = opts.onError ?? null;
  }

  start(): void {
    if (!this.onMessage) throw new Error("RtdsClient.configure() required before start()");
    if (!this.ws) this.connect();
  }

  close(): void {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    try {
      this.ws?.close();
    } catch {
      /* */
    }
    this.ws = null;
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on("open", () => {
      this.onStatus?.(true);
      ws.send(JSON.stringify({ action: "subscribe", subscriptions: this.subscriptions }));
      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("PING");
      }, 5000);
    });

    ws.on("message", (data) => {
      const text = data.toString();
      if (text === "PONG") return;
      this.onMessage?.(text);
    });

    const onDrop = () => {
      this.onStatus?.(false);
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      this.ws = null;
      if (!this.closed) setTimeout(() => this.connect(), 2000);
    };

    ws.on("close", onDrop);
    ws.on("error", (err) => {
      this.onError?.(err);
      try {
        ws.close();
      } catch {
        /* */
      }
    });
  }
}
