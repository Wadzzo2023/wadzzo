export { default } from "@wadzzo/api/brand/rest/file";

// Next reads this literally from the route file, so it can't be re-exported.
export const config = { api: { bodyParser: false } };
