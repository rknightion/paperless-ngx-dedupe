import { describe, it, expect } from 'vitest';
import { UnionFind } from '../union-find.js';

describe('UnionFind', () => {
  it('should put two unioned elements in the same group', () => {
    const uf = new UnionFind<string>();
    uf.union('a', 'b');
    expect(uf.connected('a', 'b')).toBe(true);
  });

  it('should return root after path compression', () => {
    const uf = new UnionFind<number>();
    uf.union(1, 2);
    uf.union(2, 3);
    uf.union(3, 4);
    // After find with path compression, all should point to the same root
    const root = uf.find(4);
    expect(uf.find(1)).toBe(root);
    expect(uf.find(2)).toBe(root);
    expect(uf.find(3)).toBe(root);
  });

  it('should support transitivity: union(A,B) + union(B,C) implies connected(A,C)', () => {
    const uf = new UnionFind<string>();
    uf.union('a', 'b');
    uf.union('b', 'c');
    expect(uf.connected('a', 'c')).toBe(true);
  });

  it('should return correct partitions from getGroups()', () => {
    const uf = new UnionFind<string>();
    uf.union('a', 'b');
    uf.union('c', 'd');
    const groups = uf.getGroups();
    expect(groups.size).toBe(2);

    // Find which group each element belongs to
    const groupValues = [...groups.values()];
    const groupWithA = groupValues.find((g) => g.includes('a'))!;
    const groupWithC = groupValues.find((g) => g.includes('c'))!;

    expect(groupWithA).toContain('a');
    expect(groupWithA).toContain('b');
    expect(groupWithA).toHaveLength(2);

    expect(groupWithC).toContain('c');
    expect(groupWithC).toContain('d');
    expect(groupWithC).toHaveLength(2);
  });

  it('should keep single elements as separate groups', () => {
    const uf = new UnionFind<string>();
    uf.find('a');
    uf.find('b');
    uf.find('c');
    const groups = uf.getGroups();
    expect(groups.size).toBe(3);
    for (const members of groups.values()) {
      expect(members).toHaveLength(1);
    }
  });

  it('should handle multiple separate groups', () => {
    const uf = new UnionFind<number>();
    uf.union(1, 2);
    uf.union(3, 4);
    uf.union(5, 6);
    expect(uf.connected(1, 2)).toBe(true);
    expect(uf.connected(3, 4)).toBe(true);
    expect(uf.connected(5, 6)).toBe(true);
    expect(uf.connected(1, 3)).toBe(false);
    expect(uf.connected(1, 5)).toBe(false);
    expect(uf.connected(3, 5)).toBe(false);

    const groups = uf.getGroups();
    expect(groups.size).toBe(3);
  });

  it('should be idempotent: union(A,B) twice does not break anything', () => {
    const uf = new UnionFind<string>();
    uf.union('a', 'b');
    uf.union('a', 'b');
    expect(uf.connected('a', 'b')).toBe(true);
    const groups = uf.getGroups();
    expect(groups.size).toBe(1);
    const members = [...groups.values()][0];
    expect(members).toHaveLength(2);
  });

  it('should reflect all added elements in size', () => {
    const uf = new UnionFind<string>();
    expect(uf.size).toBe(0);
    uf.find('a');
    expect(uf.size).toBe(1);
    uf.union('b', 'c');
    expect(uf.size).toBe(3);
    uf.find('d');
    expect(uf.size).toBe(4);
  });

  it('should not consider disconnected elements as connected', () => {
    const uf = new UnionFind<string>();
    uf.find('a');
    uf.find('b');
    expect(uf.connected('a', 'b')).toBe(false);
  });
});
