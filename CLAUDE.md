# Hivebound: notes for Claude

## Pull requests: always post the Cloudflare preview link

Every time you open a pull request, give the user its Cloudflare preview link in your reply so they can test it right away.

- Branch pushes build a Worker Preview (Workers Builds runs `npx wrangler preview`), named after the branch with `/` replaced by `-`.
- The link is `https://<branch-name-with-dashes>-hivebound.zernonia.workers.dev`, e.g. branch `claude/new-session-vciz55` → https://claude-new-session-vciz55-hivebound.zernonia.workers.dev
- Confirm the preview name from the PR's **Workers Builds: hivebound** check run: its details URL ends in `/previews/<preview-name>/builds/<id>`. Say whether that build passed.
- The link is stable per branch and always serves the latest push.
- Production (`main`) is https://hivebound.zernonia.workers.dev
