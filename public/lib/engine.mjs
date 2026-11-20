// Shared by the browser and HTTP API. Money is in pence; cutting arithmetic is in mm.
export const rulesVersion = '1.0.0';

export const fields = {
  quantity: { label: 'Books', unit: 'books', min: 1, max: 10000, step: 1 },
  colourways: { label: 'Colourways', unit: 'colourways', min: 1, max: 100, step: 1 },
  swatchWidthMm: { label: 'Swatch width', unit: 'mm', min: 20, max: 1000, step: 1 },
  swatchHeightMm: { label: 'Swatch height', unit: 'mm', min: 20, max: 1000, step: 1 },
  rollWidthMm: { label: 'Usable roll width', unit: 'mm', min: 100, max: 5000, step: 1 },
  stockMetres: { label: 'Available stock', unit: 'm', min: 0, max: 1000000, step: 'any' },
  grain: { label: 'Grain direction', values: ['free', 'locked'] },
  edge: { label: 'Edge behaviour', values: ['stable', 'frays'] },
};

export const scenarios = [
  {
    id: 'studio-linen',
    name: 'Studio linen collection',
    description: 'Compare two cut directions for a six-colour fabric book.',
    brief: {
      quantity: 180,
      colourways: 6,
      swatchWidthMm: 160,
      swatchHeightMm: 220,
      rollWidthMm: 1400,
      stockMetres: 34,
      grain: 'free',
      edge: 'stable',
    },
  },
  {
    id: 'archive-weave',
    name: 'Archive weave collection',
    description: 'Keep the grain upright and review a cut edge that frays.',
    brief: {
      quantity: 120,
      colourways: 4,
      swatchWidthMm: 195,
      swatchHeightMm: 240,
      rollWidthMm: 1380,
      stockMetres: 24,
      grain: 'locked',
      edge: 'frays',
    },
  },
  {
    id: 'short-roll',
    name: 'Short-roll launch',
    description: 'Check whether the available stock can cover an eight-colour run.',
    brief: {
      quantity: 240,
      colourways: 8,
      swatchWidthMm: 155,
      swatchHeightMm: 205,
      rollWidthMm: 1370,
      stockMetres: 37,
      grain: 'free',
      edge: 'stable',
    },
  },
];

export const rules = [
  {
    id: 'layout',
    title: 'Whole swatches per roll',
    source: 'Demonstration geometry for rectangular fabric swatches.',
    action:
      'Compare whole-piece rows in each permitted orientation. Keep the shortest feasible plan.',
  },
  {
    id: 'grain',
    title: 'Respect the grain',
    source: 'Illustrative production constraint supplied with each synthetic brief.',
    action: 'Keep the swatch height along the roll when the grain is locked.',
  },
  {
    id: 'stock',
    title: 'Stock per colourway',
    source: 'Demonstration inventory model with one equal-length roll per colourway.',
    action: 'Hold the job if an individual colourway cannot supply its complete run.',
  },
  {
    id: 'edge',
    title: 'Edge treatment review',
    source:
      'Pike publishes guidance on edge treatment for durability. The review trigger is a demo assumption.',
    sourceUrl: 'https://www.pike-textiles.com/products/fabric-books/',
    action: 'Ask production to approve the edge finish on a physical sample when the edge frays.',
  },
];

// Illustrative job cards. Each vector is a made-up prior brief, never a client record.
const archive = [
  {
    id: 'H-014',
    label: 'Plain weave presentation book',
    quantity: 200,
    colourways: 6,
    swatchWidthMm: 150,
    swatchHeightMm: 210,
    rollWidthMm: 1400,
    grain: 'free',
    edge: 'stable',
  },
  {
    id: 'H-027',
    label: 'Directional weave sample book',
    quantity: 100,
    colourways: 4,
    swatchWidthMm: 200,
    swatchHeightMm: 250,
    rollWidthMm: 1400,
    grain: 'locked',
    edge: 'frays',
  },
  {
    id: 'H-031',
    label: 'Eight-colour showroom edition',
    quantity: 250,
    colourways: 8,
    swatchWidthMm: 160,
    swatchHeightMm: 200,
    rollWidthMm: 1350,
    grain: 'free',
    edge: 'stable',
  },
  {
    id: 'H-045',
    label: 'Wide-format directional collection',
    quantity: 60,
    colourways: 12,
    swatchWidthMm: 280,
    swatchHeightMm: 350,
    rollWidthMm: 1500,
    grain: 'locked',
    edge: 'stable',
  },
  {
    id: 'H-052',
    label: 'Open-weave furnishing range',
    quantity: 320,
    colourways: 9,
    swatchWidthMm: 180,
    swatchHeightMm: 210,
    rollWidthMm: 1370,
    grain: 'free',
    edge: 'frays',
  },
  {
    id: 'H-063',
    label: 'Narrow-roll textile portfolio',
    quantity: 100,
    colourways: 3,
    swatchWidthMm: 110,
    swatchHeightMm: 185,
    rollWidthMm: 600,
    grain: 'locked',
    edge: 'stable',
  },
];

