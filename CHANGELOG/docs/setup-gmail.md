# Gmail setup change history

## 2026-10-16 — Make the local configuration path portable

- Before: the OAuth guide named one machine-specific checkout path for the environment file.
- After: it points to `.env.local` in the repository root and allows creating that local file when needed. Existing OAuth steps, setting names, privacy guidance, and deferred hardening remain unchanged.
- Proof scope: one exact path replacement plus a history link; reversing both edits reconstructs the original guide byte-for-byte.
- Limits: no environment or credential values were opened; OAuth, Gmail/provider calls, Next.js/app execution, UI, host behavior, and SEO were not tested.
