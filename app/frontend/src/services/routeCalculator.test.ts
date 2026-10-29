import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import type { RoteiroFormData, Viagem } from '../types/domain';
import {
  baixarArquivoGpx,
  calcularAutonomiaVeiculo,
  calcularCustosViagem,
  calcularParadasEstrategicas,
  extrairKmDeTexto,
  formatarMinutosEmTempo,
  gerarConteudoGpx,
  gerarLinkGoogleMaps,
  gerarLinkWhatsApp,
  gerarRotasAlternativas,
  obterCoordenadasLocal,
} from './routeCalculator';

describe('routeCalculator', () => {
  it('extrai valor numérico de quilometragem de strings variadas', () => {
    // Formato decimal padrão retornado pelo backend Python/OSRM (com ponto)
    expect(extrairKmDeTexto('6.5 km')).toBe(6.5);
    expect(extrairKmDeTexto('800.0 km')).toBe(800);
    expect(extrairKmDeTexto('166.4 km')).toBe(166.4);
    expect(extrairKmDeTexto('1250.5 km')).toBe(1250.5);

    // Formato pt-BR com vírgula decimal
    expect(extrairKmDeTexto('1.250,5 km')).toBe(1250.5);
    expect(extrairKmDeTexto('6,5 km')).toBe(6.5);

    // Formato inteiro com e sem separador de milhar
    expect(extrairKmDeTexto('1.250 km')).toBe(1250);
    expect(extrairKmDeTexto('800 km')).toBe(800);

    // Strings vazias ou não numéricas
    expect(extrairKmDeTexto('')).toBe(120);
    expect(extrairKmDeTexto('Sem rota direta')).toBe(120);
    expect(extrairKmDeTexto(null)).toBe(120);
  });

  it('mantém a distância decimal exata em rotas curtas e calcula alternativas coerentes', () => {
    const viagemCurta: Viagem = {
      id: 'trip-olinda',
      origem: 'Recife - PE',
      destino: 'Olinda - PE',
      clima: { temperatura: '26 °C', umidade: '75%', vento: '14 km/h' },
      percurso: { distancia: '6.5 km', tempo: '8 min' },
      dicas_destino: 'Dicas de Recife e Olinda',
    };

    const [principal, economica] = gerarRotasAlternativas(viagemCurta);
    // Não pode inflar 10x para 65 km
    expect(principal.distanciaKm).toBe(6.5);
    expect(economica.distanciaKm).toBe(7);
    expect(principal.paradas).toHaveLength(0);
    expect(economica.paradas).toHaveLength(0);
  });

  it('formata minutos em horas e minutos', () => {
    expect(formatarMinutosEmTempo(45)).toBe('45 min');
    expect(formatarMinutosEmTempo(120)).toBe('2h');
    expect(formatarMinutosEmTempo(135)).toBe('2h 15min');
  });

  it('calcula autonomia corretamente para combustão e elétrico', () => {
    const combustao: RoteiroFormData = {
      origem_cidade: 'Recife',
      origem_uf: 'PE',
      destino_cidade: 'Natal',
      destino_uf: 'RN',
      propulsao: 'combustao',
      consumo_km_l: 10,
      capacidade_tanque_l: 50,
    };
    expect(calcularAutonomiaVeiculo(combustao)).toBe(500);

    const eletrico: RoteiroFormData = {
      origem_cidade: 'Recife',
      origem_uf: 'PE',
      destino_cidade: 'Natal',
      destino_uf: 'RN',
      propulsao: 'eletrico',
      eficiencia_km_kwh: 5,
      capacidade_bateria_kwh: 70,
    };
    expect(calcularAutonomiaVeiculo(eletrico)).toBe(350);
  });

  it('posiciona paradas respeitando a margem de segurança de ~18%', () => {
    const autonomia = 400;
    const coordenadas = [[-8.0, -35.0] as [number, number], [-12.0, -38.0] as [number, number]];

    // Viagem de 300 km com 400 km de autonomia:
    // Limite crítico = 400 * 0.82 = 328 km. 300 km < 328 km => 0 paradas necessárias.
    const paradasCurta = calcularParadasEstrategicas(300, autonomia, 'combustao', coordenadas);
    expect(paradasCurta).toHaveLength(0);

    // Viagem de 900 km com 400 km de autonomia:
    // Limite crítico = 328 km. 900 km requer paradas estratégicas antes da reserva.
    const paradasLonga = calcularParadasEstrategicas(900, autonomia, 'combustao', coordenadas);
    expect(paradasLonga.length).toBeGreaterThan(0);
    expect(paradasLonga[0].nivelBateriaOuTanquePct).toBeGreaterThan(18); // Acima do crítico de 18%
    expect(paradasLonga[0].tipo).toBe('combustivel');
  });

  it('calcula rateio de passageiros corretamente de 1 a 8', () => {
    const custos1 = calcularCustosViagem(500, 40, undefined, 0, 1);
    expect(custos1.passageiros).toBe(1);
    expect(custos1.valorPorPassageiro).toBe(custos1.total);

    const custos4 = calcularCustosViagem(500, 40, undefined, 0, 4);
    expect(custos4.passageiros).toBe(4);
    expect(custos4.valorPorPassageiro).toBe(Math.round((custos4.total / 4) * 100) / 100);
  });

  it('gera duas alternativas de rotas (Principal e Econômica) com atualização atômica de métricas', () => {
    const viagem: Viagem = {
      id: 'trip-1',
      origem: 'Recife - PE',
      destino: 'Salvador - BA',
      clima: { temperatura: '26 °C', umidade: '75%', vento: '14 km/h' },
      percurso: { distancia: '800 km', tempo: '11h' },
      dicas_destino: 'Dicas de viagem',
    };

    const rotas = gerarRotasAlternativas(viagem, undefined, 2);
    expect(rotas).toHaveLength(2);

    const [principal, economica] = rotas;
    expect(principal.id).toBe('principal');
    expect(economica.id).toBe('economica');

    // A rota econômica evita pedágios
    expect(economica.pedagios).toBeLessThan(principal.pedagios);
    // A rota econômica é ligeiramente mais longa em distância e tempo
    expect(economica.distanciaKm).toBeGreaterThan(principal.distanciaKm);
  });

  it('gera XML GPX 1.1 válido com waypoints e track', () => {
    const viagem: Viagem = {
      id: 'trip-1',
      origem: 'Recife - PE',
      destino: 'Olinda - PE',
      clima: { temperatura: '28 °C', umidade: '70%', vento: '10 km/h' },
      percurso: { distancia: '10 km', tempo: '25 min' },
      dicas_destino: 'Centro histórico',
    };
    const [rota] = gerarRotasAlternativas(viagem);
    const gpx = gerarConteudoGpx('Recife - PE', 'Olinda - PE', rota);

    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('<wpt lat=');
    expect(gpx).toContain('<trk>');
  });

  it('gera links válidos para Google Maps e WhatsApp', () => {
    const maps = gerarLinkGoogleMaps('Recife - PE', 'Olinda - PE');
    expect(maps).toContain('https://www.google.com/maps/dir/?api=1');
    expect(maps).toContain('origin=Recife%20-%20PE');
    expect(maps).toContain('destination=Olinda%20-%20PE');

    const viagem: Viagem = {
      id: 'trip-1',
      origem: 'Recife - PE',
      destino: 'Olinda - PE',
      clima: { temperatura: '28 °C', umidade: '70%', vento: '10 km/h' },
      percurso: { distancia: '10 km', tempo: '25 min' },
      dicas_destino: 'Centro histórico',
    };
    const [rota] = gerarRotasAlternativas(viagem);
    const whatsapp = gerarLinkWhatsApp('Recife - PE', 'Olinda - PE', rota);
    expect(whatsapp).toContain('https://api.whatsapp.com/send?text=');
    expect(whatsapp).toContain(encodeURIComponent('Recife - PE'));
  });

  it('obtém coordenadas aproximadas por capital ou UF', () => {
    const coordRecife = obterCoordenadasLocal('Recife - PE');
    expect(coordRecife[0]).toBeCloseTo(-8.0476, 2);

    const coordBahia = obterCoordenadasLocal('Feira de Santana - BA');
    expect(coordBahia[0]).toBeLessThan(0); // Coordenada válida no hemisfério sul
  });
});

describe('GPX: dados geográficos e download', () => {
  afterEach(() => vi.restoreAllMocks());

  function rotaDeTeste() {
    return gerarRotasAlternativas({
      id: 'gpx',
      origem: 'Recife - PE',
      destino: 'Olinda - PE',
      clima: { temperatura: '28 °C', umidade: '70%', vento: '10 km/h' },
      percurso: { distancia: '10 km', tempo: '25 min' },
      dicas_destino: 'Guia',
    })[0];
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
    expect(blob.type).toBe('application/gpx+xml;charset=utf-8;');
    expect(blob.size).toBeGreaterThan(0);
    const xml = new DOMParser().parseFromString(await blob.text(), 'application/xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.querySelector('metadata > name')?.textContent).toBe(
      'Rota: Recife - PE para Olinda - PE',
    );
    expect(linkBaixado?.href).toBe('blob:rota-gpx');
    expect(linkBaixado?.download).toBe('rota-recife___pe-para-olinda___pe.gpx');
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
