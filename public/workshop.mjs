import { createProposal, defaultDraft, ownerRoles, reviewActions } from './lib/proposal.mjs';

const byId = (id) => document.getElementById(id);
const form = byId('proposal-form');
const observation = byId('observation');
const reserve = byId('reserve-percent');
const owner = byId('owner-role');
const action = byId('review-action');
const download = byId('download-proposal');
const summary = byId('result-summary');
let tested;

function addOption(control, value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  control.append(option);
}

for (const role of ownerRoles) addOption(owner, role, role);
for (const [key, label] of Object.entries(reviewActions)) addOption(action, key, label);
observation.value = defaultDraft.observation;
reserve.value = defaultDraft.reservePercent;
owner.value = defaultDraft.ownerRole;
action.value = defaultDraft.reviewAction;

const metres = (value) =>
  value === null
    ? 'Unavailable'
    : value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' m';
const decision = { ready: 'Ready', review: 'Review', blocked: 'Blocked' };

function caseCard(item) {
  const card = byId('case-template').content.firstElementChild.cloneNode(true);
  card.id = 'case-' + item.id;
  card.dataset.passed = String(item.passed);
  card.querySelector('h3').textContent = item.label;
  const pass = card.querySelector('.case-pass');
  pass.textContent = item.passed ? 'Pass' : 'Fail';
  pass.classList.add(item.passed ? 'pass' : 'block');
  card.querySelector('.case-expected').textContent = item.expectation;
  card.querySelector('.case-stock').textContent = metres(item.brief.stockMetres);
  card.querySelector('.case-before').textContent =
    metres(item.before.metres) + ' · ' + decision[item.before.status];
  card.querySelector('.case-after').textContent =
    metres(item.after.metres) + ' · ' + decision[item.after.status];
  let note = item.after.action;
  if (!item.passed && item.id === 'boundary')
    note =
      'The allowance fits available stock, so the proposed reserve check does not flag this case.';
  card.querySelector('.case-action').textContent = note;
  return card;
}

function run(announce = true) {
  const draft = {
    observation: observation.value,
    reservePercent: reserve.valueAsNumber,
    ownerRole: owner.value,
    reviewAction: action.value,
  };
  try {
    tested = createProposal(draft);
  } catch (err) {
    byId('draft-message').textContent = err.message;
    if (!observation.value.trim()) observation.focus();
    return;
  }
  byId('draft-message').textContent = '';
  const allPass = tested.passedCount === tested.cases.length;
  summary.textContent = tested.passedCount + ' of ' + tested.cases.length + ' checks passed';
  summary.className = 'pill ' + (allPass ? 'pass' : 'review-state');
  byId('rule-text').textContent = tested.proposedRule;
  byId('case-results').replaceChildren(...tested.cases.map(caseCard));
  byId('proposal-status').textContent = allPass ? 'Awaiting production review' : 'Revision needed';
  byId('proposal-next').textContent =
    'For review by the ' +
    tested.ownerRole.toLowerCase() +
    ' against workbench v' +
    tested.baseRulesVersion +
    '.';
  byId('tested-result').hidden = false;
  byId('pending-result').hidden = true;
  download.disabled = false;
  if (announce)
    byId('result-update').textContent =
      summary.textContent + '. ' + byId('proposal-status').textContent + '.';
}

function markDirty() {
  if (!tested) return;
  tested = null;
  download.disabled = true;
  byId('tested-result').hidden = true;
  byId('pending-result').hidden = false;
  summary.className = 'pill neutral';
  summary.textContent = 'Untested edit';
  byId('result-update').textContent = 'Draft changed. Test the proposal to compare cases.';
  byId('draft-message').textContent = '';
}

form.addEventListener('input', markDirty);
form.addEventListener('change', markDirty);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (form.reportValidity()) run();
});

download.addEventListener('click', () => {
  if (!tested) return;
  const file = new Blob([JSON.stringify(tested, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'selvedge-trial-reserve-draft.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  byId('result-update').textContent = 'Rule proposal downloaded as JSON.';
});

run(false);
