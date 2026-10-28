import { describe, expect, it } from 'vite-plus/test';
import type { CoordenadaGPS, RotaAlternativa, Viagem } from '../types/domain';
import {
  gerarConteudoGpx,
  gerarLinkGoogleMaps,
  gerarLinkWhatsApp,
  gerarRotasAlternativas,
} from './routeCalculator';

const route: RotaAlternativa = {
  id: 'principal',
  titulo: 'Rota principal',
  tipoRotulo: 'Principal',
  descricao: 'Via principal',
  resumoDestaque: 'Rota recebida',
  distanciaKm: 8,
  tempoFormatado: '20 min',
  pedagios: 0,
  autonomiaKm: 300,
  coordenadas: [
    [-8.05, -34.88],
    [-8.02, -34.85],
  ],
  paradas: [],
  topografia: {
    altitudeMaximaM: 10,
    desnivelSubidaM: 2,
    desnivelDescidaM: 1,
    desnivelLiquidoM: 1,
    cotaMinimaM: 2,
    cotaMaximaM: 10,
    penalizacaoConsumoPct: 0,
  },
  custos: { combustivelOuEnergia: 5, pedagios: 0, total: 5, passageiros: 1, valorPorPassageiro: 5 },
};

const trip: Viagem = {
  id: 'trip-1',
  origem: 'Recife - PE',
  destino: 'Olinda - PE',
  clima: { temperatura: '28 °C', umidade: '70%', vento: '10 km/h' },
  percurso: { distancia: '8 km', tempo: '20 min' },
  dicas_destino: '',
};

describe('rotas recebidas e GPX', () => {
  it('não cria alternativas artificiais', () => {
    expect(gerarRotasAlternativas(trip)).toEqual([]);
    expect(gerarRotasAlternativas({ ...trip, rotas: [route] })).toEqual([route]);
  });

  it('gera XML GPX 1.1 com geometria recebida e caracteres escapados', () => {
    const gpx = gerarConteudoGpx('Recife & Olinda', 'Praia <Norte>', {
      ...route,
      titulo: 'Rota "principal"',
    });
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('<trkpt lat="-8.05" lon="-34.88" />');
    expect(gpx).toContain('Recife &amp; Olinda');
    expect(gpx).toContain('Praia &lt;Norte&gt;');
    expect(gpx).toContain('Rota &quot;principal&quot;');
    expect(gpx).not.toContain('<ele>0</ele>');
  });

  const invalidGeometries: { coordenadas: CoordenadaGPS[] }[] = [
    { coordenadas: [] },
    { coordenadas: [[-8, -34]] },
    {
      coordenadas: [
        [100, -34],
        [-8, -35],
      ],
    },
    {
      coordenadas: [
        [Number.NaN, -34],
        [-8, -35],
      ],
    },
  ];
  it.each(invalidGeometries)('recusa geometria inválida: $coordenadas', ({ coordenadas }) => {
    expect(() => gerarConteudoGpx('A', 'B', { ...route, coordenadas })).toThrow(
      /Geometria indisponível/,
    );
  });

  it('gera links externos com origem e destino codificados', () => {
    expect(gerarLinkGoogleMaps('Recife - PE', 'Olinda - PE')).toContain('origin=Recife%20-%20PE');
    expect(gerarLinkWhatsApp('Recife - PE', 'Olinda - PE', route)).toContain(
      encodeURIComponent('Recife - PE'),
    );
  });
});
