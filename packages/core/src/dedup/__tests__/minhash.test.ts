import { describe, it, expect } from 'vitest';
import { MinHash } from '../minhash.js';

function makeShingleSet(start: number, count: number): Set<number> {
  const set = new Set<number>();
  for (let i = start; i < start + count; i++) {
    set.add(i);
  }
  return set;
}

describe('MinHash', () => {
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
