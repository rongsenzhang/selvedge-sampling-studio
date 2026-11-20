import { strict as assert } from 'node:assert';
import test from 'node:test';
import { evaluate, fields, rules, rulesVersion, scenarios } from '../public/lib/engine.mjs';

const base = scenarios[0].brief;
const run = (edits = {}) => evaluate({ ...base, ...edits });
const getCheck = (result, id) => result.checks.find((check) => check.id === id);

test('studio linen reproduces a hand-calculated two-orientation quote', () => {
  const result = run();
  assert.equal(result.rulesVersion, rulesVersion);
  assert.equal(result.status, 'ready');
  assert.equal(result.layout.orientation, 'rotated');
  assert.equal(result.layout.across, 6);
  assert.equal(result.layout.rowsPerColour, 30);
  assert.deepEqual(
    result.layout.alternatives.map((plan) => plan.metres),
    [30.36, 28.8],
  );
  assert.equal(result.metres, 28.8);
  assert.equal(result.utilisation, 94.29);
  assert.deepEqual(
    result.costLines.map((line) => line.pence),
    [33120, 19440, 3150],
  );
  assert.equal(result.estimatePence, 55710);
  assert.deepEqual(
    result.checks.map((check) => check.id),
    rules.map((rule) => rule.id),
  );
});

test('each colourway needs full rows, even when that leaves a near-empty final row', () => {
  const result = run({
    quantity: 3,
    colourways: 2,
    swatchWidthMm: 100,
    swatchHeightMm: 100,
    rollWidthMm: 200,
  });
  assert.equal(result.layout.rowsPerColour, 2);
  assert.equal(result.metres, 0.4);
  assert.equal(result.utilisation, 75);
  assert.equal(result.layout.orientation, 'standard');
});

test('grain lock excludes the shorter rotated cut; released grain enables it', () => {
  const locked = run({ grain: 'locked' });
  assert.equal(locked.layout.orientation, 'standard');
  assert.equal(locked.metres, 30.36);
  assert.equal(locked.layout.alternatives[1].allowed, false);
  assert.equal(locked.layout.alternatives[1].metres, null);
  assert.match(locked.layout.alternatives[1].reason, /requires/);
  assert.equal(run({ grain: 'free' }).metres, 28.8);
});

test('an over-width face can fit when rotated but blocks when the grain is locked', () => {
  const oneDirectionFits = { rollWidthMm: 200, swatchWidthMm: 210, swatchHeightMm: 190 };
  const feasible = run(oneDirectionFits);
  assert.equal(feasible.layout.orientation, 'rotated');
  assert.equal(feasible.layout.alternatives[0].allowed, false);
  const blocked = run({ ...oneDirectionFits, grain: 'locked' });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.layout.orientation, null);
  assert.equal(blocked.layout.across, 0);
  assert.equal(blocked.layout.rowsPerColour, 0);
  assert.equal(blocked.metres, null);
  assert.equal(blocked.estimatePence, null);
  assert.equal(blocked.utilisation, null);
  assert.deepEqual(blocked.costLines, []);
  assert.match(getCheck(blocked, 'layout').action, /wider|reduce/);
});

test('exact fit uses the entire declared net width; neither direction fitting returns a hold', () => {
  const exact = run({
    quantity: 1,
    colourways: 1,
    rollWidthMm: 100,
    swatchWidthMm: 100,
    swatchHeightMm: 100,
    stockMetres: 0.1,
  });
  assert.equal(exact.utilisation, 100);
  assert.equal(exact.status, 'ready');
  const impossible = run({ rollWidthMm: 100, swatchWidthMm: 101, swatchHeightMm: 101 });
  assert.equal(impossible.status, 'blocked');
  assert.equal(getCheck(impossible, 'stock').state, 'review');
  assert.ok(impossible.layout.alternatives.every((item) => !item.allowed));
});

test('stock comparison handles equality, fractional shortage, zero, and block before review', () => {
  assert.equal(run({ stockMetres: 28.8 }).status, 'ready');
  const short = run({ stockMetres: 28.7999, edge: 'frays' });
  assert.equal(short.status, 'blocked');
  assert.equal(getCheck(short, 'stock').state, 'block');
  assert.equal(getCheck(short, 'edge').state, 'review');
  assert.match(getCheck(short, 'stock').reason, /0\.0001/);
  assert.equal(short.estimatePence, 55710 + 180 * 6 * 8);
  assert.equal(run({ stockMetres: 0 }).status, 'blocked');
});

