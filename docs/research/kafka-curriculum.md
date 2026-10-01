# Kafka curriculum research

Compiled 2026-10-01 against the **Apache Kafka 4.3** docs (4.3.0 released 2026-05-22; 4.3.1 released 2026-06-25) and Confluent's developer courses. Items marked **[unverified]** must be checked before they appear in game content.

> The consumer client still defaults to `group.protocol=classic`. Brokers enable KIP-848 by default, but consumers opt in with `group.protocol=consumer`. Kafka 4.3 warns that classic "will be deprecated". The game teaches both, and presents KIP-848 as the future.

## Version timeline

| Version | Milestone |
|---|---|
| 3.0 | `acks=all` and `enable.idempotence=true` become producer defaults |
| 3.9 (Nov 2024) | Tiered Storage GA (KIP-405), dynamic KRaft quorum (KIP-853), last ZooKeeper release |
| 4.0 (Mar 2025) | ZooKeeper removed (KRaft only), KIP-848 GA, share groups early access, KIP-890 phase 2, KIP-1030 defaults (`linger.ms` 0 → 5) |
| 4.1 | ELR (KIP-966) on by default for new clusters |
| 4.2 (Feb 2026) | Share groups production-ready (+ RENEW ack), KIP-1071 Streams rebalance GA (limited) |
| 4.3 (May 2026) | Share group tuning (KIP-1240), deprecation warning for the classic protocol (KIP-1274) |

## Worlds, concepts, configs, misconceptions

### World 1 — Events & the Log
| Concept | Definition | Configs / defaults | Misconception |
|---|---|---|---|
| Record | An immutable fact: key (optional), value (bytes), headers, timestamp | `message.timestamp.type=CreateTime`; `message.timestamp.after.max.ms`=1h (4.0) | "Kafka understands my JSON" (brokers only see bytes) |
| Topic | A named, durable, append-only log | `auto.create.topics.enable=true` | "Consuming removes the message" |
| Append-only | Records are only added at the end, never changed | — | "Update/delete a record by key" (you append a new version or a tombstone) |
| Offset | A record's position within a partition; the consumer position is the next offset to read | — | "Offsets are global" (they're per partition, and can have gaps) |

### World 2 — Partitions & Scale
| Concept | Definition | Configs / defaults | Misconception |
|---|---|---|---|
| Partition | An ordered log that is the unit of parallelism and replication | `num.partitions=1` **[unverified]** | "Order is guaranteed across the topic" |
| Key hashing | `murmur2(key) % numPartitions`; null keys use uniform sticky (KIP-794) | `partitioner.ignore.keys=false`, `partitioner.adaptive.partitioning.enable=true` | "Null keys are round-robin per record"; "adding partitions is safe for keyed data" |
| Segments | A partition is stored as segment files plus indexes; only the active segment is written | `segment.bytes`=1 GiB, `segment.ms`=7d | "Retention deletes individual records" |
| Retention | Closed segments are deleted after a time or size limit | `cleanup.policy=delete`, `retention.ms`=7d, `retention.bytes=-1` | "Deleted exactly at 7 days" |

### World 3 — Brokers, Clusters & KRaft
| Concept | Definition | Configs / defaults | Misconception |
|---|---|---|---|
| Broker / cluster | A server that holds replicas; a cluster is a group of brokers | — | "A topic lives on one broker" |
| KRaft quorum | Metadata lives in the Raft log `__cluster_metadata`, managed by an active controller | `process.roles`, `node.id`, `controller.quorum.bootstrap.servers` | "Kafka still needs ZooKeeper" |
| Metadata propagation | Brokers replay the metadata log | — | "The controller carries data traffic" |
| Dynamic quorum | Add or remove controllers (KIP-853) | `kafka-metadata-quorum.sh` | — |

