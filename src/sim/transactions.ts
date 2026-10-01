import type { Cluster } from "./cluster";
import type { SimRecord } from "./events";

// Transactions (World 6). Facts: docs/research/kafka-curriculum.md (Delivery semantics):
// transactional.id + epochs fence zombies; the coordinator writes COMMIT/ABORT markers into every
// partition the transaction touched; read_committed consumers stop at the last stable offset (LSO,
// the first still-open transaction) and skip aborted records; isolation.level defaults to
// read_uncommitted, which returns everything (including aborted data).

export type Isolation = "read_committed" | "read_uncommitted";

type Open = { id: number; records: SimRecord[] };

export class TxnProducer {
  private seq = 0;
  open: Open | null = null;
  /** Bumped every time a new producer instance initialises the same transactional.id. */
  epoch = 0;
  readonly aborted = new Set<string>(); // `${topic}/${p}/${offset}`
  readonly committed = new Set<string>();
  private openFirst = new Map<string, number>(); // `${topic}/${p}` → first open offset (LSO)

  constructor(private cluster: Cluster) {}

  private pid(r: SimRecord) {
    return `${r.topic}/${r.partition}/${r.offset}`;
  }

  begin() {
    if (this.open) return;
    this.open = { id: ++this.seq, records: [] };
    this.cluster.events.emit({ type: "txn", state: "begin", id: this.open.id });
  }

  send(topic: string, key: string, value: string): SimRecord | null {
    if (!this.open) return null;
    const r = this.cluster.produce(topic, key, value, { "x-txn": String(this.open.id) });
    const tp = `${r.topic}/${r.partition}`;
    if (!this.openFirst.has(tp)) this.openFirst.set(tp, r.offset);
    this.open.records.push(r);
    return r;
  }

  /** The coordinator writes a marker into every touched partition; the records become visible (or not). */
  finish(commit: boolean) {
    const txn = this.open;
    if (!txn) return;
    for (const r of txn.records) (commit ? this.committed : this.aborted).add(this.pid(r));
    const touched = new Set(txn.records.map((r) => `${r.topic}|${r.partition}`));
    this.open = null;
    this.openFirst.clear();
    for (const tp of touched) {
      const [topic, p] = tp.split("|");
      this.cluster.produce(topic, null, commit ? "COMMIT" : "ABORT", { "x-control": commit ? "commit" : "abort", "x-txn": String(txn.id) }, Number(p));
    }
    this.cluster.events.emit({ type: "txn", state: commit ? "commit" : "abort", id: txn.id });
  }

  /** Last stable offset: read_committed consumers can't pass the first still-open record. */
  lso(topic: string, partition: number): number {
    return this.openFirst.get(`${topic}/${partition}`) ?? this.cluster.topic(topic).partitions[partition].length;
  }

  /** What a consumer with this isolation level would be handed at `offset` (null = skip it). */
  visible(r: SimRecord, isolation: Isolation): boolean {
    if (r.headers["x-control"]) return false; // markers are never returned to applications
    if (isolation === "read_uncommitted") return true;
    return !this.aborted.has(this.pid(r));
  }

  /** A second instance with the same transactional.id starts: the old one (a zombie) is fenced. */
  restartInstance() {
    this.epoch++;
    if (this.open) this.finish(false);
    this.cluster.events.emit({ type: "txn", state: "fenced", id: this.epoch });
  }
}

/**
 * A consumer group with an isolation level, reading one record per tick per partition.
 * read_committed waits at the LSO and silently skips aborted records and markers.
 */
export class IsolatedReader {
  private read: { key: string | null; value: string; id: string }[] = [];

  constructor(
    private cluster: Cluster,
    private txn: TxnProducer,
    readonly group: string,
    readonly isolation: Isolation,
  ) {}

  /** Records handed to this reader; `aborted` is evaluated now (a read_uncommitted reader may
   *  have read a record before its transaction aborted). */
  get seen(): { key: string | null; value: string; aborted: boolean }[] {
    return this.read.map((r) => ({ key: r.key, value: r.value, aborted: this.txn.aborted.has(r.id) }));
  }

  tick(topic: string) {
    const t = this.cluster.topic(topic);
    for (let p = 0; p < t.numPartitions; p++) {
      const pos = this.cluster.position(this.group, topic, p);
      if (this.isolation === "read_committed" && pos >= this.txn.lso(topic, p)) continue;
      const r = t.partitions[p][pos];
      if (!r) continue;
      if (this.txn.visible(r, this.isolation)) {
        this.cluster.fetch(this.group, topic, p);
        this.read.push({ key: r.key, value: r.value, id: `${r.topic}/${r.partition}/${r.offset}` });
      } else this.cluster.seek(this.group, topic, p, pos + 1);
    }
  }
}
