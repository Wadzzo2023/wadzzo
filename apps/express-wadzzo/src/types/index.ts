// src/types/index.ts

/** A job as the agent and pin-making code see it: always for one brand. */
export interface Job {
  id: string;
  type: string;
  creatorId: string;
  payload: Record<string, unknown>;
}