### World 4 — Replication & Durability
| Concept | Definition | Configs / defaults | Misconception |
|---|---|---|---|
| Replication factor | The number of copies of each partition | `default.replication.factor=1`; internal topics use 3 | "Kafka replicates by default" |
| Leader / followers | The leader takes writes; followers fetch from it (KIP-392 allows follower reads) | — | "Followers share the writes" |
| ISR & high watermark | The caught-up replicas; a record is committed once every ISR member has it; consumers read up to the high watermark | `replica.lag.time.max.ms=30000` | "ISR = all replicas" |
| min.insync.replicas | With `acks=all`, a write fails if the ISR is smaller than this | default **1**; production uses RF=3 / min ISR=2 | "acks=all alone guarantees no loss" |
| Election / ELR | A new leader comes from the ISR; unclean election off by default; ELR (KIP-966) | `unclean.leader.election.enable=false` | — |

### World 5 — Producers
| Concept | Definition | Configs / defaults | Misconception |
|---|---|---|---|
| Batching | Async `send()`; a batch goes out when it is full or the linger timer expires | `batch.size=16384`, `linger.ms=5` (4.0+), `buffer.memory`=32 MiB | "Every send is a network call" |
| Compression | Per batch; stays compressed end to end | `compression.type=none` (gzip/snappy/lz4/zstd) | "The broker recompresses everything" |
| acks | 0 / 1 / all | `acks=all` (since 3.0) | "acks=1 is the default" |
| Retries | Retry until the delivery timeout | `retries=MAX_INT`, `delivery.timeout.ms=120000`, `max.in.flight.requests.per.connection=5` | "`retries` bounds retrying" |
| Idempotence | Producer ID + sequence numbers per partition; the broker drops duplicates | `enable.idempotence=true` | "Idempotent = end-to-end exactly-once" |

### World 6 — Consumers & Groups
| Concept | Definition | Configs / defaults | Misconception |
|---|---|---|---|
| Poll loop | A pull model | `max.poll.records=500`, `fetch.min.bytes=1`, `fetch.max.wait.ms=500` | "Kafka pushes to consumers" |
| Group assignment | Each partition goes to one member; extra members sit idle | `partition.assignment.strategy=[Range, CooperativeSticky]` | "More consumers always means more throughput" |
| Classic rebalance | Triggered by join/leave, heartbeat timeout or a slow poll; static membership avoids it | `session.timeout.ms=45000`, `heartbeat.interval.ms=3000`, `max.poll.interval.ms=300000`, `group.instance.id` | — |
| KIP-848 rebalance | Server-side assignor; incremental, with no global barrier | `group.protocol=consumer`, `group.remote.assignor`; broker session/heartbeat **[unverified 45s/5s]** | "4.0 switched all clients automatically" |
| Commits | Stored in `__consumer_offsets`; the committed offset is the next record to read | `enable.auto.commit=true`, `auto.commit.interval.ms=5000` | "Auto-commit = at-most-once" |
| Reset & lag | Applies only when no committed offset exists; lag = high watermark − committed offset | `auto.offset.reset=latest` (`earliest`, `none`, `by_duration:`) | "earliest replays the topic every restart" |

### World 7 — Delivery Semantics & Transactions
- **At-most-once**: commit, then process. A crash loses records.
- **At-least-once**: process, then commit. A crash causes duplicates. This is the practical default.
- **Exactly-once**: idempotent producer + `transactional.id` + `sendOffsetsToTransaction` + `isolation.level=read_committed` (the default is `read_uncommitted`). The coordinator writes commit/abort markers, and epoch fencing stops zombie producers (KIP-890). *Misconception:* EOS covers external side effects.
- **LSO**: `read_committed` consumers stop at the first open transaction.

### World 8 — Compaction & Tiered Storage
- **Compaction**: `cleanup.policy=compact` keeps at least the latest record per key; no reordering, and offsets never change. `min.cleanable.dirty.ratio=0.5`, `min.compaction.lag.ms=0`. The active segment is never compacted.
- **Tombstones**: a key with a null value; kept for `delete.retention.ms`=1 day.
- **Tiered storage**: closed segments move to remote storage; `remote.storage.enable=false` by default; `local.retention.*=-2`; compacted topics are not supported. *Misconception:* consumers read S3 directly.