test('presets cover feasible, production-review and insufficient-stock paths', () => {
  assert.equal(new Set(scenarios.map((item) => item.id)).size, scenarios.length);
  const results = scenarios.map((item) => evaluate(item.brief));
  assert.deepEqual(
    results.map((item) => item.status),
    ['ready', 'review', 'blocked'],
  );
  assert.deepEqual(
    results.map((item) => item.metres),
    [28.8, 17.28, 49.2],
  );
  assert.deepEqual(
    results.map((item) => item.estimatePence),
    [55710, 35252, 94540],
  );
  assert.match(getCheck(results[2], 'stock').reason, /12\.2/);
});

test('validation strictly rejects invalid shapes, missing keys, unknown keys and enums', () => {
  for (const invalid of [null, [], true, undefined, '']) assert.throws(() => evaluate(invalid));
  for (const key of Object.keys(fields)) {
    const missing = { ...base };
    delete missing[key];
    assert.throws(() => evaluate(missing), new RegExp(key));
  }
  assert.throws(() => run({ other: 123 }), /Unknown/);
  assert.throws(() => run({ quantity: '180' }), /quantity/);
  assert.throws(() => run({ grain: 'any' }), /grain/);
  assert.throws(() => run({ edge: 'Stable' }), /edge/);
  assert.throws(() => run({ stockMetres: null }), /stockMetres/);
  assert.throws(() => run({ stockMetres: '34.8' }), /stockMetres/);
});

test('numeric field limits are inclusive and whole fields reject fractional values', () => {
  for (const [key, field] of Object.entries(fields)) {
    if (field.values) continue;
    for (const valid of [field.min, field.max]) assert.doesNotThrow(() => run({ [key]: valid }));
    for (const invalid of [field.min - 1, field.max + 1, Infinity, -Infinity, NaN]) {
      assert.throws(() => run({ [key]: invalid }), new RegExp(key));
    }
    if (field.step === 1) assert.throws(() => run({ [key]: field.min + 0.5 }), new RegExp(key));
  }
});

test('deterministic archive similarity is explainable and independent of current stock', () => {
  const original = run();
  assert.deepEqual(original, run());
  assert.deepEqual(original.matches, run({ stockMetres: 12 }).matches);
  assert.deepEqual(
    original.matches.map((item) => [item.id, item.similarity]),
    [
      ['H-014', 97],
      ['H-031', 92],
      ['H-052', 73],
    ],
  );
  const exact = run({
    quantity: 200,
    colourways: 6,
    swatchWidthMm: 150,
    swatchHeightMm: 210,
    rollWidthMm: 1400,
  });
  assert.equal(exact.matches[0].similarity, 100);
  assert.match(exact.matches[0].reason, /200 books/);
});

test('small-run row counts and chosen length agree with explicitly placing individual swatches', () => {
  const netWidth = 200;
  for (const width of [75, 100, 155, 200, 230]) {
    for (const height of [80, 100, 180, 200, 240]) {
      for (const quantity of [1, 2, 3, 7]) {
        for (const grain of fields.grain.values) {
          const lengths = [];
          const faces =
            grain === 'free'
              ? [
                  [width, height],
                  [height, width],
                ]
              : [[width, height]];
          for (const [acrossMm, alongMm] of faces) {
            if (acrossMm > netWidth) continue;
            let rows = 1;
            let cursor = 0;
            for (let piece = 0; piece < quantity; piece++) {
              if (cursor + acrossMm > netWidth) {
                rows += 1;
                cursor = 0;
              }
              cursor += acrossMm;
            }
            lengths.push((rows * alongMm * 2) / 1000);
          }
          const result = run({
            quantity,
            grain,
            colourways: 2,
            stockMetres: 50,
            rollWidthMm: netWidth,
            swatchWidthMm: width,
            swatchHeightMm: height,
          });
          assert.equal(result.metres, lengths.length ? Math.min(...lengths) : null);
          if (lengths.length) {
            assert.ok(result.utilisation > 0 && result.utilisation <= 100);
            assert.ok(result.costLines.every((line) => Number.isSafeInteger(line.pence)));
          }
        }
      }
    }
  }
});
