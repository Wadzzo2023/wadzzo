export { DELETE, GET, POST } from "@wadzzo/api/brand/rest/mcp";

// Next reads this literally from the route file, so it can't be re-exported.
// An agent run can take most of a minute.
export const maxDuration = 60;
