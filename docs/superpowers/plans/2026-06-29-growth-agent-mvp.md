# Growth Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web dashboard that manages personal-WeChat-safe promotion campaigns, target white lists, source-coded drafts, and manual send tracking.

**Architecture:** The app uses pure domain modules for source code generation, content generation, and frequency decisions. A local HTTP server exposes JSON APIs backed by SQLite via Node's built-in `node:sqlite`, and serves a native HTML/CSS/JS dashboard.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, built-in `node:sqlite`, native HTTP server, vanilla browser UI.

---

## File Structure

- `package.json`: project metadata and scripts.
- `.gitignore`: excludes dependencies, database, logs, and screenshots.
- `src/domain/source-code.js`: creates safe source codes and mini-program paths.
- `src/domain/content-generator.js`: creates WeChat-safe draft text from campaign and target context.
- `src/domain/frequency-policy.js`: blocks disallowed, duplicated, and over-limit sends.
- `src/store/sqlite-store.js`: initializes SQLite schema and exposes persistence methods.
- `server/app.js`: creates the HTTP request handler.
- `server/index.js`: starts the local server.
- `public/index.html`: dashboard shell.
- `public/styles.css`: dashboard styling.
- `public/app.js`: dashboard state, API calls, and interactions.
- `tests/domain.test.js`: source code, generator, and frequency tests.
- `tests/store.test.js`: SQLite persistence tests.
- `tests/api.test.js`: API integration tests.

## Tasks

### Task 1: Project Skeleton And Domain Tests

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tests/domain.test.js`
- Create: `src/domain/source-code.js`
- Create: `src/domain/content-generator.js`
- Create: `src/domain/frequency-policy.js`

- [ ] **Step 1: Write failing domain tests**

Create tests that import the domain modules and assert source code sanitization, mini-program path creation, draft content structure, and frequency protection.

- [ ] **Step 2: Run domain tests and verify RED**

Run: `npm test -- tests/domain.test.js`

Expected: FAIL because the domain modules do not exist yet.

- [ ] **Step 3: Implement domain modules**

Add minimal pure functions to pass the tests: `slugify`, `makeSourceCode`, `buildMiniappPath`, `generateDraft`, and `canCreateDraft`.

- [ ] **Step 4: Run domain tests and verify GREEN**

Run: `npm test -- tests/domain.test.js`

Expected: PASS.

### Task 2: SQLite Store

**Files:**
- Create: `tests/store.test.js`
- Create: `src/store/sqlite-store.js`

- [ ] **Step 1: Write failing store tests**

Create tests for schema initialization, seeded defaults, campaign insertion, target insertion, draft insertion, and state summary.

- [ ] **Step 2: Run store tests and verify RED**

Run: `npm test -- tests/store.test.js`

Expected: FAIL because the store module does not exist yet.

- [ ] **Step 3: Implement SQLite store**

Use `DatabaseSync` from `node:sqlite`, create tables, seed a default campaign and targets, and expose CRUD methods needed by the API.

- [ ] **Step 4: Run store tests and verify GREEN**

Run: `npm test -- tests/store.test.js`

Expected: PASS.

### Task 3: Local API

**Files:**
- Create: `tests/api.test.js`
- Create: `server/app.js`
- Create: `server/index.js`

- [ ] **Step 1: Write failing API tests**

Create tests for `GET /api/state`, `POST /api/campaigns`, `POST /api/targets`, `POST /api/drafts/generate`, and `PATCH /api/drafts/:id/status`.

- [ ] **Step 2: Run API tests and verify RED**

Run: `npm test -- tests/api.test.js`

Expected: FAIL because the API modules do not exist yet.

- [ ] **Step 3: Implement API server**

Use Node's built-in HTTP server, parse JSON bodies, route API requests, serve static files, and return JSON errors.

- [ ] **Step 4: Run API tests and verify GREEN**

Run: `npm test -- tests/api.test.js`

Expected: PASS.

### Task 4: Dashboard UI

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`

- [ ] **Step 1: Implement dashboard shell**

Add campaign form, target form, metrics, campaign list, target list, and draft queue containers.

- [ ] **Step 2: Implement browser interactions**

Fetch `/api/state`, submit campaign and target forms, generate drafts, copy draft text using Clipboard API, and update draft statuses.

- [ ] **Step 3: Run all tests**

Run: `npm test`

Expected: PASS.

### Task 5: Run And Verify Locally

**Files:**
- Modify: none unless verification finds issues.

- [ ] **Step 1: Start local server**

Run: `npm start`

Expected: server listens on `http://localhost:4788`.

- [ ] **Step 2: Verify dashboard**

Open `http://localhost:4788`, create a target, generate drafts, copy a draft, and mark it sent.

- [ ] **Step 3: Final test pass**

Run: `npm test`

Expected: PASS.

