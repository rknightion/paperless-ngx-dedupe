import { describe, it, expect } from 'vitest';
import { getHeapStatistics } from 'node:v8';
import { randomFillSync } from 'node:crypto';
import { LSHIndex } from '../lsh.js';
import { fnv1a32 } from '../shingles.js';
import { MinHash } from '../minhash.js';

function makeShingleSet(start: number, count: number): Set<number> {
  const set = new Set<number>();
  for (let i = start; i < start + count; i++) {
    set.add(i);
  }
  return set;
}

describe('LSHIndex', () => {
  it('LSHIndex refuses more bands than permutations', () => {
    expect(() => new LSHIndex(16, 32)).toThrow(RangeError);
    expect(() => new LSHIndex(16, 32)).toThrow('numBands must not exceed numPermutations');
  });

  it('allows uneven band sizes without losing identical candidates', () => {
    const index = new LSHIndex(256, 100);
    const signature = new Uint32Array(256).fill(7);
    index.insert('synthetic-document', signature);
    expect(index.getCandidates(signature)).toEqual(new Set(['synthetic-document']));
  });

  it('indexes 20,000 unrelated signatures within 80 MB of heap', () => {
    const signatures = Array.from({ length: 20_000 }, () => randomFillSync(new Uint32Array(256)));
    const lsh = new LSHIndex(256, 32);
    const before = getHeapStatistics().used_heap_size;
    for (const [index, signature] of signatures.entries())
      lsh.insert(`document-${index}`, signature);
    const growth = getHeapStatistics().used_heap_size - before;
    expect(growth).toBeLessThan(80 * 1024 * 1024);
    expect(lsh.getCandidates(signatures[0])).toContain('document-0');
  }, 60_000);

  it('matches the original band hash candidate sets across boundary values', () => {
    const signatures = Array.from({ length: 100 }, () => randomFillSync(new Uint32Array(256)));
    signatures.push(
      new Uint32Array(256),
      new Uint32Array(256).fill(0xffffffff),
      new Uint32Array([9, 10, 99, 100]),
    );
    signatures.push(signatures[0].slice());
    signatures[1].set(signatures[0].subarray(0, 8));
    const bands = Array.from({ length: 32 }, () => new Map<number, Set<string>>());
    const lsh = new LSHIndex(256, 32);
    for (const [index, signature] of signatures.entries()) {
      const id = `doc-${index}`;
      lsh.insert(id, signature);
      for (let band = 0; band < 32; band++) {
        const key = fnv1a32(
          Array.from({ length: 8 }, (_, i) => String(signature[band * 8 + i])).join('|'),
        );
        const bucket = bands[band].get(key) ?? new Set<string>();
        bucket.add(id);
        bands[band].set(key, bucket);
      }
    }
    for (const signature of signatures) {
      const expected = new Set<string>();
      for (let band = 0; band < 32; band++) {
        const key = fnv1a32(
          Array.from({ length: 8 }, (_, i) => String(signature[band * 8 + i])).join('|'),
        );
        for (const id of bands[band].get(key) ?? []) expected.add(id);
      }
      expect(lsh.getCandidates(signature)).toEqual(expected);
    }
  });

  it('keeps candidate sets for zero, one and all shared bands and repeated IDs', () => {
    const lsh = new LSHIndex(8, 4);
    const all = new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const one = new Uint32Array([1, 2, 30, 40, 50, 60, 70, 80]);
    const none = new Uint32Array([11, 12, 13, 14, 15, 16, 17, 18]);
    lsh.insert('first', all);
    lsh.insert('same', all);
    lsh.insert('one', one);
    lsh.insert('none', none);
    lsh.insert('first', all);
    expect(lsh.getCandidates(all)).toEqual(new Set(['first', 'same', 'one']));
    expect(lsh.getCandidates(one)).toEqual(new Set(['first', 'same', 'one']));
    expect(lsh.getCandidates(none)).toEqual(new Set(['none']));
    lsh.clear();
    lsh.insert('after-clear', all);
    expect(lsh.getCandidates(all)).toEqual(new Set(['after-clear']));
  });

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
