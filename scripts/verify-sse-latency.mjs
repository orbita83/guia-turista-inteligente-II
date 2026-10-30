import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { assessLatency } from './sse-latency-result.mjs';

function diagnosticFromSse(body) {
  for (const frame of body.split(/\r?\n\r?\n/)) {
    const lines = frame.split(/\r?\n/);
    if (!lines.some((line) => line.trim() === 'event: done')) continue;
    const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    try {
      return JSON.parse(data).diagnostico_ia;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5173' },
    chromium: { type: 'string' },
    output: { type: 'string' },
    controlled: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '150000' },
    help: { type: 'boolean', default: false },
  },
});
if (values.help) {
  console.log(
    'node scripts/verify-sse-latency.mjs [--url URL] [--chromium BIN] [--output DIR] [--controlled] [--timeout MS]\nExecuta visitante Recife/PE → Olinda/PE e clica Retransmitir. Pode consumir duas gerações Gemini.\n0: captura real <300 ms; 1: prazo não certificado; 2: bloqueado (inclui modo controlado).',
  );
  process.exit(0);
}
const timeout = Number(values.timeout);
if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('timeout deve ser positivo.');
const output = values.output || join(tmpdir(), `guia-sse-${Date.now()}`);
await mkdir(output, { recursive: true });
let browser;
let result;
try {
  browser = await chromium.launch({ executablePath: values.chromium });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(timeout);
  const captures = new Map();
  await page.exposeFunction('captureFirstSseContent', (id) => {
    const capture = (async () => {
      await page.locator('.guide-content-area').screenshot({
        path: join(output, `first-content-${id}.png`),
        animations: 'disabled',
      });
      await page.evaluate((sampleId) => {
        const sample = window.__sseSamples.find((item) => item.id === sampleId);
        if (sample) sample.screenshotAt = performance.now();
      }, id);
    })();
    // Keep the original promise for the gate, and avoid unhandled rejection.
    capture.catch(() => {});
    captures.set(id, capture);
  });
  await page.addInitScript(() => {
    window.__sseSamples = [];
    const originalFetch = window.fetch;
    let current;
    const isContent = (text) => Boolean(text && text !== 'Aguardando transmissão do roteiro…');
    window.fetch = async (...args) => {
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (!new URL(url, location.href).pathname.endsWith('/roteiros/stream-guia')) {
        return originalFetch(...args);
      }
      const baseline = document.querySelector('.guide-content-area')?.textContent?.trim();
      const sample = {
        id: window.__sseSamples.length,
        requestAt: performance.now(),
        baseline,
        ready: !isContent(baseline),
      };
      window.__sseSamples.push(sample);
      current = sample;
      const sampledUrl = new URL(url, location.href);
      sampledUrl.searchParams.set('__sse_benchmark', String(sample.id));
      const input = args[0] instanceof Request
        ? new Request(sampledUrl, args[0])
        : sampledUrl.toString();
      const response = await originalFetch(input, ...args.slice(1));
      sample.responseAt = performance.now();
      sample.httpStatus = response.status;
      sample.controlled = response.headers.get('X-QA-Provider') === 'controlled';
      return response;
    };
    new MutationObserver(() => {
      if (!current || current.contentAt !== undefined) return;
      if (current.responseAt === undefined) return;
      const area = document.querySelector('.guide-content-area');
      const text = area?.textContent?.trim();
      if (!isContent(text)) {
        current.ready = true;
        return;
      }
      if (!current.ready && text === current.baseline) return;
      if (!area.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return;
      if (!document.querySelector('.guide-status-badge.is-streaming')) return;
      // Text and destination are deliberately not written into the report.
      current.contentAt = performance.now();
      void window.captureFirstSseContent(current.id);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto(values.url);
  await page.getByRole('button', { name: /Entrar como Visitante/i }).click();
  await page.locator('#origem_cidade').fill('Recife');
  await page.locator('#origem_uf').selectOption('PE');
  await page.locator('#destino_cidade').fill('Olinda');
  await page.locator('#destino_uf').selectOption('PE');
  await page.getByRole('button', { name: /Cultural/ }).click();
  await page.locator('#btnGerarGuia').click();
  const retry = page.getByRole('button', { name: 'Retransmitir', exact: true });
  await retry.waitFor();
  await page.waitForFunction(
    () => {
      const button = [...document.querySelectorAll('button')].find((item) =>
        item.textContent.includes('Retransmitir'),
      );
      return button && !button.disabled;
    },
    null,
    { timeout },
  );
  const before = await page.evaluate(() => window.__sseSamples.length);
  const streamedResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/roteiros/stream-guia')
        && url.searchParams.get('__sse_benchmark') === String(before)
        && response.request().method() === 'POST';
    },
    { timeout },
  );
  await retry.click();
  const response = await streamedResponse;
  const diagnostic = diagnosticFromSse(await response.text());
  await page.waitForFunction(
    (count) =>
      window.__sseSamples.length > count && window.__sseSamples.at(-1).contentAt !== undefined,
    before,
    { timeout },
  );
  const sample = await page.evaluate(() => {
    const item = window.__sseSamples.at(-1);
    return {
      id: item.id,
      requestAt: item.requestAt,
      responseAt: item.responseAt,
      contentAt: item.contentAt,
      controlled: item.controlled,
      httpStatus: item.httpStatus,
    };
  });
  const capture = captures.get(sample.id);
  if (capture) await capture;
  sample.screenshotAt = await page.evaluate(() => window.__sseSamples.at(-1).screenshotAt);
  sample.diagnostic = diagnostic;
  sample.httpStatus = response.status();
  sample.controlled ||= (await response.headerValue('X-QA-Provider')) === 'controlled';
  result = {
    ...assessLatency(sample, { controlled: values.controlled }),
    sample,
    mode: values.controlled ? 'controlled' : 'real',
    measurement: 'Limite superior conservador até captura do texto; DOM não equivale a pintura.',
    screenshot: capture ? `first-content-${sample.id}.png` : null,
  };
} catch (error) {
  result = { verdict: 'BLOCKED', exitCode: 2, reason: error.message };
} finally {
  await browser?.close();
}
await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, output }, null, 2));
process.exitCode = result.exitCode;
