import { TreeNode } from 'primeng/api'
import { flattenTreeNodes } from './tree.util'

describe('flattenTreeNodes', () => {
  // A pallet holding two boxes, one of which holds a tote: 3 levels, 5 nodes.
  const tree: TreeNode[] = [
    {
      key: 'p1',
      label: 'PALLET-01',
      children: [
        { key: 'b1', label: 'BOX-A', children: [{ key: 't1', label: 'TOTE-1' }] },
        { key: 'b2', label: 'BOX-B' },
      ],
    },
    { key: 'p2', label: 'PALLET-02' },
  ]

  const keysOf = (nodes: TreeNode[]) => nodes.map((n) => n.key)

  it('returns every node at every depth, roots first', () => {
    expect(keysOf(flattenTreeNodes(tree))).toEqual(['p1', 'b1', 't1', 'b2', 'p2'])
  })

  it('handles an empty tree and leaf-only nodes', () => {
    expect(flattenTreeNodes([])).toEqual([])
    expect(keysOf(flattenTreeNodes([{ key: 'solo' }]))).toEqual(['solo'])
  })

  it('excludes nodes the predicate rejects', () => {
    const notBoxes = flattenTreeNodes(tree, (n) => !n.label?.startsWith('BOX'))
    expect(keysOf(notBoxes)).toEqual(['p1', 't1', 'p2'])
  })

  it('still walks past an excluded node, so its children are not lost', () => {
    // BOX-A is filtered out but TOTE-1, nested inside it, survives.
    const result = flattenTreeNodes(tree, (n) => n.key !== 'b1')
    expect(keysOf(result)).toContain('t1')
  })
})
