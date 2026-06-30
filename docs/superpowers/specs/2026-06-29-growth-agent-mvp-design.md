# Growth Agent MVP Design

## Goal

Build a local, personal-WeChat-safe marketing assistant for a WeChat mini-program. The first version automates campaign planning, channel source codes, white-list target management, draft generation, and manual-confirmation sending records. It does not bypass WeChat protections, hook the client, mass-message strangers, or press Send automatically.

## Safety Boundary

- The system only works with targets explicitly added to a local white list.
- Drafts are generated and copied for manual review before sending.
- Daily limits and duplicate checks block accidental over-sending.
- High-risk automation such as protocol hooks, batch friend requests, bulk unsolicited messages, CAPTCHA bypass, and account-control tooling is out of scope.

## MVP Workflow

1. Create or use a campaign for a mini-program tool.
2. Add allowed WeChat groups, friends, or Moments as targets.
3. Generate draft tasks for selected targets.
4. Each draft receives a source code and a mini-program path containing `source`.
5. Copy a draft, paste it into WeChat, review it, and send manually.
6. Mark the draft as sent, skipped, or copied.
7. Review simple dashboard metrics for pending, copied, sent, and skipped drafts.

## Architecture

- `src/domain`: pure business logic for source codes, content generation, and frequency limits.
- `src/store`: SQLite persistence using Node's built-in `node:sqlite` module.
- `server`: local HTTP API and static file server.
- `public`: native HTML/CSS/JS dashboard optimized for fast operations.
- `tests`: Node test-runner coverage for domain logic, store behavior, and API flows.

## UI Design

The interface is a compact operational dashboard:

- Left rail: campaign setup and target creation.
- Main column: campaign cards and draft generation.
- Right column: draft queue with copy, mark sent, and skip actions.
- Top metrics: total targets, queued drafts, copied drafts, sent drafts.

The visual style is utilitarian: neutral background, readable typography, restrained accent colors, dense but not cramped rows, and clear state badges.

## First-Version Constraints

- Runs locally from `E:\growth-agent`.
- Uses no paid API and no OpenAI key in the MVP.
- Content generation is template-driven and deterministic.
- Data is stored in `data/growth-agent.sqlite`.
- The WeChat desktop adapter is intentionally deferred until the core queue is stable.

