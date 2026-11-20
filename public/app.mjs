import { fields, rules, scenarios } from './lib/engine.mjs';
import { analyse, getMode, listRecords, saveRecord, subscribeRecords } from './lib/store.mjs';
import { drawLayout } from './diagram.mjs';

const byId = (id) => document.getElementById(id);
const form = byId('brief-form');
const select = byId('scenario');
const canvas = byId('cut-canvas');
const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const decimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 });
const stamp = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const states = {
  ready: ['Ready for review', 'ready'],
  review: ['Review needed', 'review-state'],
  blocked: ['On hold', 'blocked'],
};
const checkStates = {
  pass: ['Pass', 'pass'],
  review: ['Review', 'review-state'],
  block: ['Hold', 'block'],
};

let scenario = scenarios[0];
let current = null;
let revision = 0;
let timer;
let saving = false;
let lastSaved = null;
let pendingSave = null;
let records = [];
let listRevision = 0;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function setBanner(message = '') {
  byId('error-banner').textContent = message;
  byId('error-banner').hidden = !message;
}
function fieldValues() {
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]) => {
      const input = form.elements.namedItem(name);
      return [name, field.values ? input.value : input.valueAsNumber];
    }),
  );
}
function clearSaved() {
  pendingSave = null;
  lastSaved = null;
  byId('last-export').hidden = true;
  byId('save-message').textContent = '';
}
function syncSave() {
  byId('save').disabled = saving || !current || !!lastSaved;
  byId('save').textContent = saving ? 'Saving…' : lastSaved ? 'Review saved' : 'Save review';
}
function metric(id, value, unit) {
  const node = byId(id);
  node.replaceChildren(document.createTextNode(value ?? '—'));
  if (value !== null && unit) node.append(element('span', unit, 'unit'));
}
function showChart(message) {
  drawLayout(canvas, current?.brief, current?.result, message);
}
function clearAnalysis(label) {
  current = null;
  syncSave();
  byId('plan-status').className = 'pill neutral';
  byId('plan-status').textContent = label;
  for (const id of ['required', 'yield', 'estimate']) metric(id, null);
  for (const id of [
    'options',
    'rule-checks',
    'matches',
    'cost-lines',
    'plot-scale',
    'diagram-orientation',
  ])
    byId(id).replaceChildren();
  byId('plan-context').textContent = label;
  byId('live-analysis').textContent = label;
  showChart(label);
}
function renderChecks(result) {
  const items = result.checks.map((check) => {
    const wrap = element('div', undefined, 'check');
    const head = element('div', undefined, 'check-head');
    const [text, cls] = checkStates[check.state];
    head.append(element('strong', check.title), element('span', text, 'check-glyph ' + cls));
    wrap.append(head, element('p', check.reason));
    if (check.state !== 'pass') wrap.append(element('p', check.action, 'next-action'));
    return wrap;
  });
  byId('rule-checks').replaceChildren(...items);
}
function renderEvidence(result) {
  const alternatives = result.layout.alternatives.map((option) => {
    const chosen = result.layout.orientation === option.orientation;
    const title = option.orientation === 'rotated' ? 'Rotated 90°' : 'Original direction';
    const row = element('div', undefined, 'opt-row');
    const selection = chosen ? ' · selected' : '';
    row.append(
      element(
        'strong',
        title +
          (option.allowed ? ' · ' + decimal.format(option.metres) + ' m' : ' · unavailable') +
          selection,
      ),
      element('p', option.reason),
    );
    return row;
  });
  byId('options').replaceChildren(
    element(
      'p',
      'Each colourway uses one orientation. The planner selects the shortest feasible total.',
    ),
    ...alternatives,
  );
  const amounts = result.costLines.map((line) => priceRow(line.label, line.pence));
  if (result.estimatePence !== null)
    amounts.push(priceRow('Illustrative total', result.estimatePence, true));
  else amounts.push(element('p', 'A cost estimate requires a feasible cut.'));
  byId('cost-lines').replaceChildren(
    ...amounts,
    element(
      'p',
      'Planning estimate for the cut run. Cover, binding, delivery and VAT are outside this model.',
    ),
  );
  const jobs = result.matches.map((match) => {
    const row = element('div', undefined, 'job-row');
    row.append(
      element('strong', match.id + ' · ' + match.label),
      element('p', match.similarity + '% similarity. ' + match.reason),
    );
    return row;
  });
  byId('matches').replaceChildren(
    element(
      'p',
      'Three nearest synthetic briefs, ranked by quantity, dimensions, grain and edge behaviour.',
    ),
    ...jobs,
  );
}
function priceRow(label, pence, total = false) {
  const row = element('div', undefined, 'price-row' + (total ? ' price-total' : ''));
  row.append(element('span', label), element('span', money.format(pence / 100)));
  return row;
}
function render() {
  const { brief, result } = current;
  const layout = result.layout;
  const [status, cls] = states[result.status];
  byId('plan-status').textContent = status;
  byId('plan-status').className = 'pill ' + cls;
  metric('required', result.metres === null ? null : decimal.format(result.metres), 'm');
  metric('yield', result.utilisation === null ? null : decimal.format(result.utilisation), '%');
  metric(
    'estimate',
    result.estimatePence === null ? null : money.format(result.estimatePence / 100),
  );
  byId('plot-scale').textContent = layout.across ? layout.across + ' across' : '';
  byId('diagram-orientation').textContent = layout.orientation
    ? layout.orientation === 'rotated'
      ? '90° rotation'
      : 'Original direction'
    : '';
  byId('plan-context').textContent =
    decimal.format(brief.quantity * brief.colourways) +
    ' swatches · ' +
    brief.colourways +
    ' colourways · rules v' +
    result.rulesVersion;
  byId('live-analysis').textContent =
    status +
    '. ' +
    (result.metres === null
      ? 'No feasible layout.'
      : decimal.format(result.metres) + ' metres required.');
  renderChecks(result);
  renderEvidence(result);
  showChart();
  syncSave();
}
function changed({ immediate = false } = {}) {
  const version = ++revision;
  clearTimeout(timer);
  clearSaved();
  setBanner();
  const brief = fieldValues();
  const custom = Object.keys(fields).some((key) => brief[key] !== scenario.brief[key]);
  byId('restore').disabled = !custom;
  byId('edit-state').textContent = custom ? 'Edited brief' : 'Example values';
  const invalid = Array.from(form.elements).find(
    (control) => control.willValidate && !control.validity.valid,
  );
  if (invalid) {
    const field = fields[invalid.name];
    const type = field.step === 1 ? 'whole number' : 'number';
    clearAnalysis('Check input');
    setBanner(
      'Enter a ' +
        type +
        ' between ' +
        field.min +
        ' and ' +
        decimal.format(field.max) +
        ' for ' +
        field.label.toLowerCase() +
        '.',
    );
    return;
  }
  clearAnalysis('Updating layout');
  const calculate = async () => {
    try {
      const result = await analyse(brief);
      if (revision !== version) return;
      current = { brief, result };
      render();
    } catch (error) {
      if (revision !== version) return;
      clearAnalysis('Calculation unavailable');
      setBanner('The brief could not be analysed. ' + error.message);
    }
  };
  if (immediate) calculate();
  else timer = setTimeout(calculate, 130);
}
function loadScenario() {
  scenario = scenarios.find((item) => item.id === select.value) ?? scenarios[0];
  for (const [name, value] of Object.entries(scenario.brief))
    form.elements.namedItem(name).value = value;
  byId('scenario-description').textContent = scenario.description;
  byId('note').value = '';
  changed({ immediate: true });
}
function exportRecord(record) {
  const data = JSON.stringify(
    {
      schema: 'selvedge.review.v1',
      source: 'Independent demonstration; synthetic inputs and illustrative GBP.',
      record,
    },
    null,
    2,
  );
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const link = element('a');
  link.href = url;
  link.download = 'selvedge-review-' + record.id + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderLog() {
  const rows = records.map((record) => {
    const row = element('article', undefined, 'record-item');
    const source = scenarios.find((item) => item.id === record.scenarioId)?.name ?? 'Custom brief';
    const time = new Date(record.createdAt);
    const date = Number.isNaN(time.getTime()) ? record.createdAt : stamp.format(time);
    const name =
      source +
      (scenarios.some(
        (item) =>
          item.id === record.scenarioId &&
          Object.keys(fields).some((key) => record.brief[key] !== item.brief[key]),
      )
        ? ' (edited)'
        : '');
    row.append(
      element('h3', name),
      element(
        'p',
        date + ' · ' + states[record.result.status][0] + ' · ' + record.brief.quantity + ' books',
      ),
    );
    if (record.note) row.append(element('p', record.note));
    const button = element('button', 'Download JSON', 'text-button');
    button.type = 'button';
    button.addEventListener('click', () => exportRecord(record));
    row.append(button);
    return row;
  });
  byId('log-entries').replaceChildren(
    ...(rows.length
      ? rows
      : [
          element(
            'p',
            'No saved reviews yet. Save a brief and your decision to start the log.',
            'empty-log',
          ),
        ]),
  );
}
async function refreshLog() {
  const version = ++listRevision;
  try {
    const latest = await listRecords();
    if (listRevision !== version) return;
    records = [...latest].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    byId('record-count').textContent = String(records.length);
    renderLog();
  } catch {
    if (listRevision !== version) return;
    byId('record-count').textContent = '–';
    byId('log-entries').replaceChildren(
      element(
        'p',
        'Saved reviews could not be loaded. Check your storage or connection and reopen the log.',
        'empty-log',
      ),
    );
  }
}
function savePayload() {
  const note = byId('note').value;
  pendingSave ??= {
    requestId: crypto.randomUUID(),
    brief: current.brief,
    scenarioId: scenario.id,
    note,
  };
  return pendingSave;
}
async function save() {
  if (!current || saving || lastSaved) return;
  const version = revision;
  const note = byId('note').value;
  saving = true;
  syncSave();
  try {
    const record = await saveRecord(savePayload());
    if (version === revision && note === byId('note').value) {
      lastSaved = record;
      byId('last-export').hidden = false;
      byId('save-message').textContent =
        'Review saved to the log. The snapshot includes this brief, rule checks and estimate.';
    }
    await refreshLog();
  } catch (error) {
    if (version === revision)
      byId('save-message').textContent = 'Could not save this review. ' + error.message;
  } finally {
    saving = false;
    syncSave();
  }
}
function openCosts() {
  if (location.hash === '#costs') byId('costs').open = true;
}
function init() {
  for (const [name, field] of Object.entries(fields)) {
    if (field.values) continue;
    const control = form.elements.namedItem(name);
    control.min = field.min;
    control.max = field.max;
    control.step = field.step;
  }
  select.replaceChildren(...scenarios.map((item) => new Option(item.name, item.id)));
  select.disabled = false;
  select.addEventListener('change', loadScenario);
  byId('restore').addEventListener('click', loadScenario);
  form.addEventListener('input', () => changed());
  form.addEventListener('submit', (event) => event.preventDefault());
  byId('note').addEventListener('input', () => {
    clearSaved();
    syncSave();
  });
  byId('save').addEventListener('click', save);
  byId('last-export').addEventListener('click', () => {
    if (lastSaved) exportRecord(lastSaved);
  });
  byId('open-log').addEventListener('click', () => {
    refreshLog();
    byId('log-dialog').showModal();
  });
  byId('close-log').addEventListener('click', () => byId('log-dialog').close());
  byId('log-dialog').addEventListener('click', (event) => {
    if (event.target === byId('log-dialog')) byId('log-dialog').close();
  });
  const local = getMode() === 'browser';
  byId('storage-info').textContent = local
    ? 'Save a snapshot in this browser, including briefs on hold. Use fictional details only.'
    : 'Save a snapshot to this server’s shared review log. Use fictional details only.';
  byId('log-scope').textContent = local
    ? 'Saved on this device in this browser. Download a JSON snapshot to share it.'
    : 'Shared by users of this server. Download a JSON snapshot to share it.';
  const register = element('details');
  register.append(element('summary', 'Rule sources and assumptions'));
  const body = element('div', undefined, 'detail-body');
  for (const rule of rules) {
    const row = element('div', undefined, 'job-row');
    row.append(element('strong', rule.title), element('p', rule.source), element('p', rule.action));
    if (rule.sourceUrl) {
      const source = element('a', 'Manufacturer’s public product page');
      source.href = rule.sourceUrl;
      row.append(source);
    }
    body.append(row);
  }
  register.append(body);
  document.querySelector('.details-stack').append(register);
  const observer = new ResizeObserver(() =>
    showChart(current ? undefined : byId('plan-status').textContent),
  );
  observer.observe(canvas);
  document.fonts.ready.then(() => showChart(current ? undefined : byId('plan-status').textContent));
  window.addEventListener('hashchange', openCosts);
  document.querySelector('.plan-foot a').addEventListener('click', () => {
    byId('costs').open = true;
  });
  openCosts();
  loadScenario();
  refreshLog();
  subscribeRecords(refreshLog);
}
init();
