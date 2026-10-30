import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { CoordenadaGPS, RotaAlternativa } from '../types/domain';
import {
  gerarConteudoGpx,
  baixarArquivoGpx,
  gerarLinkGoogleMaps,
  gerarLinkWhatsApp,
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

describe('rotas recebidas e GPX', () => {
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

describe('GPX: dados geográficos e download', () => {
  afterEach(() => vi.restoreAllMocks());

  function rotaDeTeste() {
    return structuredClone(route);
  }

  it('preserva caracteres especiais em XML, latitude/longitude e omite elevação desconhecida', () => {
    const rota = rotaDeTeste();
    rota.titulo = 'Trilha <centro> & "mar"';
    rota.coordenadas = [
      [-8.0476, -34.877],
      [-7.9986, -34.8459],
    ];
    rota.paradas = [
      {
        id: 'parada',
        nome: 'Café & pão <local>',
        descricao: 'Dica: "água" & sombra',
        km: 5,
        tipo: 'combustivel',
        nivelBateriaOuTanquePct: 22,
        coordenadas: [-8.01, -34.85],
      },
    ];
    const xml = new DOMParser().parseFromString(
      gerarConteudoGpx('Recife & mar', 'Olinda <centro>', rota),
      'application/xml',
    );
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.documentElement.namespaceURI).toBe('http://www.topografix.com/GPX/1/1');
    expect(xml.documentElement.getAttribute('version')).toBe('1.1');
    expect(xml.querySelector('metadata > name')?.textContent).toBe(
      'Rota: Recife & mar para Olinda <centro>',
    );
    expect(xml.querySelector('trk > name')?.textContent).toBe(rota.titulo);
    expect(xml.querySelectorAll('wpt')[2].querySelector('name')?.textContent).toBe(
      'Café & pão <local>',
    );
    expect(xml.querySelectorAll('wpt')[2].querySelector('desc')?.textContent).toBe(
      'Dica: "água" & sombra',
    );
    expect(
      Array.from(xml.querySelectorAll('trkpt'), (ponto) => [
        ponto.getAttribute('lat'),
        ponto.getAttribute('lon'),
      ]),
    ).toEqual([
      ['-8.0476', '-34.877'],
      ['-7.9986', '-34.8459'],
    ]);
    expect(xml.querySelector('ele')).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity, 91, -91])('recusa latitude inválida %s', (latitude) => {
    const rota = rotaDeTeste();
    rota.coordenadas = [
      [latitude, -34],
      [-8, -35],
    ];
    expect(() => gerarConteudoGpx('Recife', 'Olinda', rota)).toThrow(/coordenadas/i);
  });

  it.each([NaN, Infinity, 181, -181])('recusa longitude inválida %s', (longitude) => {
    const rota = rotaDeTeste();
    rota.coordenadas = [
      [-8, longitude],
      [-8, -35],
    ];
    expect(() => gerarConteudoGpx('Recife', 'Olinda', rota)).toThrow(/coordenadas/i);
  });

  it('recusa longitude 180 pois GPX 1.1 exige longitude menor que 180', () => {
    const rota = rotaDeTeste();
    rota.coordenadas = [
      [0, 180],
      [0, -180],
    ];
    expect(() => gerarConteudoGpx('Origem', 'Destino', rota)).toThrow(/coordenadas/i);
  });

  it('aceita latitudes extremas e longitude -180 sem inverter os eixos', () => {
    const rota = rotaDeTeste();
    rota.coordenadas = [
      [-90, -180],
      [90, 179.999999],
    ];
    const xml = new DOMParser().parseFromString(
      gerarConteudoGpx('Origem', 'Destino', rota),
      'application/xml',
    );
    expect(
      Array.from(xml.querySelectorAll('trkpt'), (ponto) => [
        ponto.getAttribute('lat'),
        ponto.getAttribute('lon'),
      ]),
    ).toEqual([
      ['-90', '-180'],
      ['90', '179.999999'],
    ]);
  });

  it('serializa coordenadas próximas de zero como decimal sem expoente em todos os pontos', () => {
    const rota = rotaDeTeste();
    rota.coordenadas = [
      [1e-7, -3e-8],
      [-1e-21, 0],
    ];
    rota.paradas = [
      {
        id: 'parada',
        nome: 'Ponto',
        km: 0,
        tipo: 'combustivel',
        nivelBateriaOuTanquePct: 22,
        coordenadas: [1e-7, -3e-8],
      },
    ];
    const xml = new DOMParser().parseFromString(
      gerarConteudoGpx('Origem', 'Destino', rota),
      'application/xml',
    );
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(
      Array.from(xml.querySelectorAll('trkpt'), (ponto) => [
        ponto.getAttribute('lat'),
        ponto.getAttribute('lon'),
      ]),
    ).toEqual([
      ['0.0000001', '-0.00000003'],
      ['-0.000000000000000000001', '0'],
    ]);
    expect(
      Array.from(xml.querySelectorAll('wpt'), (ponto) => [
        ponto.getAttribute('lat'),
        ponto.getAttribute('lon'),
      ]),
    ).toEqual([
      ['0.0000001', '-0.00000003'],
      ['-0.000000000000000000001', '0'],
      ['0.0000001', '-0.00000003'],
    ]);
  });

  it('recusa geometria sem trajeto em vez de inventar pontos de origem e destino', () => {
    const rota = rotaDeTeste();
    rota.coordenadas = [];
    expect(() => gerarConteudoGpx('Recife', 'Olinda', rota)).toThrow(/dois pontos/i);
  });

  it('recusa coordenadas inválidas em uma parada exportada', () => {
    const rota = rotaDeTeste();
    rota.paradas = [
      {
        id: 'parada',
        nome: 'Posto',
        km: 5,
        tipo: 'combustivel',
        nivelBateriaOuTanquePct: 22,
        coordenadas: [NaN, -35],
      },
    ];
    expect(() => gerarConteudoGpx('Recife', 'Olinda', rota)).toThrow(/coordenadas/i);
  });

  it('baixa um Blob GPX com nome de arquivo e revoga a URL após o clique', async () => {
    const criar = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:rota-gpx');
    const revogar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let linkBaixado: { href: string; download: string } | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      linkBaixado = { href: this.href, download: this.download };
    });
    baixarArquivoGpx('Recife - PE', 'Olinda - PE', rotaDeTeste());
    const blob = criar.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/gpx+xml;charset=utf-8');
    expect(blob.size).toBeGreaterThan(0);
    const xml = new DOMParser().parseFromString(await blob.text(), 'application/xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.querySelector('metadata > name')?.textContent).toBe(
      'Rota: Recife - PE para Olinda - PE',
    );
    expect(linkBaixado?.href).toBe('blob:rota-gpx');
    expect(linkBaixado?.download).toBe('rota-recife-pe-para-olinda-pe.gpx');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revogar).toHaveBeenCalledWith('blob:rota-gpx');
  });

  it('remove o link e revoga a URL mesmo se o navegador falhar no download', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:falha');
    const revogar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('Download bloqueado');
    });
    expect(() => baixarArquivoGpx('Recife', 'Olinda', rotaDeTeste())).toThrow('Download bloqueado');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revogar).toHaveBeenCalledWith('blob:falha');
  });
});
