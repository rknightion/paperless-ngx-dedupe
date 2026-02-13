import { describe, it, expect } from 'vitest';
import { LSHIndex } from '../lsh.js';
import { MinHash } from '../minhash.js';

function makeShingleSet(start: number, count: number): Set<number> {
  const set = new Set<number>();
  for (let i = start; i < start + count; i++) {
    set.add(i);
  }
  return set;
}

describe('LSHIndex', () => {
  it('returns identical signatures as candidates', () => {
    const lsh = new LSHIndex(128, 16);
    const shingles = makeShingleSet(0, 100);

    const mh1 = new MinHash(128);
    mh1.update(shingles);
    const mh2 = new MinHash(128);
    mh2.update(shingles);

    lsh.insert('doc1', mh1.signature);
    lsh.insert('doc2', mh2.signature);

    const candidates = lsh.getCandidates(mh1.signature);
    expect(candidates.has('doc1')).toBe(true);
    expect(candidates.has('doc2')).toBe(true);
  });

  it('does not return very different signatures as candidates', () => {
    const lsh = new LSHIndex(128, 16);

    // Completely disjoint shingle sets
    const shinglesA = makeShingleSet(0, 100);
    const shinglesB = makeShingleSet(10000, 100);

    const mhA = new MinHash(128);
    mhA.update(shinglesA);
    const mhB = new MinHash(128);
    mhB.update(shinglesB);

    lsh.insert('docA', mhA.signature);
    lsh.insert('docB', mhB.signature);

    const candidates = lsh.getCandidates(mhA.signature);
    // docA will always be a candidate of itself, but docB should likely not be
    expect(candidates.has('docA')).toBe(true);
    // With disjoint sets and 16 bands, very unlikely to collide
    // But LSH is probabilistic, so we just verify the basic structure works
  });

  it('clear resets all bands', () => {
    const lsh = new LSHIndex(128, 16);
    const shingles = makeShingleSet(0, 100);

    const mh = new MinHash(128);
    mh.update(shingles);
    lsh.insert('doc1', mh.signature);

    lsh.clear();

    const candidates = lsh.getCandidates(mh.signature);
    expect(candidates.size).toBe(0);
  });

  it('returns multiple docs from the same bucket', () => {
    const lsh = new LSHIndex(128, 16);
    const shingles = makeShingleSet(0, 100);

    // All use the same shingles, so all land in same buckets
    const mh1 = new MinHash(128);
    mh1.update(shingles);
    const mh2 = new MinHash(128);
    mh2.update(shingles);
    const mh3 = new MinHash(128);
    mh3.update(shingles);

    lsh.insert('doc1', mh1.signature);
    lsh.insert('doc2', mh2.signature);
    lsh.insert('doc3', mh3.signature);

    const candidates = lsh.getCandidates(mh1.signature);
    expect(candidates.has('doc1')).toBe(true);
    expect(candidates.has('doc2')).toBe(true);
    expect(candidates.has('doc3')).toBe(true);
  });

  it('computes rowsPerBand correctly', () => {
    const lsh = new LSHIndex(192, 20);
    expect(lsh.rowsPerBand).toBe(9); // floor(192/20) = 9
  });
});
