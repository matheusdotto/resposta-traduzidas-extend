const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
require('../src/interview-prompt.js');
const { buildRequest } = require('../src/answers.js');
const base = { latest: 'Explique o produto.', theirLanguage: 'en', myLanguage: 'pt-BR' };

test('prompt personalizado substitui currículo original, incluindo campo vazio', () => {
  const custom = buildRequest({ ...base, interviewPrompt: 'Conheço o produto Atlas e trabalho com suporte.', context: 'Reunião com cliente.' });
  const text = custom.systemInstruction.parts[0].text;
  assert.match(text, /produto Atlas/);
  assert.match(text, /Reunião com cliente/);
  assert.doesNotMatch(text, /Matheus|Bradesco|Mainframe B4/);
  const empty = buildRequest({ ...base, interviewPrompt: '' }).systemInstruction.parts[0].text;
  assert.doesNotMatch(empty, /Matheus|Bradesco/);
  assert.match(buildRequest(base).systemInstruction.parts[0].text, /Sou Matheus Otto/);
});

function options(initial) {
  const elements = new Map();
  const writes = [];
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, { value: '', events: {}, addEventListener(name, fn) { this.events[name] = fn; } });
    return elements.get(id);
  };
  const state = { ...initial };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../options.js'), 'utf8'), {
    document: { getElementById },
    RespostasInterviewPrompt: 'PROMPT ORIGINAL',
    chrome: { storage: { local: {
      get: async () => ({ ...state }),
      set: async data => { writes.push(data); Object.assign(state, data); },
    } } },
  });
  return { get: getElementById, writes, state };
}

test('configurações migram prompt antigo, salvam personalização e restauram original', async () => {
  const h = options({ apiKey: 'gemini', openaiKey: 'openai', context: 'detalhes' });
  await Promise.resolve();
  assert.equal(h.get('interview-prompt').value, 'PROMPT ORIGINAL');
  h.get('interview-prompt').value = 'MEU CONTEXTO';
  await h.get('interview-prompt').events.input();
  assert.equal(h.state.interviewPrompt, 'MEU CONTEXTO');
  assert.equal(Object.keys(h.writes[0]).join(), 'interviewPrompt');
  assert.equal(h.state.apiKey, 'gemini');
  await h.get('restore-prompt').events.click();
  assert.equal(h.state.interviewPrompt, 'PROMPT ORIGINAL');
  assert.equal(h.state.context, 'detalhes');
});

test('prompt vazio e prompt personalizado persistem após reabrir configurações', async () => {
  for (const value of ['', 'CONTEXTO SALVO']) {
    const h = options({ interviewPrompt: value });
    await Promise.resolve();
    assert.equal(h.get('interview-prompt').value, value);
  }
});
