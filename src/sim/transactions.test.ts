import { describe, expect, it } from "vitest";
import { Cluster } from "./cluster";
import { IsolatedReader, TxnProducer } from "./transactions";

const setup = () => {
  const c = new Cluster([
    { name: "orders", partitions: 1 },
    { name: "invoices", partitions: 1 },
  ]);
  const txn = new TxnProducer(c);
  return { c, txn, committed: new IsolatedReader(c, txn, "billing", "read_committed"), uncommitted: new IsolatedReader(c, txn, "audit", "read_uncommitted") };
};

describe("transactions", () => {
  it("read_committed waits at the LSO while a transaction is open", () => {
    const { txn, committed, uncommitted } = setup();
    txn.begin();
    txn.send("orders", "alice", "o1");
    committed.tick("orders");
    uncommitted.tick("orders");
    expect(committed.seen).toHaveLength(0);
    expect(uncommitted.seen).toHaveLength(1);
    txn.finish(true);
    committed.tick("orders");
    expect(committed.seen.map((r) => r.value)).toEqual(["o1"]);
  });

  it("aborted records are hidden from read_committed, markers from everyone", () => {
    const { c, txn, committed, uncommitted } = setup();
    txn.begin();
    txn.send("orders", "bob", "o2");
    txn.send("invoices", "bob", "i2");
    txn.finish(false);
    for (let i = 0; i < 3; i++) {
      committed.tick("orders");
      uncommitted.tick("orders");
    }
    expect(committed.seen).toHaveLength(0);
    expect(uncommitted.seen.map((r) => r.aborted)).toEqual([true]);
    expect(c.topic("invoices").partitions[0].map((r) => r.value)).toEqual(["i2", "ABORT"]);
  });
});

describe("read_uncommitted sees data that is later aborted", () => {
  it("marks it aborted after the fact", () => {
    const c = new Cluster([{ name: "orders", partitions: 1 }]);
    const txn = new TxnProducer(c);
    const audit = new IsolatedReader(c, txn, "audit", "read_uncommitted");
    txn.begin();
    txn.send("orders", "a", "o1");
    audit.tick("orders");
    expect(audit.seen[0].aborted).toBe(false);
    txn.finish(false);
    expect(audit.seen[0].aborted).toBe(true);
  });
});
