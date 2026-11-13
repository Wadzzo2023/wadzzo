// src/agent/tools/index.ts — every tool the map agent can call.
import { analyticsTools } from "./analytics";
import { brandTools } from "./brand";
import type { AgentTool } from "./define";
import { proposeTools } from "./propose";
import { searchTools } from "./search";
import { uiTools } from "./ui";

export const AGENT_TOOLS: AgentTool[] = [
  ...searchTools,
  ...brandTools,
  ...analyticsTools,
  ...uiTools,
  ...proposeTools,
  // Trails are hidden for now: trailTools (./trails) are not offered to the agent.
];
