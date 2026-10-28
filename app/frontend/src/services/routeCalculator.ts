import type {
  CalculoCustosViagem,
  CoordenadaGPS,
  ParadaEstrategica,
  RotaAlternativa,
  RoteiroFormData,
  TipoPropulsao,
  Viagem,
} from '../types/domain';
import { calcularHaversineKm } from './geolocation';

// Coordenadas de referência para as capitais e polos brasileiros
const COORDENADAS_REFERENCIA: Record<string, CoordenadaGPS> = {
  // Nordeste
  RECIFE: [-8.0476, -34.877],
  OLINDA: [-7.9986, -34.8459],
  SALVADOR: [-12.9777, -38.5016],
  FORTALEZA: [-3.7172, -38.5434],
  NATAL: [-5.7945, -35.211],
  JOAO_PESSOA: [-7.115, -34.8631],
  MACEIO: [-9.6658, -35.7351],
  ARACAJU: [-10.9472, -37.0731],
  TERESINA: [-5.092, -42.8038],
  SAO_LUIS: [-2.5307, -44.3068],
  PIRIPIRI: [-4.2745, -41.7769],
  // Sudeste
  SAO_PAULO: [-23.5505, -46.6333],
  RIO_DE_JANEIRO: [-22.9068, -43.1729],
  BELO_HORIZONTE: [-19.9167, -43.9345],
  VITORIA: [-20.3155, -40.3128],
  // Sul
  CURITIBA: [-25.4284, -49.2733],
  FLORIANOPOLIS: [-27.5954, -48.548],
  PORTO_ALEGRE: [-30.0346, -51.2177],
  // Centro-Oeste / Norte
  BRASILIA: [-15.7975, -47.8919],
  GOIANIA: [-16.6869, -49.2648],
  CUIABA: [-15.6014, -56.0979],
  CAMPO_GRANDE: [-20.4697, -54.6201],
  MANAUS: [-3.119, -60.0217],
  BELEM: [-1.4558, -48.4902],
  PALMAS: [-10.2491, -48.3243],
};

// Coordenadas médias por UF para cidades do interior
const COORDENADAS_UF: Record<string, CoordenadaGPS> = {
  PE: [-8.35, -36.0],
  BA: [-12.5, -41.7],
  CE: [-5.2, -39.3],
  RN: [-5.7, -36.5],
  PB: [-7.1, -36.8],
  AL: [-9.6, -36.6],
  SE: [-10.6, -37.3],
  PI: [-7.2, -42.5],
  MA: [-5.0, -45.0],
  SP: [-22.5, -48.5],
  RJ: [-22.3, -42.5],
  MG: [-18.5, -44.5],
  ES: [-19.5, -40.5],
  PR: [-24.8, -51.5],
  SC: [-27.2, -50.5],
  RS: [-29.5, -53.5],
  DF: [-15.79, -47.89],
  GO: [-16.0, -50.0],
  MT: [-13.0, -56.0],
  MS: [-20.5, -54.5],
  AM: [-3.5, -64.0],
  PA: [-3.8, -52.0],
  TO: [-10.2, -48.3],
};

function extrairCidadeEUf(texto: string): { cidade: string; uf: string } {
  const partes = (texto || '').split('-').map((parte) => parte.trim());
  if (partes.length >= 2) {
    return { cidade: partes[0], uf: partes[1].toUpperCase() };
  }
  return { cidade: texto.trim(), uf: '' };
}

function normalizarChave(cidade: string): string {
  return cidade
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '_');
}

export function obterCoordenadasLocal(cidadeOuTexto: string, ufPadrao = ''): CoordenadaGPS {
  const { cidade, uf } = extrairCidadeEUf(cidadeOuTexto);
  const estado = uf || ufPadrao.toUpperCase();
  const chave = normalizarChave(cidade);

  if (COORDENADAS_REFERENCIA[chave]) {
    return COORDENADAS_REFERENCIA[chave];
  }
  if (estado && COORDENADAS_UF[estado]) {
    return COORDENADAS_UF[estado];
  }
  // Coordenadas centrais do Brasil como fallback
  return [-14.235, -51.9253];
}

export function extrairKmDeTexto(distanciaTexto: string): number {
  if (!distanciaTexto) return 120;
  const limpo = distanciaTexto.replace(/\./g, '').replace(',', '.');
  const match = limpo.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const valor = parseFloat(match[1]);
    return Number.isFinite(valor) && valor > 0 ? valor : 120;
  }
  return 120;
}

export function formatarMinutosEmTempo(minutosTotais: number): string {
  const mins = Math.max(1, Math.round(minutosTotais));
  const horas = Math.floor(mins / 60);
  const restante = mins % 60;
  if (horas === 0) return `${restante} min`;
  if (restante === 0) return `${horas}h`;
  return `${horas}h ${restante}min`;
}

