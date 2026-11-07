# Security

Report a vulnerability privately to **support@wadzzo.com**, not in a public issue. Include the app, the URL and the steps to reproduce.

- Secrets (Stellar seeds, Firebase admin keys, database URLs, AWS keys) live only in the Vercel projects, the worker's `.env` and local git-ignored `.env*` files. Never commit them.
- CI scans every push with [gitleaks](https://github.com/gitleaks/gitleaks) (`.gitleaks.toml`). Run `gitleaks git .` locally before pushing if in doubt.
- If a secret is committed by mistake, rotate it first; removing it from history comes second.
