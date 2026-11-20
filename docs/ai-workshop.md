# From a workshop observation to a tested draft

The v1.1 knowledge workshop helps a production supervisor turn one narrow piece of manufacturing knowledge into a candidate rule. If a fabric edge frays, how much extra material should the team allow for a trial cut? The operator supplies the observation and proposed amount. The assistant identifies the relevant evidence, asks follow-up questions and suggests a counterexample. A reviewer owns the decision to test the percentage. [Open the workshop](https://rongsenzhang.github.io/selvedge-sampling-studio/workshop.html)

## Two observations to try

Use English text and invented details. **Generate a draft** sends the observation to the configured server and on to OpenAI. A response marked **Recorded OpenAI response** replays a stored example with its model and generation date. If the deployment offers only manual testing, enter a percentage directly.

| Synthetic observation | What to inspect |
| --- | --- |
| “For a fraying edge, reserve 7% of the planned cut length for a trial cut.” | A supported draft should quote the operator’s words, identify 7% and present a question and counterexample. Inspect the quote, then select **Use 7% in the draft** and **Test proposal**. |
| “For a fraying edge, allow some extra material for a trial cut.” | A grounded interpretation should ask the operator to clarify the amount. The response should offer no percentage to adopt. Check the evidence and decide what measurement would resolve the question. |

The test cases cover a stable fabric, a fraying edge with tight stock, and an already-short roll. In the tight-stock case the base run consumes 28.80 m from 30 m. A 7% allowance takes that run to 30.816 m, so the reviewer must resolve a 0.816 m shortfall. Download the tested JSON to see the note, accepted percentage, expected outcomes, actual results and review owner. A percentage adopted through the assistant also carries its live or recorded provenance. Approval for factory use would require a measured physical trial and a production owner’s decision.

## How the assistant works

1. The browser reads the deployment’s AI configuration. It sends only the typed observation when a visitor chooses **Generate a draft**. Saved reviews, stock figures, company files and quotation records are outside the request. The project fixtures use synthetic observations and briefs.
2. A server validates the input, enforces an admission limit and makes a Responses API request with a strict JSON Schema. The default model is `gpt-4.1-mini`. The request uses `store: false`. The OpenAI credential stays with the server.
3. The model classifies the observation, quotes a contiguous passage, selects review questions and identifies a counterexample. The server maps the model’s selections to controlled wording. It verifies that any supported percentage is a single explicit whole number from 0 to 20, grounded in both the note and its quoted evidence. A missing number or conflicting evidence requires clarification or a verification error.
4. The browser checks the response against the current observation. The **Use … in the draft** button appears for a supported percentage. An edit invalidates the displayed interpretation. Testing uses the existing deterministic cutting engine and three synthetic cases. Downloading captures a review proposal and leaves the workbench rules unchanged.

A model reading the same note may choose different review questions. The reproducible elements are the input guards, evidence checks, explicit acceptance and three stock calculations. Networking errors, declined responses and exhausted quotas leave the manual controls available. [Server-side interpreter](../server/ai-draft.mjs) · [Browser client](../public/lib/ai-client.mjs) · [Proposal model](../public/lib/proposal.mjs)

## Runtime and limits

| Runtime | Where the request goes | Admissions |
| --- | --- | --- |
| GitHub Pages with a configured public gateway | The browser sends the note to the gateway. A server-side credential authorises the model call. | Up to **100 attempts across all visitors** and **10 per client** per UTC day. The client allowance uses a daily keyed tag derived from the network address, so visitors on a shared network can share a limit. |
| Node edition with server-side `OPENAI_API_KEY` | Same-origin `POST /api/v1/ai/draft`. Set `OPENAI_MODEL` on the server to select a different model. | Up to **24 attempts per UTC day** for the local installation and **4 per rolling minute** in the running process. |
| A page without a live endpoint | Local acceptance checks remain available. Genuine pre-generated examples appear if the deployment includes them. | Manual checks and recorded examples make no model request. |

Each live request accepts one JSON field, `observation`, with 12–500 characters. The request body is limited to **4 KiB (4,096 bytes)**. An admitted attempt can count even when the provider later returns an error. Quota limits describe request volume, not monetary cost. [Gateway](../gateway/worker.mjs) · [Public quota](../gateway/quota.mjs) · [Node server](../server/main.mjs)

## Verify a deployment

- Open the workshop from a phone or desktop. Read the assistant’s availability message. Loading a recorded example should show its source, model and date before you adopt any value.
- When live generation is available, submit the two synthetic notes above. Check that the response refers to the current note and that generating it leaves the reserve input alone. For the 7% case, accept it, run the tests and inspect the JSON. For the missing-number case, check that no numeric adoption button appears.
- Edit the observation after receiving a draft. Its old suggestion should disappear. Try an unrealistic stock figure in the workbench or modify the workshop allowance and rerun the deterministic checks. The manual path remains usable when the assistant cannot answer.
- Run `npm test` with Node 24 or later to exercise the API contract, provider response validation, client interpretation and quota handling. These tests use controlled provider responses. Establish live deployment status separately by completing an interactive request through that deployment and checking its source label. [Test suite](../tests) · [GitHub Actions](https://github.com/rongsenzhang/selvedge-sampling-studio/actions)

The demo contains no factory data or employee transcripts. Practical adoption would begin with permission to collect a real observation, a witnessed trial, comparison with measured fabric use and approval from the designated owner. [KTP validation and handover plan](ktp-delivery.md) · [Version 1.0 release](https://github.com/rongsenzhang/selvedge-sampling-studio/releases/tag/v1.0.0)

The hosted service accepted a cross-origin browser request from the public GitHub Pages site on 20 November 2026. An observation specifying a 7% trial reserve returned that percentage and matching textual evidence. The two bundled examples were generated by the OpenAI API. A reviewer can try a different fictional observation to distinguish live drafting from replay.