export function calcularAutonomiaVeiculo(form?: RoteiroFormData): number {
  const propulsao = form?.propulsao || 'combustao';
  if (propulsao === 'eletrico') {
    const kmKwh = form?.eficiencia_km_kwh ?? 6;
    const bateria = form?.capacidade_bateria_kwh ?? 60;
    return Math.max(50, Math.round(kmKwh * bateria));
  }
  const kmL = form?.consumo_km_l ?? 12;
  const tanque = form?.capacidade_tanque_l ?? 50;
  return Math.max(50, Math.round(kmL * tanque));
}

// TODO(backend): o endpoint /api/v1/roteiros/planejar
// precisa retornar a geometria rodoviária real (coordenadas da rota)
// e coordenadas geocodificadas de origem/destino.
// O contrato atual retorna apenas distância, tempo e modal.
// Não usar interpolação entre cidades como trajeto rodoviário real.
// Relacionado à Issue #15 (geometria rodoviária).

/**
 * Calcula paradas estratégicas antes do limite crítico de ~18% de autonomia (RN-CST-002),
 * acumulando as distâncias geodésicas reais ao longo da polyline rodoviária.
 */
export function calcularParadasEstrategicas(
  distanciaKm: number,
  autonomiaKm: number,
  propulsao: 'combustao' | 'eletrico',
  coordenadasRota: CoordenadaGPS[],
): ParadaEstrategica[] {
  // Margem de segurança de ~18% (RN-CST-002 / Seção 3.3)
  const margemSeguranca = 0.18;
  const limiteCriticoKm = autonomiaKm * (1 - margemSeguranca);
  const paradas: ParadaEstrategica[] = [];

  if (distanciaKm <= limiteCriticoKm || coordenadasRota.length < 2) {
    return paradas;
  }

  // Intervalo seguro de parada antes da reserva crítica de ~18%
  const intervaloParada = Math.round(autonomiaKm * 0.75);
  let kmAcumulado = intervaloParada;
  let indice = 1;

  // Calcula distâncias acumuladas ao longo dos pontos reais da rota via Haversine
  const distanciasAcumuladas: number[] = [0];
  for (let i = 1; i < coordenadasRota.length; i++) {
    const d = calcularHaversineKm(
      coordenadasRota[i - 1][0],
      coordenadasRota[i - 1][1],
      coordenadasRota[i][0],
      coordenadasRota[i][1],
    );
    distanciasAcumuladas.push(distanciasAcumuladas[i - 1] + d);
  }
  const distanciaTotalCoords = distanciasAcumuladas[distanciasAcumuladas.length - 1] || distanciaKm;

  while (kmAcumulado < distanciaKm) {
    // Projeta o ponto na geometria rodoviária real proporcional à distância acumulada
    const ratio = kmAcumulado / distanciaKm;
    const targetDist = ratio * distanciaTotalCoords;

    let idxCoord = 0;
    for (let i = 0; i < distanciasAcumuladas.length; i++) {
      if (distanciasAcumuladas[i] >= targetDist) {
        idxCoord = i;
        break;
      }
    }
    const coord = coordenadasRota[idxCoord] || coordenadasRota[coordenadasRota.length - 1];
    const tipo = propulsao === 'eletrico' ? 'recarga' : 'combustivel';
    const icone = propulsao === 'eletrico' ? '⚡ Eletroposto' : '⛽ Posto';

    paradas.push({
      id: `parada-${indice}`,
      nome: `${icone} (km ${kmAcumulado})`,
      km: kmAcumulado,
      tipo,
      nivelBateriaOuTanquePct: 22, // Reserva ao chegar antes do limite crítico de 18%
      coordenadas: coord,
      descricao:
        propulsao === 'eletrico'
          ? `Ponto projetado de recarga por autonomia ao km ${kmAcumulado} com ~22% de reserva (margem segura contra esgotamento da bateria).`
          : `Ponto projetado de abastecimento por autonomia ao km ${kmAcumulado} com ~22% de reserva (margem segura de abastecimento).`,
    });

    kmAcumulado += intervaloParada;
    indice++;
  }

  return paradas;
}

export function calcularCustosViagem(
  distanciaKm: number,
  pedagios: number,
  form: RoteiroFormData | undefined,
  penalizacaoRelevoPct: number,
  passageiros = 1,
): CalculoCustosViagem {
  const propulsao = form?.propulsao || 'combustao';
  const fatorRelevo = 1 + Math.max(0, penalizacaoRelevoPct) / 100;
  let custoCombustivelOuEnergia = 0;

  if (propulsao === 'eletrico') {
    const eficiencia = form?.eficiencia_km_kwh ?? 6;
    const precoKwh = form?.preco_energia_kwh ?? 0.95;
    const consumoTotalKwh = (distanciaKm * fatorRelevo) / eficiencia;
    custoCombustivelOuEnergia = consumoTotalKwh * precoKwh;
  } else {
    const consumoKmL = form?.consumo_km_l ?? 12;
    const precoLitro = form?.preco_combustivel_l ?? 6.19;
    const litrosNecessarios = (distanciaKm * fatorRelevo) / consumoKmL;
    custoCombustivelOuEnergia = litrosNecessarios * precoLitro;
  }

  const combustivelOuEnergiaArredondado = Math.round(custoCombustivelOuEnergia * 100) / 100;
  const total = Math.round((combustivelOuEnergiaArredondado + pedagios) * 100) / 100;
  const totalPassageiros = Math.min(8, Math.max(1, passageiros));
  const valorPorPassageiro = Math.round((total / totalPassageiros) * 100) / 100;

  return {
    combustivelOuEnergia: combustivelOuEnergiaArredondado,
    pedagios,
    total,
    passageiros: totalPassageiros,
    valorPorPassageiro,
  };
}

