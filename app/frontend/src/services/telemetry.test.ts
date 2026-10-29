import { describe, expect, it } from 'vite-plus/test';

import type { Viagem } from '../types/domain';
import { connectionQualityLabel, formatSessionDuration, providerDiagnostics } from './telemetry';

const baseTrip: Viagem = {
  id: 'trip-1',
  origem: 'Recife - PE',
  destino: 'Olinda - PE',
  clima: { temperatura: '28 °C', umidade: '70%', vento: '12 km/h' },
  percurso: { distancia: '8 km', tempo: '20 min' },
  dicas_destino: 'Centro histórico',
};

describe('providerDiagnostics', () => {
  it('uses operation data as evidence for Open-Meteo and OSRM', () => {
    const providers = providerDiagnostics(baseTrip);
    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'open-meteo', state: 'available' }),
        expect.objectContaining({ provider: 'osrm', state: 'available' }),
        expect.objectContaining({ provider: 'open-elevation', state: 'unknown' }),
      ]),
    );
    expect(providers.every(({ durationMs }) => durationMs.available === false)).toBe(true);
  });

  it('accepts only an explicit successful Gemini diagnostic as available', () => {
    const [gemini] = providerDiagnostics({
      ...baseTrip,
      diagnostico_ia: { status: 'sucesso', fallback_utilizado: false },
    }).filter(({ provider }) => provider === 'gemini');
    expect(gemini.state).toBe('available');
  });

  it('marks an explicit Gemini fallback as degraded', () => {
    const [gemini] = providerDiagnostics({
      ...baseTrip,
      diagnostico_ia: { status: 'fallback', fallback_utilizado: true },
    }).filter(({ provider }) => provider === 'gemini');
    expect(gemini).toEqual(expect.objectContaining({ state: 'degraded', reason: 'fallback' }));
  });

  it.each([
    undefined,
    { status: 'sucesso', fallback_utilizado: 'false' },
    { status: 'erro', fallback_utilizado: false },
  ])('keeps malformed or absent Gemini diagnostics unknown', (diagnostico_ia) => {
    const [gemini] = providerDiagnostics({ ...baseTrip, diagnostico_ia }).filter(
      ({ provider }) => provider === 'gemini',
    );
    expect(gemini.state).toBe('unknown');
  });

  it('does not turn N/D fields into a provider failure', () => {
    const providers = providerDiagnostics({
      ...baseTrip,
      clima: { temperatura: 'N/D', umidade: 'N/D', vento: 'N/D' },
      percurso: { distancia: 'N/D', tempo: 'N/D' },
    });
    expect(providers.filter(({ state }) => state === 'unavailable')).toHaveLength(0);
    expect(providers.find(({ provider }) => provider === 'open-meteo')?.state).toBe('unknown');
    expect(providers.find(({ provider }) => provider === 'osrm')?.state).toBe('unknown');
  });
});

describe('formatSessionDuration', () => {
  it('retorna Aguardando dados se indisponível', () => {
    expect(formatSessionDuration({ available: false, reason: 'missing' })).toBe('Aguardando dados');
  });

  it('formata segundos para durações menores que 1 minuto', () => {
    expect(formatSessionDuration({ available: true, value: 45000 })).toBe('45 s');
  });

  it('formata minutos exatos', () => {
    expect(formatSessionDuration({ available: true, value: 120000 })).toBe('2 min');
  });

  it('formata minutos e segundos para durações intermediárias', () => {
    expect(formatSessionDuration({ available: true, value: 125000 })).toBe('2 min 5 s');
  });

  it('formata horas para durações longas', () => {
    expect(formatSessionDuration({ available: true, value: 3600000 })).toBe('1 h');
    expect(formatSessionDuration({ available: true, value: 3900000 })).toBe('1 h 5 min');
  });
});

describe('connectionQualityLabel', () => {
  it('retorna Aguardando dados se conectividade ausente', () => {
    expect(connectionQualityLabel()).toBe('Aguardando dados');
  });

  it('classifica qualidade de acordo com o RTT e anexa tipo de rede', () => {
    expect(
      connectionQualityLabel({
        state: 'online',
        rtt: { available: true, value: 45 },
        networkType: { available: true, value: 'SSE ativo' },
      }),
    ).toBe('45 ms (SSE ativo · Excelente)');

    expect(
      connectionQualityLabel({
        state: 'online',
        rtt: { available: true, value: 250 },
        networkType: { available: true, value: 'SSE ativo' },
      }),
    ).toBe('250 ms (SSE ativo · Boa)');

    expect(
      connectionQualityLabel({
        state: 'online',
        rtt: { available: true, value: 500 },
        networkType: { available: false, reason: 'missing' },
      }),
    ).toBe('500 ms (Elevada)');
  });
});
