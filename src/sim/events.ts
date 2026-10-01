// The simulation's only side effect is emitting these events. Stage, audio and
// level logic subscribe to them, so every animation and sound maps to a Kafka event.

export type Headers = Record<string, string>;

export type SimRecord = {
  topic: string;
  key: string | null;
  value: string;
  headers: Headers;
  partition: number;
  offset: number;
  timestamp: number;
};

export type SimEvent =
  | { type: "produced"; topic: string; record: SimRecord; hashed: boolean }
  | { type: "appended"; topic: string; record: SimRecord }
  /** A consumer group read a record. Reading never removes it from the log. */
  | { type: "fetched"; topic: string; group: string; record: SimRecord; position: number }
  | { type: "partitionsAdded"; topic: string; total: number };

type Listener = (event: SimEvent) => void;

export class SimEmitter {
  private listeners = new Set<Listener>();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: SimEvent) {
    for (const l of this.listeners) l(event);
  }
}
