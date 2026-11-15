/**
 * Locality-Sensitive Hashing (LSH) index for candidate pair discovery.
 */

export class LSHIndex {
  readonly numPermutations: number;
  readonly numBands: number;
  readonly rowsPerBand: number;
  private bands: Map<number, number | number[]>[];
  private ids: string[] = [];

  constructor(numPermutations = 192, numBands = 20) {
    if (numBands > numPermutations) {
      throw new RangeError('numBands must not exceed numPermutations');
    }
    this.numPermutations = numPermutations;
    this.numBands = numBands;
    this.rowsPerBand = Math.floor(numPermutations / numBands);
    this.bands = [];
    for (let i = 0; i < numBands; i++) {
      this.bands.push(new Map());
    }
  }

  private hashBand(signature: Uint32Array, bandIndex: number): number {
    const start = bandIndex * this.rowsPerBand;
    const end = start + this.rowsPerBand;
    // Stream the same decimal values and separators as parts.join('|') into FNV-1a.
    // Avoid retaining an array of strings and a joined string for every bucket.
    let hash = 0x811c9dc5;
    for (let i = start; i < end; i++) {
      if (i > start) hash = Math.imul(hash ^ 124, 0x01000193) >>> 0;
      const value = signature[i];
      if (value === undefined) {
        for (const char of 'undefined')
          hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
        continue;
      }
      let divisor = 1;
      while (value / divisor >= 10) divisor *= 10;
      for (; divisor >= 1; divisor /= 10) {
        const digit = Math.floor(value / divisor) % 10;
        hash = Math.imul(hash ^ (48 + digit), 0x01000193) >>> 0;
      }
    }
    return hash >>> 0;
  }

  insert(docId: string, signature: Uint32Array): void {
    const ordinal = this.ids.push(docId) - 1;
    for (let b = 0; b < this.numBands; b++) {
      const key = this.hashBand(signature, b);
      const bucket = this.bands[b].get(key);
      if (bucket === undefined) {
        this.bands[b].set(key, ordinal);
      } else if (typeof bucket === 'number') {
        this.bands[b].set(key, [bucket, ordinal]);
      } else {
        bucket.push(ordinal);
      }
    }
  }

  getCandidates(signature: Uint32Array): Set<string> {
    const candidates = new Set<string>();
    for (let b = 0; b < this.numBands; b++) {
      const key = this.hashBand(signature, b);
      const bucket = this.bands[b].get(key);
      if (typeof bucket === 'number') {
        candidates.add(this.ids[bucket]);
      } else if (bucket) {
        for (const ordinal of bucket) candidates.add(this.ids[ordinal]);
      }
    }
    return candidates;
  }

  clear(): void {
    this.ids = [];
    for (let i = 0; i < this.numBands; i++) {
      this.bands[i] = new Map();
    }
  }
}