### World 9 — Queues & Performance
- **Share groups** (KIP-932): several consumers share one partition, with a lock per record. States: Available → Acquired → Acknowledged/Archived. Ack types: ACCEPT / RELEASE / REJECT / RENEW. `group.share.record.lock.duration.ms=30000`; delivery limit 5 **[secondary source]**. No ordering, and no limit tying consumers to the partition count.
- **Sequential I/O and page cache**: ~600 MB/s linear vs ~100 kB/s random (the docs' RAID-5 benchmark).
- **Zero-copy** (`sendfile`): not used with TLS.
- **Batching end to end**, and **quotas** that throttle clients.

### World 10 — Ecosystem
- **Schema Registry** (Confluent, not Apache): Avro, Protobuf or JSON Schema; compatibility default BACKWARD **[unverified]**.
- **Connect**: source and sink connectors, workers and tasks, converters and SMTs; state is stored in Kafka topics.
- **Streams**: KStream (inserts) vs KTable (upserts, null = delete) vs GlobalKTable; state stores backed by changelog topics; `processing.guarantee=at_least_once` **[unverified]**. It is a library, not a cluster.
- **Windowing**: tumbling, hopping, sliding and session windows, plus a grace period.
- **ksqlDB / Flink SQL**: Confluent 101 now teaches Flink SQL, so treat ksqlDB as optional.
- **Security**: TLS, SASL (PLAIN/SCRAM/GSSAPI/OAUTHBEARER), mTLS, ACLs (StandardAuthorizer). *Misconception:* "secure by default" (the default is PLAINTEXT).

## Visualizable mechanics (simulation backlog)

1. Key hashing → partition lanes; adding a partition remaps keys
2. Sticky partitioning for null keys
3. Batching with linger/batch.size sliders and compression shrink
4. acks race: crash the leader right after the ack
5. Idempotent retry: a lost response produces a duplicate unless idempotence is on
6. ISR shrink and expand, with the high watermark moving
7. min.insync.replicas rejection (RF=3, min ISR=2, kill 2 brokers)
8. Broker failure → leader election (ISR/ELR), plus an unclean election toggle
9. KRaft controller failover
10. Consumer joins: eager vs cooperative vs KIP-848
11. Too many consumers (5 on 3 partitions) → switch to a share group
12. Lag growth: producer rate > consumer rate
13. max.poll.interval exceeded → kicked from the group → duplicates
14. Commit timing: crash between process and commit
15. auto.offset.reset earliest vs latest
16. Transactions: markers, LSO, aborted records hidden
17. Segment rolling and retention deletion
18. Compaction cleaner and tombstones
19. Tiered storage offload and remote read
20. Share group locks: RELEASE/REJECT/RENEW/timeout, archived at 5 deliveries
21. Zero-copy vs copy path; TLS turns zero-copy off
22. KStream vs KTable; windows, late records and the grace period
23. Schema evolution under BACKWARD compatibility

## Sources
- https://kafka.apache.org/documentation/ (→ 4.3) and its config pages: https://kafka.apache.org/43/configuration/producer-configs/ · consumer-configs · topic-configs · broker-configs
- https://kafka.apache.org/43/design/design/ · https://kafka.apache.org/43/operations/tiered-storage/ · https://kafka.apache.org/41/operations/eligible-leader-replicas/
- https://kafka.apache.org/43/javadoc/org/apache/kafka/clients/consumer/KafkaShareConsumer.html
- Release announcements: 3.9.0, 4.0.0, 4.2.0, 4.3.0 (kafka.apache.org/blog)
- KIP-848, KIP-932, KIP-966, KIP-1030, KIP-405 (cwiki.apache.org)
- https://developer.confluent.io/courses/apache-kafka/events/ · https://developer.confluent.io/courses/architecture/get-started/ · https://www.confluent.io/blog/kip-848-consumer-rebalance-protocol/ · https://docs.confluent.io/platform/current/config-manage/kafka-queues.html