function validate(brief) {
  if (brief === null || typeof brief !== 'object' || Array.isArray(brief)) {
    throw new Error('Provide a brief with all eight specification fields.');
  }
  const extra = Object.keys(brief).find((key) => !Object.hasOwn(fields, key));
  if (extra) throw new Error('Unknown specification field: ' + extra);
  for (const [key, field] of Object.entries(fields)) {
    if (!Object.hasOwn(brief, key)) throw new Error('Missing specification field: ' + key);
    const value = brief[key];
    if (field.values) {
      if (!field.values.includes(value))
        throw new Error(key + ' must be one of: ' + field.values.join(', '));
    } else {
      const numberType = field.step === 1 ? Number.isInteger : Number.isFinite;
      if (!numberType(value) || value < field.min || value > field.max) {
        const type = field.step === 1 ? 'a whole number' : 'a finite number';
        throw new Error(
          key + ' must be ' + type + ' between ' + field.min + ' and ' + field.max + '.',
        );
      }
    }
  }
}

function candidate(brief, orientation) {
  const rotated = orientation === 'rotated';
  const partWidth = rotated ? brief.swatchHeightMm : brief.swatchWidthMm;
  const rowLength = rotated ? brief.swatchWidthMm : brief.swatchHeightMm;
  const across = Math.floor(brief.rollWidthMm / partWidth);
  const proposal = {
    orientation,
    allowed: false,
    across,
    metres: null,
    rowsPerColour: 0,
    perColourMetres: null,
    reason: '',
  };
  if (rotated && brief.grain === 'locked') {
    proposal.reason = 'The brief requires the swatch height to run along the roll.';
  } else if (across === 0) {
    proposal.reason =
      'The cross-roll span of ' +
      partWidth +
      ' mm exceeds the usable width of ' +
      brief.rollWidthMm +
      ' mm.';
  } else {
    proposal.allowed = true;
    proposal.rowsPerColour = Math.ceil(brief.quantity / across);
    const lengthMm = proposal.rowsPerColour * rowLength;
    proposal.perColourMetres = lengthMm / 1000;
    proposal.metres = (lengthMm * brief.colourways) / 1000;
    proposal.reason = across + ' across, ' + proposal.rowsPerColour + ' full rows per colourway.';
  }
  return proposal;
}

function check(id, state, reason, action) {
  return { id, title: rules.find((rule) => rule.id === id).title, state, reason, action };
}

function checksFor(brief, selected) {
  const result = [
    check(
      'layout',
      selected ? 'pass' : 'block',
      selected
        ? 'The ' + selected.orientation + ' layout uses ' + selected.metres + ' m in complete rows.'
        : 'No permitted orientation fits the supplied usable width.',
      selected
        ? 'Use the row plan for the next review.'
        : 'Choose wider usable stock or reduce the swatch size. Revisit the grain only with design approval.',
    ),
    check(
      'grain',
      'pass',
      brief.grain === 'locked'
        ? 'The grain is locked. Rotation is excluded.'
        : 'The brief permits a 90-degree rotation.',
      brief.grain === 'locked'
        ? 'Keep the marked swatch height parallel to the roll.'
        : 'Check the selected direction against the physical sample.',
    ),
  ];
  if (!selected) {
    result.push(
      check(
        'stock',
        'review',
        'Stock demand awaits a feasible row plan.',
        'Resolve the layout and recalculate.',
      ),
    );
  } else if (brief.stockMetres < selected.metres) {
    const roundedShortage = Number((selected.metres - brief.stockMetres).toFixed(6));
    const shortage = roundedShortage || 'less than 0.000001';
    result.push(
      check(
        'stock',
        'block',
        'Available stock falls short by ' + shortage + ' m across all colourways.',
        'Source at least ' + selected.perColourMetres + ' m per colourway or reduce the run.',
      ),
    );
  } else {
    result.push(
      check(
        'stock',
        'pass',
        'Each colourway needs ' +
          selected.perColourMetres +
          ' m. Total stock covers the run under the equal-roll assumption.',
        'Confirm actual lengths by colourway before releasing a production job.',
      ),
    );
  }
  result.push(
    check(
      'edge',
      brief.edge === 'frays' ? 'review' : 'pass',
      brief.edge === 'frays'
        ? 'The declared fabric edge frays. The finishing route needs a physical trial.'
        : 'The brief describes the edge as stable.',
      brief.edge === 'frays'
        ? 'Request a sample cut and record the agreed edge finish.'
        : 'Verify the edge on the first sample.',
    ),
  );
  return result;
}

