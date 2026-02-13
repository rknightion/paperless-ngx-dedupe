/**
 * MinHash implementation for approximate Jaccard similarity estimation.
 */

const MERSENNE_PRIME = (1n << 61n) - 1n;
const MAX_HASH = 0xffffffff;
const HASH_SEED = 42;

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export class MinHash {
  readonly numPermutations: number;
  signature: Uint32Array;
  private coeffA: BigInt64Array;
  private coeffB: BigInt64Array;

  constructor(numPermutations = 192) {
    this.numPermutations = numPermutations;
    this.signature = new Uint32Array(numPermutations).fill(MAX_HASH);
    this.coeffA = new BigInt64Array(numPermutations);
    this.coeffB = new BigInt64Array(numPermutations);

    const rng = mulberry32(HASH_SEED);
    for (let i = 0; i < numPermutations; i++) {
      let a = BigInt(Math.floor(rng() * MAX_HASH));
      if (a === 0n) a = 1n;
      this.coeffA[i] = a;
      this.coeffB[i] = BigInt(Math.floor(rng() * MAX_HASH));
    }
  }

  update(shingles: Set<number>): void {
    for (const x of shingles) {
      const bx = BigInt(x);
      for (let i = 0; i < this.numPermutations; i++) {
        const h = Number(
          ((this.coeffA[i] * bx + this.coeffB[i]) % MERSENNE_PRIME) % BigInt(MAX_HASH),
        );
        if (h < this.signature[i]) {
          this.signature[i] = h;
        }
      }
    }
  }

  jaccard(other: MinHash): number {
    if (this.numPermutations !== other.numPermutations) {
      throw new Error(
        `Mismatched numPermutations: ${this.numPermutations} vs ${other.numPermutations}`,
      );
    }
    let matches = 0;
    for (let i = 0; i < this.numPermutations; i++) {
      if (this.signature[i] === other.signature[i]) {
        matches++;
      }
    }
    return matches / this.numPermutations;
  }

  static jaccardFromArrays(a: Uint32Array, b: Uint32Array): number {
    if (a.length !== b.length) {
      throw new Error(`Mismatched array lengths: ${a.length} vs ${b.length}`);
    }
    let matches = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) {
        matches++;
      }
    }
    return matches / a.length;
  }

  serialize(): Buffer {
    return Buffer.from(this.signature.buffer, this.signature.byteOffset, this.signature.byteLength);
  }

  static deserialize(buffer: Buffer, numPerm = 192): MinHash {
    const mh = Object.create(MinHash.prototype) as MinHash;
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    (mh as { signature: Uint32Array }).signature = new Uint32Array(arrayBuffer);
    (mh as { numPermutations: number }).numPermutations = numPerm;
    // Deserialized instances don't need coefficients (they are read-only signatures)
    (mh as unknown as { coeffA: BigInt64Array }).coeffA = new BigInt64Array(0);
    (mh as unknown as { coeffB: BigInt64Array }).coeffB = new BigInt64Array(0);
    return mh;
  }
}
