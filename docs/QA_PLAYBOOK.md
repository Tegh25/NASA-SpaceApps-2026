# Terralog Cursor QA playbook

This starter adds three read-only specialist subagents, one always-on project rule, and a worktree dependency setup. It does not modify application source code or install new testing dependencies.

## 1. Put the files in the repository

Copy the `.cursor/` folder from this archive into the root of `NASA-SpaceApps-2026`. Commit it so the whole team gets the same QA agents and guardrails.

Cursor discovers project subagents in `.cursor/agents/`, project rules in `.cursor/rules/`, and worktree setup from `.cursor/worktrees.json`.

## 2. Start from the correct branch

PR #2 is `integration` -> `main`. Its head is the branch to QA, not `main`.

```bash
git fetch origin
git switch integration
git pull --ff-only origin integration
```

For a separate, reviewable hardening branch:

```bash
git switch -c qa/pr2-hardening
```

Open a PR from `qa/pr2-hardening` into `integration`. Merging that follow-up into `integration` updates the existing PR #2. Alternatively, commit directly to `integration` if that is your team's agreed workflow.

## 3. Run the existing baseline before agents investigate

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Record the output. The repository currently exposes these checks through `package.json`; it does not currently define npm scripts for linting, browser E2E, performance testing, or Python tests.

Start the app without external credentials to exercise intentional fallback paths:

```bash
npm run dev
```

With `BACKBOARD_API_KEY` absent, `/api/parse` and `/api/explain` should use their documented fallback behaviour. With `CESIUM_ION_TOKEN` absent, the globe should use NASA GIBS imagery. Do not paste secret values into Cursor prompts or agent reports.

## 4. Ask one parent agent to coordinate the audit

Use Cursor Agent in Plan mode first. Paste this prompt:

> We are QA-hardening PR #2 in this repository. Read `AGENT_HANDOFF.md`, `README.md`, `data/README.md`, `discovery/HANDOFF.md`, `discovery/mars/MARS_FINDINGS.md`, and `docs/DESIGN.md`. Do not edit files yet. Coordinate three independent read-only audits in parallel: `/frontend-runtime-auditor`, `/api-integration-auditor`, and `/data-performance-auditor`. Use `/multitask` for independent work. Ask each agent to report severity P0-P3, exact file/line or route, evidence, impact, reproducible steps, and a regression-test idea. Deduplicate overlapping findings. Separate confirmed bugs from unverified risks. Do not run `npm run mock-data`, full discovery pipelines, remote downloads, or scripts that overwrite `public/data/`. Return a prioritized QA report and a test matrix before proposing fixes.

The agents are deliberately read-only. Keep the parent/orchestrating Agent as the only source-code writer.

## 5. Implement fixes without creating merge conflicts

For each confirmed P0/P1 issue:

1. Ask the parent Agent to explain the root cause and propose the smallest fix plus regression test.
2. Approve the plan before implementation.
3. Implement one coherent fix at a time. Do not let two agents edit the same component or data contract.
4. Run the focused test, then `npm run typecheck`, `npm test`, and `npm run build`.
5. Ask the read-only auditors to re-check the affected area and ask Cursor's Browser capability to exercise the actual route.

Use Cursor Agents Window worktrees for genuinely independent code changes. Give each coding agent its own worktree and non-overlapping files. Do not merge several agents' edits until each diff and test result has been reviewed. For audit-only work, subagents can run in parallel without separate worktrees.

## 6. Minimum QA matrix for this PR

### Browser and app integration
- Home route, Moon/Mars toggle, selecting a site, clearing selection, returning to whole-Earth view, and browser back/forward.
- Find/search: keyword fallback, Backboard path when credentials are available, sliders/required filters, live re-ranking, and URL deep-link restoration.
- Explore panel and explanations: curated fallback, loading/error states, site comparisons, missing-value display, and caveats.
- Twin Terrain Lab: Earth/Moon and Earth/Mars pairs, side-by-side/morph, multiple site changes, resize, and route exit/re-entry.
- Tour/Target/Compare/Method routes and responsive layout at 1440x900 and 390x844.
- Repeat navigation to detect leaked Cesium/Three.js resources, duplicate listeners, stale selections, or stuck loading overlays.

### API and provider failure modes
- Wrong HTTP method, malformed JSON, invalid body, oversized input, unknown feature keys, and out-of-range numeric values.
- Provider success, missing key, timeout, thrown network error, malformed provider response, 429, and 5xx.
- Rate limiting under repeated and concurrent requests; verify whether the deployment's multi-instance/serverless model changes the intended guarantee.
- Confirm `BACKBOARD_API_KEY` never appears in client bundles or browser-visible errors.
- Compare Vite dev middleware behaviour with Vercel function behaviour.

### Data and scientific integrity
- Validate every committed `public/data/*.json` file against the Zod schemas and physical ranges.
- Check feature-key alignment, stable IDs, array lengths, duplicate IDs, null/NaN handling, coordinate bounds, and heightmap references.
- Verify generated featured cards and heightmaps agree, including Earth `twin` links.
- Preserve different spatial resolutions and the documented limits of Mars comparisons; inspect units and provenance in the Method UI.
- Do not rebuild the full research dataset during ordinary QA. If a deterministic build test is needed, perform it in a disposable worktree with required input data present and inspect the complete diff before keeping outputs.

### Performance
- Measure initial load and first usable globe, heat-field creation, slider re-ranking over the 12,362 Earth cells, route changes, and lab heightmap rendering.
- Record browser/device, dataset size, elapsed time, memory/console warnings, and repeatability. Establish budgets from a real baseline rather than inventing thresholds.
- Use synthetic scaled fixtures for stress tests; never modify the committed real dataset just to create a load test.

## 7. Add durable automated coverage next

The current Vitest tests are valuable unit/contract tests, but they do not replace browser and pipeline tests. Recommended next increments:

- Add Playwright for a short browser smoke suite covering home, Moon/Mars toggle, selecting a site, one lab route, and fallback operation with no API keys. Keep WebGL-heavy assertions separate from route/UI smoke tests.
- Add a Python `pytest` suite around pure geospatial/scoring/normalization functions using tiny synthetic rasters/arrays. Keep network downloads and full discovery jobs out of normal CI.
- Add a GitHub Actions pull-request workflow that runs `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`; add Python tests and Playwright as separate jobs once they are deterministic.
- Add a small generated-data contract check that validates IDs, dimensions, ranges, and cross-file references without regenerating the data.

## 8. PR report format

Use this format for the final review:

| Severity | Finding | Evidence / file | Reproduction | Regression test | Status |
|---|---|---|---|---|---|

P0 = blocks safe release; P1 = important user-facing or data-integrity bug; P2 = meaningful edge case or reliability issue; P3 = cleanup/low-impact risk. A finding is not fixed until the regression test and relevant build checks pass.
