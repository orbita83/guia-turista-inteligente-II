import { expect, it } from 'vitest';
import { parseTrip } from './api';

it('preserva a origem OSM e a indisponibilidade da consulta municipal', () => {
  expect(
    parseTrip({
      id: 'municipio',
      atrativos: [],
      atrativos_fonte: 'openstreetmap',
      atrativos_status: 'indisponivel',
    }),
  ).toMatchObject({
    atrativos: [],
    atrativosFonte: 'openstreetmap',
    atrativosStatus: 'indisponivel',
  });
});

it('preserva a geometria real da resposta para o download GPX', () => {
  const points = [
    [-8.0476, -34.877],
    [-8.0089, -34.8553],
  ];
  expect(parseTrip({ id: 'route', percurso: { geometria: points } })?.percurso.geometria).toEqual(
    points,
  );
});

it('preserva alternativas OSRM válidas e descarta as malformadas', () => {
  const geometria = [
    [-8, -34],
    [-9, -35],
  ];
  const parsed = parseTrip({
    id: 'route',
    percurso: {
      alternativas: [
        { distancia: '120 km', tempo: '2h 0min de carro', geometria },
        { distancia: '90 km', tempo: '1h', geometria: [[-8, -34]] },
      ],
    },
  });
  expect(parsed?.percurso.alternativas).toEqual([
    { distancia: '120 km', tempo: '2h 0min de carro', geometria },
  ]);
});

it('normaliza o perfil altimétrico real e não inventa perfil em falha', () => {
  const profile = {
    sucesso: true,
    status: 'sucesso',
    pontos: [
      { distancia_km: 0, elevacao_m: -2 },
      { distancia_km: 8, elevacao_m: 30 },
    ],
  };
  expect(
    parseTrip({ id: 'route', percurso: { altimetria: profile } })?.percurso.perfilElevacao,
  ).toEqual([
    { distanciaKm: 0, altitudeM: -2 },
    { distanciaKm: 8, altitudeM: 30 },
  ]);
  expect(
    parseTrip({
      id: 'route',
      percurso: { altimetria: { ...profile, sucesso: false, status: 'indisponivel' } },
    })?.percurso.perfilElevacao,
  ).toBeUndefined();
});

it('identifica quota excedida em respostas novas e viagens antigas sem expor o corpo do erro', () => {
  const oldError = {
    sucesso: false,
    status: 'erro_provedor',
    mensagem:
      'Erro retornado pelo Open-Elevation: Open-Elevation retornou HTTP 429: resposta privada',
  };
  const currentError = {
    sucesso: false,
    status: 'cota_excedida',
    mensagem: 'A consulta de elevação atingiu o limite do provedor (HTTP 429).',
  };
  const oldTrip = parseTrip({ id: 'old', percurso: { altimetria: oldError } });
  const currentTrip = parseTrip({ id: 'new', percurso: { altimetria: currentError } });
  expect(oldTrip?.percurso.statusAltimetria).toBe('cota_excedida');
  expect(currentTrip?.percurso.statusAltimetria).toBe('cota_excedida');
  expect(oldTrip?.percurso.perfilElevacao).toBeUndefined();
  expect(JSON.stringify(oldTrip)).not.toContain('resposta privada');
});

it('associa o perfil à alternativa de onde veio', () => {
  const viagem = parseTrip({
    id: 'route',
    percurso: {
      alternativas: [
        {
          distancia: '10 km',
          tempo: '20 min',
          geometria: [
            [-8, -34],
            [-9, -35],
          ],
          altimetria: {
            sucesso: true,
            status: 'sucesso',
            pontos: [
              { distancia_km: 0, elevacao_m: 42 },
              { distancia_km: 10, elevacao_m: 84 },
            ],
          },
        },
      ],
    },
  });
  expect(viagem?.percurso.alternativas?.[0].perfilElevacao).toEqual([
    { distanciaKm: 0, altitudeM: 42 },
    { distanciaKm: 10, altitudeM: 84 },
  ]);
  expect(viagem?.percurso.perfilElevacao).toBeUndefined();
});

it('valida a origem e coordenadas das paradas calculadas pelo backend', () => {
  const parada = {
    id: 'p1',
    nome: 'Ponto projetado',
    tipo: 'combustivel',
    distancia_km: 90,
    reserva_estimada_percent: 22,
    coordenadas: { latitude: -8, longitude: -34 },
    origem: 'projetado',
    eh_ponto_projetado: true,
    estabelecimento_verificado: false,
  };
  const viagem = parseTrip({
    id: 'route',
    percurso: {
      autonomia: {
        sucesso: true,
        solucao_segura: true,
        autonomia_maxima_km: 120,
        paradas: [parada],
      },
    },
  });
  expect(viagem?.percurso.autonomia?.paradas[0]).toMatchObject({
    id: 'p1',
    origem: 'projetado',
    coordenadas: [-8, -34],
  });
  expect(
    parseTrip({
      id: 'route',
      percurso: {
        autonomia: {
          sucesso: true,
          solucao_segura: true,
          paradas: [{ ...parada, estabelecimento_verificado: true }],
        },
      },
    })?.percurso.autonomia,
  ).toBeUndefined();
});

it('lê custos parciais e cotas sem converter pedágios ausentes em zero', () => {
  const custos = {
    sucesso: true,
    status: 'parcial',
    total_completo: false,
    custo_propulsao: '100.00',
    custo_total: '100.00',
    passageiros: 3,
    rateio: {
      quantidade: 3,
      total_rateado: '100.00',
      cotas: [
        { passageiro: 1, valor: '33.34' },
        { passageiro: 2, valor: '33.33' },
        { passageiro: 3, valor: '33.33' },
      ],
    },
  };
  expect(parseTrip({ id: 'route', percurso: { custos } })?.percurso.custos).toEqual({
    custoPropulsao: '100.00',
    custoTotal: '100.00',
    totalCompleto: false,
    cotas: custos.rateio.cotas,
  });
  const incorreto = {
    ...custos,
    rateio: { ...custos.rateio, cotas: [{ passageiro: 1, valor: '100.00' }] },
  };
  expect(
    parseTrip({ id: 'route', percurso: { custos: incorreto } })?.percurso.custos,
  ).toBeUndefined();
});

it.each([
  undefined,
  [],
  [[-8, -34]],
  [
    [-8, -34],
    [91, -34],
  ],
  [
    [-8, -34],
    [-8, 180],
  ],
  [
    [-8, -34],
    ['-8', -34],
  ],
  [
    [-8, -34],
    [NaN, -34],
  ],
])('não permite exportar geometria ausente ou inválida %j', (points) => {
  expect(
    parseTrip({ id: 'route', percurso: { geometria: points } })?.percurso.geometria,
  ).toBeUndefined();
});
