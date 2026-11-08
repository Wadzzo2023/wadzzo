import { useCallback, useState } from "react";

import type { Node } from "@wadzzo/schemas/shape-geometry";

const MAX_STEPS = 80;

/**
 * The outline being drawn (a list of points) with undo and redo.
 * Each `commit` is one undo step; dragging a point or moving a slider uses
 * `replace` / `patchNode` so one gesture is one step.
 */
export function useShapeHistory() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [past, setPast] = useState<Node[][]>([]);
  const [future, setFuture] = useState<Node[][]>([]);
  // An existing shape that can't be edited point by point stays as it was until replaced.
  const [lockedPath, setLockedPath] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  /** Start over with these points (and, for a shape that can't be edited, its path). */
  const reset = (next: Node[], locked: string | null) => {
    setNodes(next);
    setLockedPath(locked);
    setPast([]);
    setFuture([]);
    setTouched(false);
  };

  const commit = useCallback(
    (next: Node[]) => {
      setPast((p) => [...p.slice(-(MAX_STEPS - 1)), nodes]);
      setFuture([]);
      setNodes(next);
      setLockedPath(null);
      setTouched(true);
    },
    [nodes],
  );

  /** Changes the current step without a new undo step (slider moves). */
  const replace = (next: Node[]) => {
    setNodes(next);
    setLockedPath(null);
    setTouched(true);
  };

  /** Changes one point in the current step (dragging it, or curving it as it is placed). */
  const patchNode = (index: number, patch: Partial<Node>) => {
    setNodes((cur) => cur.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    setTouched(true);
  };

  /** A drag opens an undo step; if the pointer never moved, `cancelMove` drops it again. */
  const beginMove = () => {
    setPast((p) => [...p.slice(-(MAX_STEPS - 1)), nodes]);
    setFuture([]);
  };
  const cancelMove = () => setPast((p) => p.slice(0, -1));

  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => [nodes, ...f]);
    setNodes(past[past.length - 1]!);
    setPast((p) => p.slice(0, -1));
    setTouched(true);
  }, [past, nodes]);

  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, nodes]);
    setNodes(future[0]!);
    setFuture((f) => f.slice(1));
    setTouched(true);
  }, [future, nodes]);

  return {
    nodes,
    lockedPath,
    touched,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    reset,
    commit,
    replace,
    patchNode,
    beginMove,
    cancelMove,
    undo,
    redo,
  };
}

export type ShapeHistory = ReturnType<typeof useShapeHistory>;
