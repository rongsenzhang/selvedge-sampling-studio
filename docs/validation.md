# Verification and field evidence

## Repeat the checks

Use Node 24+, then run `npm test`. For the browser flows run `npm ci`, `npx playwright install chromium` and `npm run test:browser`. Set `STUDIO_URL=https://rongsenzhang.github.io/selvedge-sampling-studio/` to run the public-site flow. This creates fictional reviews in a fresh browser profile. The automation does not submit material to a company or recruitment system.

| Check performed for v1.0 | Observable result |
| --- | --- |
| Shared decision engine | 11 tests cover stock equality and shortfall, rows per colourway, locked orientation, infeasible sizes, validation, costs and deterministic historical retrieval. An independent piece-placement loop checks 200 small-run combinations. |
| API, persistence and integration | Four tests compare all three server responses with the browser engine, exercise invalid requests, replay simultaneous writes under one ID, reopen a file-backed database and verify a notification on a live event stream. |
| Knowledge workshop | Six tests exercise the proposed allowance, failed boundary examples, rounding, existing blocks, ownership and serialisation, and invalid drafts. |
| Desktop and mobile interaction | Chromium runs at 1440 and 390 CSS pixels with a further 320-pixel overflow check. It tests both runtime paths, edits inputs, saves and reopens reviews, reads exported JSON, checks isolation/notifications, changes the proposed rule and checks for unintended horizontal scrolling and script errors. |
| Visual inspection | Inspected the planner's desktop and mobile layouts. A separate WebKit run at a 390-pixel iPhone viewport opened both tools and checked the short-stock transition. The tests use browser emulation. |
| Accessibility spot check | In Chromium at 390 CSS pixels, axe-core 4.10.3 found zero violations in the tested WCAG 2/2.1 A and AA rule set on both initial screens. The skip link received first keyboard focus. Opening the review log with Enter and dismissing with Escape restored focus to its button. This automated pass covers a subset of accessibility needs. |
| Repeatable publication | The GitHub workflow gates Pages publication on the unit, HTTP and browser suites. Release notes identify the published smoke check. [Workflow](../.github/workflows/pages.yml) · [Run history](https://github.com/rongsenzhang/selvedge-sampling-studio/actions) |

The first public deployment passed the same desktop and phone-width browser walkthroughs at the anonymous GitHub Pages URL, including save, reload, exported JSON and the rule workshop. [Deployment run](https://github.com/rongsenzhang/selvedge-sampling-studio/actions/runs/44833111036)

## Arithmetic spot-check

For 180 books, 6 colours, 160 × 220 mm pieces and a 1,400 mm usable width, cutting across the width at 160 mm allows eight pieces. Each colour needs 23 rows × 220 mm, or 5.06 m. The run needs 30.36 m. Rotating allows six pieces across and gives 30 rows × 160 mm per colour, or 28.80 m across the six colours. The 1.56 m difference follows from these inputs and assumptions.

The fraying-edge workshop checks an invented hypothesis. At 5% the model asks whether 30 m covers 30.24 m including trial cuts. At 4%, a 29.952 m requirement fits this stock, so a fixture expecting an extra reserve warning fails. This tests whether a proposed rule meets a specified expectation. A panel can challenge the expectation as well as the rule.

## Evidence still required

No company or client participated in this release. Production rates, costs, historical jobs, examples and workshop testimony are simulated. The model assumes equal stock for each colour, one usable width, rectangular pieces and uniform orientation. It excludes blade allowance, repeat matching, defects, mixed-orientation nesting, assembly and delivery. A physical sample, roll-level inventory and an authorised estimator are needed before operational use.

There has been no physical-device lab test, assisted-technology user study, formal accessibility certification, production ERP integration or commercial impact study. [Field validation and knowledge transfer protocol](ktp-delivery.md)

## AI extension

The version 1.1 test suite adds 22 checks to the original 21. They exercise strict structured responses, exact evidence spans, missing or conflicting percentages, provider errors, HTTP validation, client-side response validation and concurrent quota accounting. A local mobile browser flow uses a controlled response to verify that generation, adoption and rule testing remain separate actions. These tests use synthetic inputs and run without a provider key. A live acceptance check is recorded separately when a deployment connects to OpenAI.
