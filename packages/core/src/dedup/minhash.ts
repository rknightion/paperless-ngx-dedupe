/**
 * MinHash implementation for approximate Jaccard similarity estimation.
 */

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
  private coeffA: Uint32Array;
  private coeffB: Uint32Array;

  constructor(numPermutations = 192) {
    this.numPermutations = numPermutations;
    this.signature = new Uint32Array(numPermutations).fill(MAX_HASH);
    this.coeffA = new Uint32Array(numPermutations);
    this.coeffB = new Uint32Array(numPermutations);

    const rng = mulberry32(HASH_SEED);
    for (let i = 0; i < numPermutations; i++) {
      let a = Math.floor(rng() * MAX_HASH);
      if (a === 0) a = 1;
      this.coeffA[i] = a;
      this.coeffB[i] = Math.floor(rng() * MAX_HASH);
    }
  }

  update(shingles: Set<number>): void {
    for (const x of shingles) {
      const xLow = x & 0xffff;
      const xHigh = x >>> 16;
      for (let i = 0; i < this.numPermutations; i++) {
        const aLow = this.coeffA[i] & 0xffff;
        const aHigh = this.coeffA[i] >>> 16;
        const low = aLow * xLow;
        const middle = aHigh * xLow + aLow * xHigh;
        let pLow = low + (middle % 65536) * 65536;
        let pHigh = aHigh * xHigh + Math.floor(middle / 65536) + Math.floor(pLow / 4294967296);
        pLow = pLow >>> 0;
        pLow += this.coeffB[i];
        if (pLow >= 4294967296) {
          pLow -= 4294967296;
          pHigh++;
        }
        // Fold the high three bits modulo 2^61 - 1, retaining exact 32-bit halves.
        let rHigh = pHigh % 536870912;
        let rLow = pLow + Math.floor(pHigh / 536870912);
        if (rLow >= 4294967296) {
          rLow -= 4294967296;
          rHigh++;
        }
        if (rHigh === 536870911 && rLow === MAX_HASH) {
          rHigh = 0;
          rLow = 0;
        } else if (rHigh > 536870911) {
          rHigh -= 536870912;
          rLow++;
        }
        // 2^32 is congruent to 1 modulo 2^32 - 1.
        const h = (rHigh + rLow) % MAX_HASH;
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
    (mh as unknown as { coeffA: Uint32Array }).coeffA = new Uint32Array(0);
    (mh as unknown as { coeffB: Uint32Array }).coeffB = new Uint32Array(0);
    return mh;
  }
}