// TODO(backend): obter geometria rodoviária real e amostras de
// elevação ao longo do trajeto para renderizar o perfil topográfico.
// A resposta atual de planejamento não fornece série de altitudes.
// Não exibir valores simulados como medições reais.
// Relacionado à Issue #15 (geometria rodoviária) e Issue #16 (altimetria e relevo).

export function gerarRotasAlternativas(
  viagem: Viagem,
  _form?: RoteiroFormData,
  _passageiros = 1,
  _propulsaoOverride?: TipoPropulsao,
): RotaAlternativa[] {
  return viagem.rotas ?? [];
}

export function gerarLinkGoogleMaps(origem: string, destino: string): string {
  const encOrigem = encodeURIComponent(origem);
  const encDestino = encodeURIComponent(destino);
  return `https://www.google.com/maps/dir/?api=1&origin=${encOrigem}&destination=${encDestino}&travelmode=driving`;
}

export function gerarLinkWhatsApp(
  origem: string,
  destino: string,
  distanciaOuRota: string | RotaAlternativa,
  tempo?: string,
): string {
  const distancia =
    typeof distanciaOuRota === 'object' ? `${distanciaOuRota.distanciaKm} km` : distanciaOuRota;
  const duracao =
    typeof distanciaOuRota === 'object' ? distanciaOuRota.tempoFormatado : tempo || '';
  const texto = `🚗 Rota do Guia do Turista Brasil\nPartida: ${origem}\nDestino: ${destino}\nDistância estimada: ${distancia}\nTempo de viagem: ${duracao}\n\nAcesse seu roteiro completo no app!`;
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
}

export type GpxRoute = Pick<RotaAlternativa, 'titulo' | 'coordenadas' | 'paradas'> &
  Partial<Pick<RotaAlternativa, 'distanciaKm' | 'tempoFormatado'>>;

export function geometriaValida(geometria?: CoordenadaGPS[]): boolean {
  return Boolean(
    geometria &&
    geometria.length >= 2 &&
    geometria.every(
      ([lat, lon]) =>
        Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180,
    ),
  );
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character] ?? character,
  );
}

export function gerarConteudoGpx(origem: string, destino: string, rota: GpxRoute): string {
  if (!geometriaValida(rota.coordenadas)) {
    throw new Error('Geometria indisponível para exportação GPX.');
  }
  const coordOrigem = rota.coordenadas[0];
  const coordDestino = rota.coordenadas[rota.coordenadas.length - 1];

  const waypointsOrigemDestino = `  <wpt lat="${coordOrigem[0]}" lon="${coordOrigem[1]}">
    <name>Origem: ${escapeXml(origem)}</name>
  </wpt>
  <wpt lat="${coordDestino[0]}" lon="${coordDestino[1]}">
    <name>Destino: ${escapeXml(destino)}</name>
  </wpt>`;

  const paradasXml = rota.paradas
    .map(
      (parada) =>
        `  <wpt lat="${parada.coordenadas[0]}" lon="${parada.coordenadas[1]}">\n    <name>${escapeXml(parada.nome)}</name>\n    <desc>${escapeXml(parada.descricao || '')}</desc>\n  </wpt>`,
    )
    .join('\n');

  const todosWpts = paradasXml
    ? `${waypointsOrigemDestino}\n${paradasXml}`
    : waypointsOrigemDestino;

  const pontosXml = rota.coordenadas
    .map(([lat, lon]) => `    <trkpt lat="${lat}" lon="${lon}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Guia do Turista Inteligente" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Rota: ${escapeXml(origem)} para ${escapeXml(destino)}</name>
    <desc>${escapeXml(rota.titulo)}${rota.distanciaKm === undefined ? '' : ` - ${rota.distanciaKm} km`}${rota.tempoFormatado ? ` (${escapeXml(rota.tempoFormatado)})` : ''}</desc>
  </metadata>
${todosWpts}
  <trk>
    <name>${escapeXml(rota.titulo)}</name>
    <trkseg>
${pontosXml}
    </trkseg>
  </trk>
</gpx>`;
}

export function baixarArquivoGpx(origem: string, destino: string, rota: GpxRoute): void {
  const gpxContent = gerarConteudoGpx(origem, destino, rota);
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const nomeArquivo =
    `rota-${normalizarChave(origem)}-para-${normalizarChave(destino)}.gpx`.toLowerCase();
  link.setAttribute('download', nomeArquivo);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
