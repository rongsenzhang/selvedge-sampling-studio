import { getAiWorkspace, requestAiDraft } from './lib/ai-client.mjs';
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
let acceptedAssistance = null;

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
    if (
      acceptedAssistance &&
      acceptedAssistance.draft.observation === tested.observation &&
      acceptedAssistance.draft.suggestedPercent === tested.reservePercent
    ) {
      tested.draftingAssistance = acceptedAssistance;
    }
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

const generate = byId('ai-generate');
const adopt = byId('ai-adopt');
const sourceNames = {
  'trial-reserve': 'Trial reserve within scope',
  'needs-clarification': 'Clarification needed',
  'out-of-scope': 'Outside the trial-reserve model',
};
let workspace;
let suggestion = null;
let activeRequest = null;

function aiMessage(text, isError = false) {
  byId('ai-message').textContent = text;
  byId('ai-message').dataset.state = isError ? 'error' : '';
}

function resetAssistant(preserveAdoption = false) {
  activeRequest?.abort();
  activeRequest = null;
  suggestion = null;
  if (!preserveAdoption) acceptedAssistance = null;
  byId('ai-output').hidden = true;
  generate.disabled = false;
  generate.textContent = 'Generate a draft';
  generate.removeAttribute('aria-busy');
  aiMessage('');
}

function addFinding(label, value) {
  const term = document.createElement('dt');
  term.textContent = label;
  const definition = document.createElement('dd');
  if (Array.isArray(value)) {
    const list = document.createElement('ul');
    for (const item of value) {
      const li = document.createElement('li');
      li.textContent = item;
      list.append(li);
    }
    definition.append(list);
  } else {
    definition.textContent = value;
  }
  byId('ai-findings').append(term, definition);
}

function presentSuggestion(item) {
  suggestion = item;
  const { draft } = item;
  byId('ai-source').textContent = sourceNames[draft.scope];
  const recorded = item.origin === 'recorded';
  const when = recorded
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(item.generatedAt),
      )
    : '';
  byId('ai-provenance').textContent = recorded
    ? 'Recorded OpenAI response · ' + item.model + ' · ' + when + ' UTC'
    : 'Live OpenAI response to this observation.';
  byId('ai-findings').replaceChildren();
  addFinding('Evidence in the observation', '“' + draft.evidenceQuote + '”');
  addFinding('Condition', draft.condition);
  addFinding('Suggested follow-up', draft.action);
  addFinding('Questions for the operator', draft.questions);
  addFinding('Counterexample to test', draft.counterexample);
  adopt.hidden = draft.scope !== 'trial-reserve' || draft.suggestedPercent === null;
  adopt.disabled = false;
  if (!adopt.hidden) adopt.textContent = 'Use ' + draft.suggestedPercent + '% in the draft';
  byId('ai-output').hidden = false;
  aiMessage(
    recorded ? 'Recorded example loaded for inspection.' : 'Draft received for your review.',
  );
}

observation.addEventListener('input', () => resetAssistant());
reserve.addEventListener('input', () => {
  acceptedAssistance = null;
  if (suggestion) adopt.disabled = false;
});

generate.addEventListener('click', async () => {
  if (!workspace?.endpoint || activeRequest) return;
  const text = observation.value.trim();
  if (text.length < 12 || text.length > 500) {
    aiMessage('Enter a synthetic observation between 12 and 500 characters.', true);
    observation.focus();
    return;
  }
  // Requesting an interpretation leaves earlier, explicitly adopted settings intact.
  resetAssistant(true);
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 35000);
  generate.disabled = true;
  generate.textContent = 'Generating…';
  generate.setAttribute('aria-busy', 'true');
  aiMessage('Requesting a draft for this observation…');
  try {
    const draft = await requestAiDraft(workspace.endpoint, text, controller.signal);
    if (activeRequest === controller && text === observation.value.trim()) {
      presentSuggestion({ origin: 'live', draft });
    }
  } catch (error) {
    if (activeRequest !== controller) return;
    const reason = controller.signal.aborted
      ? 'The assistant timed out.'
      : error instanceof TypeError
        ? 'The AI service could not be reached.'
        : error.message;
    aiMessage(reason + ' You can still test the rule manually.', true);
  } finally {
    clearTimeout(timeout);
    if (activeRequest === controller) {
      activeRequest = null;
      generate.disabled = false;
      generate.textContent = 'Generate a draft';
      generate.removeAttribute('aria-busy');
    }
  }
});

byId('ai-load').addEventListener('click', () => {
  const item = workspace?.examples[Number(byId('ai-example').value)];
  if (!item) return;
  resetAssistant();
  observation.value = item.draft.observation;
  markDirty();
  presentSuggestion({ origin: 'recorded', ...item });
});

adopt.addEventListener('click', () => {
  if (
    !suggestion ||
    suggestion.draft.scope !== 'trial-reserve' ||
    suggestion.draft.suggestedPercent === null ||
    suggestion.draft.observation !== observation.value.trim()
  )
    return;
  reserve.value = String(suggestion.draft.suggestedPercent);
  acceptedAssistance = { ...suggestion, acceptedField: 'reservePercent' };
  markDirty();
  adopt.disabled = true;
  aiMessage(
    'The draft now uses ' + reserve.value + '%. Select Test proposal to check the three cases.',
  );
});

getAiWorkspace().then((settings) => {
  workspace = settings;
  generate.hidden = !settings.endpoint;
  byId('ai-mode').textContent = settings.endpoint
    ? 'Generate a draft to send only the fictional observation above to OpenAI. Keep business and personal details out.'
    : settings.examples.length
      ? 'Explore a recorded OpenAI response or continue manually. Live generation is unavailable on this page.'
      : 'Live drafting is unavailable on this deployment. Set the reserve below to test a rule manually.';
  if (!settings.examples.length) return;
  const selector = byId('ai-example');
  settings.examples.forEach(({ draft }, index) => {
    const label = sourceNames[draft.scope] + ' · ' + draft.observation;
    addOption(selector, String(index), label);
  });
  byId('ai-examples').hidden = false;
});
