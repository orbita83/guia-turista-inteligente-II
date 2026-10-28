import { describe, expect, it } from 'vite-plus/test';

import type { RoteiroFormData, Viagem } from '../types/domain';
import {
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
    expect(extrairKmDeTexto('800 km')).toBe(800);
    expect(extrairKmDeTexto('1.250,5 km')).toBe(1250.5);
    expect(extrairKmDeTexto('')).toBe(120);
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
