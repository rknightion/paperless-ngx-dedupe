import { describe, it, expect, vi } from 'vitest';
import { MinHash } from '../minhash.js';

function makeShingleSet(start: number, count: number): Set<number> {
  const set = new Set<number>();
  for (let i = start; i < start + count; i++) {
    set.add(i);
  }
  return set;
}

function seededRandom(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function referenceSignature(permutations: number, shingles: Set<number>): Uint32Array {
  const rng = seededRandom(42);
  const signature = new Uint32Array(permutations).fill(0xffffffff);
  for (let i = 0; i < permutations; i++) {
    const a = BigInt(Math.floor(rng() * 0xffffffff)) || 1n;
    const b = BigInt(Math.floor(rng() * 0xffffffff));
    for (const x of shingles) {
      const hash = Number(((a * BigInt(x) + b) % ((1n << 61n) - 1n)) % 0xffffffffn);
      signature[i] = Math.min(signature[i], hash);
    }
  }
  return signature;
}

describe('MinHash', () => {
  it.each([16, 128, 256, 1024])('matches the BigInt reference with %i permutations', (count) => {
    const rng = seededRandom(73);
    const shingles = new Set([0, 1, 0xffffffff]);
    for (let i = 0; i < 5000; i++) shingles.add(Math.floor(rng() * 0x100000000));
    const hash = new MinHash(count);
    hash.update(shingles);
    expect(hash.signature).toEqual(referenceSignature(count, shingles));
    for (const edge of [0, 1, 0xffffffff]) {
      const single = new MinHash(count);
      single.update(new Set([edge]));
      expect(single.signature).toEqual(referenceSignature(count, new Set([edge])));
    }
  });

  it('performs no BigInt conversion during update', () => {
    const hash = new MinHash(256);
    const spy = vi.spyOn(globalThis, 'BigInt');
    try {
      hash.update(makeShingleSet(0, 100));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('produces deterministic signatures for the same input', () => {
    const shingles = makeShingleSet(0, 100);
    const mh1 = new MinHash(128);
    mh1.update(shingles);
    const mh2 = new MinHash(128);
    mh2.update(shingles);

    expect(Array.from(mh1.signature)).toEqual(Array.from(mh2.signature));
  });

  it('estimates Jaccard similarity within reasonable tolerance', () => {
    // Create two sets with known overlap
    // Set A: 0..99 (100 elements)
    // Set B: 50..149 (100 elements)
    // Overlap: 50..99 (50 elements)
    // Union: 0..149 (150 elements)
    // True Jaccard: 50/150 = 0.333
    const setA = makeShingleSet(0, 100);
    const setB = makeShingleSet(50, 100);

    const mhA = new MinHash(192);
    mhA.update(setA);
    const mhB = new MinHash(192);
    mhB.update(setB);

    const estimated = mhA.jaccard(mhB);
    const trueJaccard = 50 / 150;
    expect(Math.abs(estimated - trueJaccard)).toBeLessThan(0.15);
  });

  it('returns jaccard = 1.0 for identical shingle sets', () => {
    const shingles = makeShingleSet(0, 50);
    const mh1 = new MinHash(128);
    mh1.update(shingles);
    const mh2 = new MinHash(128);
    mh2.update(shingles);

    expect(mh1.jaccard(mh2)).toBe(1.0);
  });

  it('throws on mismatched numPermutations', () => {
    const mh1 = new MinHash(64);
    const mh2 = new MinHash(128);
    expect(() => mh1.jaccard(mh2)).toThrow('Mismatched numPermutations');
  });

  it('serializes and deserializes correctly', () => {
    const shingles = makeShingleSet(0, 100);
    const mh = new MinHash(128);
    mh.update(shingles);

    const buf = mh.serialize();
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBe(128 * 4);

    const restored = MinHash.deserialize(buf, 128);
    expect(restored.numPermutations).toBe(128);
    expect(Array.from(restored.signature)).toEqual(Array.from(mh.signature));
  });

  it('roundtrips serialize/deserialize with matching jaccard', () => {
    const shingles = makeShingleSet(0, 100);
    const mh = new MinHash(192);
    mh.update(shingles);

    const buf = mh.serialize();
    const restored = MinHash.deserialize(buf, 192);

    // Jaccard with itself via deserialized copy should be 1.0
    expect(MinHash.jaccardFromArrays(mh.signature, restored.signature)).toBe(1.0);
  });

  describe('jaccardFromArrays', () => {
    it('gives same result as instance jaccard method', () => {
      const setA = makeShingleSet(0, 100);
      const setB = makeShingleSet(30, 100);

      const mhA = new MinHash(128);
      mhA.update(setA);
      const mhB = new MinHash(128);
      mhB.update(setB);

      const instanceResult = mhA.jaccard(mhB);
      const staticResult = MinHash.jaccardFromArrays(mhA.signature, mhB.signature);
      expect(staticResult).toBe(instanceResult);
    });

    it('throws on mismatched array lengths', () => {
      const a = new Uint32Array(64);
      const b = new Uint32Array(128);
      expect(() => MinHash.jaccardFromArrays(a, b)).toThrow('Mismatched array lengths');
    });
  });
});