function costBreakdown(brief, demandMm) {
  const pieces = brief.quantity * brief.colourways;
  const lines = [
    { label: 'Illustrative material · £11.50/m', pence: Math.round((demandMm * 1150) / 1000) },
    { label: 'Cutting · £0.18/swatch', pence: pieces * 18 },
    { label: 'Setup · £24 + £1.25/colourway', pence: 2400 + brief.colourways * 125 },
  ];
  if (brief.edge === 'frays') {
    lines.push({ label: 'Provisional edge allowance · £0.08/swatch', pence: pieces * 8 });
  }
  return lines;
}

// Relative differences keep the ranking independent of millimetres versus metres.
// Stock is omitted because the archive describes jobs, not today's stock position.
const similarityWeights = {
  quantity: 15,
  colourways: 10,
  swatchWidthMm: 15,
  swatchHeightMm: 15,
  rollWidthMm: 10,
  grain: 20,
  edge: 15,
};

function findMatches(brief) {
  return archive
    .map((job) => {
      let score = 0;
      for (const [key, weight] of Object.entries(similarityWeights)) {
        const similarity =
          typeof brief[key] === 'number'
            ? Math.min(brief[key], job[key]) / Math.max(brief[key], job[key])
            : Number(brief[key] === job[key]);
        score += weight * similarity;
      }
      const reason =
        job.swatchWidthMm +
        ' × ' +
        job.swatchHeightMm +
        ' mm, ' +
        job.colourways +
        ' colourways, ' +
        job.quantity +
        ' books. Grain ' +
        (brief.grain === job.grain ? 'matches' : 'differs') +
        ' and edge behaviour ' +
        (brief.edge === job.edge ? 'matches' : 'differs') +
        '.';
      return { id: job.id, label: job.label, reason, score };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map(({ score, ...job }) => ({ ...job, similarity: Math.round(score) }));
}

export function evaluate(brief) {
  validate(brief);
  const alternatives = [candidate(brief, 'standard'), candidate(brief, 'rotated')];
  // Keep standard on equal length so an unnecessary rotation is never introduced.
  const selected = alternatives.reduce((best, proposal) => {
    if (proposal.allowed && (!best || proposal.metres < best.metres)) return proposal;
    return best;
  }, null);
  const checks = checksFor(brief, selected);
  const status = checks.some((item) => item.state === 'block')
    ? 'blocked'
    : checks.some((item) => item.state === 'review')
      ? 'review'
      : 'ready';
  const demandMm = selected ? Math.round(selected.metres * 1000) : null;
  const pieceArea = brief.quantity * brief.colourways * brief.swatchWidthMm * brief.swatchHeightMm;
  const utilisation = selected
    ? Number(((100 * pieceArea) / (brief.rollWidthMm * demandMm)).toFixed(2))
    : null;
  const costLines = selected ? costBreakdown(brief, demandMm) : [];
  return {
    status,
    layout: {
      orientation: selected?.orientation ?? null,
      across: selected?.across ?? 0,
      rowsPerColour: selected?.rowsPerColour ?? 0,
      alternatives,
    },
    metres: selected?.metres ?? null,
    utilisation,
    estimatePence: selected ? costLines.reduce((sum, line) => sum + line.pence, 0) : null,
    costLines,
    checks,
    matches: findMatches(brief),
    rulesVersion,
  };
}
