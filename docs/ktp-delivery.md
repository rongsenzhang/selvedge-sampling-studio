# Delivering the KTP from prototype to pilot

Selvedge lets a commercial reviewer explore a fabric-book brief, inspect the cutting and stock decisions, record an explanation and hand the specification to production. It uses synthetic jobs and illustrative costs. This guide gives a company supervisor and an academic supervisor a way to assess the software now and decide what evidence a site pilot would need. The proposed owners below are roles to agree at a project kick-off. [University vacancy](https://careers.uos.ac.uk/job/989445) · [Business research](research.md)

## What a panel can check

| Responsibility | Evidence and acceptance check in the portfolio | Work requiring the partners |
| --- | --- | --- |
| Interpret internal and external needs. Select an engineering and UI approach. | Trace the customer's brief to eight labelled inputs, a cutting decision, an exception and a saved review. Try the same task on a phone and a desktop. [Business evidence](research.md) · [User interface](../public/index.html) | Observe an estimator and a production planner doing the same job, then ask a client-side approver what information they need from the handover. Check which fields each can actually supply. |
| Translate manufacturing judgement into rules, model data and select decision support. | Inspect the alternative cut directions, the grain restriction, the stock check, the edge review and the three ranked example jobs. Change one input, predict the effect and compare it with the result. The rule version travels with the saved estimate. [Engine](../public/lib/engine.mjs) · [Model](model.md) | Elicit counterexamples, secure permission for real historical records and compare proposed rules with independent expert decisions. Select a more complex algorithm only if evaluation on held-out jobs warrants it. |
| Implement, integrate, test and deploy. | A shared calculation and request handler support the hosted browser edition and the runnable HTTP server. The browser keeps reviews locally in IndexedDB. The server persists them in SQLite and can stream new review events to connected clients. Check a saved review after reloading. On the server, retry the same request ID and verify only one record exists. [API implementation](../public/lib/api.mjs) · [Review format](../public/lib/records.mjs) · [Run instructions](../README.md) | Obtain a supported stock interface, identities, access rules, retention policy, support owner and rollback agreement. Test duplicates, outages and stock changes with the system owner before connecting live stock. |
| Manage delivery, change, time and budget. | Use the milestones, decision gates and issue register below. A supervisor can identify who takes the next action and what would stop release. | Agree staff availability and spending authority. Report actual spend, effort, decisions and slippage with the company and university supervisors. |
| Transfer knowledge and support broader innovation. | A new reviewer can run the exercise below, challenge a rule and use the capture form to propose a change. A developer can locate the shared implementation and repeat the same analysis. | Ask a second employee to lead a session unaided. Establish ownership for each rule and schedule reviews. Select further product families with the commercial team. |
| Produce research, share findings and take part in external networks. | The protocol below specifies comparators, outcomes and treatment of disagreements. The public demonstrator, research notes and model can support a technical presentation. | Obtain research and disclosure approvals, collect evidence, review it with the academic team and choose an industry event, community activity or research venue. Record participation and feedback. |
| Work inclusively and follow company, university and funder requirements. | The exercise can be run verbally, on paper or on screen. Ask a reviewer to complete it using keyboard navigation and high zoom, and to identify states from their text labels. | Offer accessible formats and participation across roles and shifts. Agree consent, confidentiality and ethics with the partners. Production staff retain authority over physical trials, machine settings and site safety. |
| Develop professional skills and provide continuing support. | A support handover below names the artefacts a maintainer needs. | Agree development objectives with both supervisors, schedule Innovate UK training, track the agreed professional development time and submit costs against the annual allowance. The role specifies 10% development time and £2,000 annually for professional development. These resources are separate from any implementation or infrastructure budget. |

## Interview and rule capture

**Thirty-minute walkthrough.** Ask a commercial colleague to choose a recent, cleared example. Spend five minutes documenting the intended display and customer deadline. Spend ten minutes following their estimate from first brief to handover. Ask production to identify the first choice they would challenge, what they check physically, and a case where the usual advice fails. Use the last ten minutes to play back the proposed rule and agree what evidence would disprove it. Get permission before retaining notes.

| Complete one row per proposed rule | Entry |
| --- | --- |
| Job reference, product, source and permitted use | |
| Staff role, rule owner, date and review date | |
| What decision must the person make? | |
| Exact observations, units, missing inputs and thresholds | |
| If these conditions hold, take this action because… | |
| Example where it applies and expected answer | |
| Counterexample, competing rule and who resolves it | |
| Consequence of a false release or unnecessary hold | |
| Evidence, reviewer and status: draft / trial / accepted / retired | |

Translate approved examples into test cases, obtain sign-off from both the rule owner and the person receiving its output, and publish a versioned change note. Keep workplace records in the approved company environment.

## Handover exercise

1. Open **Studio linen collection**. Predict which orientation will use less stock. The standard layout uses 30.36 m. Rotation uses 28.80 m. Ask why the second layout wins even though fewer swatches fit across the roll.
2. Open **Archive weave collection**. The directional grain excludes rotation. The estimate is 17.28 m, but the declared edge frays. Record the proposed physical check and who would confirm the finish.
3. Open **Short-roll launch**. Eight colourways require 6.15 m each and the model has 37 m in total. Explain the 12.20 m shortfall, then set available stock to 49.20 m and rerun. Explain why actual roll lengths per colourway must still be checked.
4. Save a review, reload it and ask a colleague to recover the inputs, rule version and reason for the decision. If using GitHub Pages, use the same browser and site. In a shared trial, agree which server instance and retention policy hold the authoritative record.

**Completion check.** A trainee should explain one permitted choice, one excluded choice, one review trigger and one reason physical stock could differ from the model. The maintainer should reproduce a scenario from a clean checkout, describe how to test and version a rule change, and identify who can roll back the pilot. Record unresolved questions alongside the relevant rule.

## Proposed 24-month delivery plan

| Window | Work and accountable role | Evidence required to continue |
| --- | --- | --- |
| Months 1–3 | Associate maps one product family with the commercial lead, production owner and academic supervisor. Agree baseline, decision rights, data use and training. | Signed scope, data access, staff time and named budget holder. Record existing quote turnaround and rework definitions. |
| Months 4–8 | Associate and production owner build a rule register and shadow prototype. IT documents the stock interface and deployment options. | Hand-calculated examples reviewed, disputed rules held for review, representative edge cases and a costed integration proposal. |
| Months 9–14 | IT owner and associate run read-only integration and replay historical jobs. Academic supervisor reviews the evaluation design. | Traceable stock snapshots, reproducible results, acceptable discrepancy thresholds agreed **before** seeing held-out results, rollback rehearsal. |
| Months 15–20 | Commercial lead sponsors a limited shadow pilot. Staff make the actual decisions and record overrides and effort. | Both supervisors review the measured effect and harms. Quality, support capacity and forecast cost must meet the agreed gates before assisted use. |
| Months 21–24 | Company owner accepts operational support. Associate trains staff and prepares a joint findings report with the academic supervisor. | Named maintainer, restore test, signed ownership of rates and rules, an agreed adoption or retirement decision, and an approved dissemination plan. |

At each monthly review the associate reports planned and actual staff days, infrastructure and service charges, training expenditure, forecast cost to complete, open decisions and milestone dates. Identify the budget holder for every proposed purchase. If funding or released staff time cannot cover the next stage, reduce scope or seek sponsor approval before committing. Keep the prototype available for independent review while a site decision is pending.

## Risk and issue register

| Type and owner | Trigger or current observation | Action and closure evidence |
| --- | --- | --- |
| Issue · Production owner | The demo distributes stock equally across colours. A short individual roll could invalidate a total-stock check. | Obtain per-colour roll lengths. Add a test with adequate total stock and one deficient colour. Keep the decision advisory until it passes. |
| Issue · Commercial lead | The example estimate omits commercial charges and uses illustrative rates. | Identify cost ownership, dated rates and exclusions. Reconcile a cleared estimate line by line and record the accepted variance. |
| Risk · Production owner | A directional or repeating pattern, edge treatment or material behaviour invalidates a geometric choice. | Request a physical proof, record the exception and its authority, and add a regression example. Refer machine work to authorised staff. |
| Risk · IT owner | Two submissions arrive, the stock feed is stale, or the review store becomes unavailable. | Rehearse replay, disconnect and restore. Confirm duplicate handling and define when work returns to manual review. |
| Risk · Academic supervisor | Sensitive notes enter a research extract or the same collection appears in training and evaluation. | Use an approved dataset, log access, split by collection and time, and review the export before sharing. |
| Risk · Company supervisor | A deadline slips, staff time is withdrawn or forecast costs exceed the approved envelope. | Assign an owner and revised date, assess scope and costs, and record the sponsor's decision before the next release. |

## Evaluation and use of findings

**Question.** Can explicit rules improve the completeness of a fabric-book handover while preserving expert control of exceptions?

**Reproduce the demonstration.** Check out the release, run its test suite using the README, and evaluate the three scenarios without edits. Record the release and rules version, input values, status, orientation, metres, estimate in pence and triggered checks. Independently compute complete rows per colourway, then compare the results with the exercise above. Link any discrepancy to a failing example. These are constructed cases with known inputs. Their pass rate measures implementation behaviour on those examples. [Model](model.md) · [Release instructions](../README.md)

**Evaluate a pilot.** Agree the target jobs, sample size, rejection criteria and thresholds before testing. Have two experienced reviewers independently label actionable exceptions, then adjudicate disagreements. Compare existing practice with assisted estimates on matched jobs and alternate task order to reduce learning effects. Report the number of jobs, missing fields, missed exceptions, unnecessary holds, elapsed estimating time and corrections at handover. Use counts with denominators, paired time differences and uncertainty intervals where appropriate. Inspect performance by material and job type. If testing a learned ranking later, hold out entire subsequent collections and compare it with the fixed-rule baseline. No company trial has been conducted for this portfolio.

**Adoption and dissemination.** The commercial and production leads decide which product family, staff and decisions are eligible for an initial release. IT owns access, recovery and service support. Review exception and override records monthly, assign an owner to each recurring discrepancy and assess new product families separately. Give company staff a versioned operating guide and teach-back session. Present the same findings to supervisors with cost, quality and adoption evidence. An industry or community demonstration can use the synthetic cases. An academic paper or conference contribution requires partner review of IP, consent, data and funding acknowledgements. Record the venue, audience, feedback, changes made and who approved the public version.
