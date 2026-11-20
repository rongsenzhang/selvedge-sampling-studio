# Cutting and decision model

The decision engine estimates the fabric component of a sample-book brief. Each book contains one rectangular swatch of every colourway. It shows how a production decision can be recorded, checked and reproduced. All job cards, rules, rates and inventory quantities in this release are illustrative. The estimate covers sample preparation only. A customer quotation would also need binding, cover, print, packaging, freight, tax and commercial approval.

## Input contract

| JSON field | Meaning | Accepted values |
| --- | --- | --- |
| `quantity` | Number of books, hence swatches required from each colour | Integer 1–10,000 |
| `colourways` | Number of separate colours in each book | Integer 1–100 |
| `swatchWidthMm` | Finished width of a rectangular swatch | Integer 20–1,000 mm |
| `swatchHeightMm` | Finished height of a rectangular swatch | Integer 20–1,000 mm |
| `rollWidthMm` | Usable cross-roll width after excluding unusable edges | Integer 100–5,000 mm |
| `stockMetres` | Total available length spread equally across the colours | Finite number 0–1,000,000 m |
| `grain` | Whether the swatch height must lie along the roll | `locked` or `free` |
| `edge` | Edge behaviour reported in the brief | `stable` or `frays` |

All eight keys are required. Integers are JSON numbers. Unknown keys, unrecognised enum values, numeric strings, out-of-range values and non-finite numbers produce a validation error. These working ranges bound a demonstration and make no statement about a factory’s capacity.

## Cutting decision

For a standard cut, swatch width runs across the roll and height runs down its length. The rotated cut swaps the two. A grain lock excludes the rotated orientation. For each permitted orientation:

1. Divide net roll width by the cross-roll swatch span and round **down** to obtain pieces across. Zero means this direction is infeasible.
2. Divide book quantity by pieces across and round **up** to obtain rows per colour. Start each colour on a separate, equal-length roll.
3. Multiply rows by the along-roll swatch span to obtain length per colour. Multiply by the colour count and divide by 1,000 to convert millimetres to total metres.
4. Select the feasible orientation using the least total length. An exact tie keeps standard orientation.
5. Divide the area of all finished swatches by net roll width times consumed length to obtain utilisation. The last row and unused cross-roll strips both count against this percentage.

This search exhausts the two uniform orientations in the model. Mixed orientations, patterned repeats, seam or knife allowances, defects, minimum gripper margins, differing stock by colour, usable offcuts and assembly scheduling need additional inputs. Confirm the net width and these conditions with a production operator before designing a real pilot.

### Worked example

For 180 books with six colours, 160 × 220 mm swatches and a usable 1,400 mm roll:

| Orientation | Pieces across | Rows per colour | Length per colour | All colours |
| --- | ---: | ---: | ---: | ---: |
| Standard | 8 | 23 | 5.06 m | 30.36 m |
| Rotated | 6 | 30 | 4.80 m | 28.80 m |

The rotated layout consumes 1.56 m less fabric for the specified rectangles. The 1,080 swatches occupy 38.016 m² of 40.32 m² consumed, giving 94.29% utilisation. A locked grain changes the selected plan to standard. To reproduce the stock boundary, leave rotation free and change available stock from 28.80 m to 28.79 m. The former covers the modeled run exactly and the latter blocks it.

## Decision checks and costing

| Condition | Result | Operator action |
| --- | --- | --- |
| All checks pass | Ready | Verify the input details and first cut before any real production. |
| Fabric is declared to fray | Review | Trial the physical edge and record the agreed treatment. |
| A permitted fit exists but stock is short | Blocked | Replenish each colourway to the required length or revise quantity. |
| Neither permitted orientation fits | Blocked | Reconsider usable roll width, swatch dimensions or the approved direction. |

A blocking check takes precedence over a review check. Where a geometric plan exists, a material shortage still leaves the cost and required length visible for budgeting. An impossible layout suppresses both values. The rule provenance and actions are available through the exported catalogue.

The standard estimate uses £11.50 per linear metre, £0.18 per cut swatch, a £24 setup and £1.25 per colourway. A fraying edge adds a provisional £0.08 per swatch, subject to a sample trial. The material line is rounded to the nearest penny and the integer-penny lines are summed. For the worked example those lines are £331.20, £194.40 and £31.50, totalling **£557.10**. These rates are synthetic and exclude VAT.

## Related job retrieval

Six curated synthetic job cards allow a user to compare a new specification with prior examples. The score is a transparent weighted similarity measure. It is independent of the stock check and the cutting decision.

| Inputs | Points |
| --- | ---: |
| Quantity | 15 |
| Colour count | 10 |
| Swatch width and height | 15 each |
| Usable roll width | 10 |
| Grain match | 20 |
| Edge behaviour match | 15 |

For each numeric input the score fraction is the smaller value divided by the larger. Each identical category contributes its full weight. The top three are sorted by unrounded score, then by card ID for a tie. The displayed value is rounded to a whole number out of 100. Current stock has no bearing on the ranking. A score describes geometric and specification similarity. It does not estimate a probability, validate a rule or predict actual job performance.

## Verification and transfer

The engine tests cover an independently calculated example, grain constraints, equally good orientations, exact-fit boundaries, stock equality/shortages, per-colour rounding, review precedence, currency arithmetic, infeasible layouts, strict API inputs and deterministic retrieval. A separate check places each swatch by iteration and compares its required length with the engine across 200 combinations of dimensions, demand and grain.

For a pilot, collect the operator’s reasoning for one ordinary run and one borderline run, confirm actual net widths and lengths for each colour, then reconcile predicted metres with the cutting sheet and actual metres consumed. Agree with commercial staff which costs belong in an estimate and which checks need human sign-off. Keep the example, expected result and approval with each reviewed rule revision. No factory validation or measured waste reduction underlies v1.0.

[Pike’s fabric-book service](https://www.pike-textiles.com/products/fabric-books/) describes layout assistance and edge-treatment advice. [Senator’s fabric-book service](https://www.ssguk.net/fabric-books) describes available material treatments and customer proofing in this market. These sources support the problem context. Numeric parameters and decision thresholds were selected for this demonstration.
