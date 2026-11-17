import { TreeNode } from 'primeng/api'

/**
 * Flatten a PrimeNG tree depth-first into a single list.
 *
 * Bulk actions over a tree (select all, count, export) need every descendant,
 * not just the roots. `include` filters which nodes end up in the result;
 * children of an excluded node are still walked, so filtering a branch's root
 * does not hide what is nested under it.
 *
 * @param nodes   Roots to walk.
 * @param include Predicate deciding whether a node belongs in the result.
 */
export function flattenTreeNodes(
  nodes: TreeNode[],
  include: (node: TreeNode) => boolean = () => true
): TreeNode[] {
  return nodes.flatMap((node) => [
    ...(include(node) ? [node] : []),
    ...flattenTreeNodes(node.children || [], include),
  ])
}
