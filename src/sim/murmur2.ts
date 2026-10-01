// Port of org.apache.kafka.common.utils.Utils.murmur2 — the hash the default
// Kafka partitioner uses for keyed records. Results must match the Java client.

const SEED = 0x9747b28c;
const M = 0x5bd1e995;
const R = 24;

export function murmur2(data: Uint8Array): number {
  const length = data.length;
  let h = SEED ^ length;
  const length4 = length >> 2;

  for (let i = 0; i < length4; i++) {
    const i4 = i * 4;
    let k =
      (data[i4] & 0xff) |
      ((data[i4 + 1] & 0xff) << 8) |
      ((data[i4 + 2] & 0xff) << 16) |
      ((data[i4 + 3] & 0xff) << 24);
    k = Math.imul(k, M);
    k ^= k >>> R;
    k = Math.imul(k, M);
    h = Math.imul(h, M);
    h ^= k;
  }

  const tail = length & ~3;
  switch (length % 4) {
    case 3:
      h ^= (data[tail + 2] & 0xff) << 16;
    // falls through
    case 2:
      h ^= (data[tail + 1] & 0xff) << 8;
    // falls through
    case 1:
      h ^= data[tail] & 0xff;
      h = Math.imul(h, M);
  }

  h ^= h >>> 13;
  h = Math.imul(h, M);
  h ^= h >>> 15;
  return h | 0;
}

/** Utils.toPositive: clears the sign bit (not Math.abs). */
export const toPositive = (n: number) => n & 0x7fffffff;

const encoder = new TextEncoder();

/** Partition for a keyed record, exactly like Kafka's BuiltInPartitioner. */
export function partitionForKey(key: string, numPartitions: number): number {
  return toPositive(murmur2(encoder.encode(key))) % numPartitions;
}
