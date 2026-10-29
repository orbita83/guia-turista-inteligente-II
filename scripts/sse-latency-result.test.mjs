import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessLatency } from './sse-latency-result.mjs';

const sample = (ms) => ({
  requestAt: 10,
  contentAt: 20,
  screenshotAt: 10 + ms,
  diagnostic: { status: 'sucesso', fallback_utilizado: false },
});

test('C18: captura real em 299 ms aprova; em 300 ms ou 301 ms não certifica', () => {
  assert.equal(assessLatency(sample(299)).exitCode, 0);
  for (const ms of [300, 301]) {
    assert.equal(assessLatency(sample(ms)).exitCode, 1);
    assert.equal(assessLatency(sample(ms)).verdict, 'NOT_CERTIFIED');
  }
});
test('C18: modo controlado, contingência e diagnóstico ausente nunca aprovam', () => {
  assert.equal(assessLatency(sample(50), { controlled: true }).exitCode, 2);
  assert.equal(assessLatency({ ...sample(50), controlled: true }).exitCode, 2);
  assert.equal(
    assessLatency({ ...sample(50), diagnostic: { status: 'fallback', fallback_utilizado: true } })
      .exitCode,
    2,
  );
  assert.equal(assessLatency({ ...sample(50), diagnostic: undefined }).exitCode, 2);
});
test('C18: telemetry sem texto, sem captura ou relógio inválido não certificam', () => {
  for (const invalid of [
    { contentAt: undefined },
    { screenshotAt: undefined },
    { requestAt: NaN },
    { contentAt: 9 },
    { screenshotAt: 19 },
  ])
    assert.equal(assessLatency({ ...sample(50), ...invalid }).exitCode, 2);
});
