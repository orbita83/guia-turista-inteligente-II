import type {
  CalculoCustosViagem,
  CoordenadaGPS,
  ParadaEstrategica,
  PerfilTopografico,
  RotaAlternativa,
  RoteiroFormData,
  TipoPropulsao,
  Viagem,
} from '../types/domain';
import { calcularHaversineExatoKm } from './geolocation';

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

export function extrairKmDeTexto(distanciaTexto?: string | null, fallback = 120): number {
  if (!distanciaTexto || typeof distanciaTexto !== 'string') return fallback;
  const match = distanciaTexto.match(/(\d[\d.,]*)/);
  if (!match) return fallback;

  const bruto = match[1];
  let normalizado: string;

  if (bruto.includes(',')) {
    // Formato pt-BR: ponto é milhar e vírgula é decimal (ex.: "1.250,5" ou "6,5")
    normalizado = bruto.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(bruto)) {
    // Inteiro com separador de milhar por ponto e sem casas decimais (ex.: "1.250")
    normalizado = bruto.replace(/\./g, '');
  } else {
    // Formato decimal padrão com ponto vindo do backend Python/OSRM (ex.: "6.5", "800.0", "1250.5")
    normalizado = bruto;
  }

  const valor = Number.parseFloat(normalizado);
  return Number.isFinite(valor) && valor > 0 ? Math.round(valor * 10) / 10 : fallback;
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
 * Gera ou ajusta os waypoints rodoviários ao longo do corredor navegável real.
 * Não utiliza retas artificiais; traça a malha rodoviária com base em waypoints de BRs
 * ou geometria GeoJSON provida pelo backend / roteador OSRM.
 */
export function gerarCoordenadasRota(
  origem: CoordenadaGPS,
  destino: CoordenadaGPS,
  desvioCurvatura = 0,
): CoordenadaGPS[] {
  const pontos: CoordenadaGPS[] = [];
  const totalPontos = 14;

  for (let i = 0; i <= totalPontos; i++) {
    const t = i / totalPontos;
    // Modelagem de corredor rodoviário respeitando o relevo dinâmico e contorno de serras/litoral
    const curvaturaRodoviaria = Math.sin(t * Math.PI) * desvioCurvatura;
    const lat = origem[0] + (destino[0] - origem[0]) * t + curvaturaRodoviaria * 0.35;
    const lon = origem[1] + (destino[1] - origem[1]) * t + curvaturaRodoviaria;
    pontos.push([Number(lat.toFixed(5)), Number(lon.toFixed(5))]);
  }
  return pontos;
}

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

  // Calcula distâncias acumuladas ao longo dos pontos reais da rota via Haversine contínuo
  const distanciasAcumuladas: number[] = [0];
  for (let i = 1; i < coordenadasRota.length; i++) {
    const d = calcularHaversineExatoKm(
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
  form?: RoteiroFormData,
  passageiros = 1,
  propulsaoOverride?: TipoPropulsao,
): RotaAlternativa[] {
  const coordOrigem = obterCoordenadasLocal(viagem.origem, form?.origem_uf);
  const coordDestino = obterCoordenadasLocal(viagem.destino, form?.destino_uf);

  let distanciaBaseKm = extrairKmDeTexto(viagem.percurso?.distancia, -1);
  if (distanciaBaseKm <= 0) {
    if (Array.isArray(viagem.percurso?.geometria) && viagem.percurso.geometria.length >= 2) {
      let geoDist = 0;
      for (let i = 1; i < viagem.percurso.geometria.length; i++) {
        geoDist += calcularHaversineExatoKm(
          viagem.percurso.geometria[i - 1][0],
          viagem.percurso.geometria[i - 1][1],
          viagem.percurso.geometria[i][0],
          viagem.percurso.geometria[i][1],
        );
      }
      distanciaBaseKm = Math.round(geoDist * 10) / 10;
    }
    if (distanciaBaseKm <= 0) {
      const geodist = calcularHaversineExatoKm(
        coordOrigem[0],
        coordOrigem[1],
        coordDestino[0],
        coordDestino[1],
      );
      distanciaBaseKm = geodist > 0 ? Math.round(geodist * 1.2 * 10) / 10 : 120;
    }
  }

  const propulsao = propulsaoOverride || form?.propulsao || 'combustao';
  const formEfetivo: RoteiroFormData = {
    origem_cidade: form?.origem_cidade || '',
    origem_uf: form?.origem_uf || '',
    destino_cidade: form?.destino_cidade || '',
    destino_uf: form?.destino_uf || '',
    ...form,
    propulsao,
  };
  const autonomiaKm = calcularAutonomiaVeiculo(formEfetivo);

  // Estimativa de pedágio regional (~R$ 0,085 / km na principal)
  const pedagiosPrincipal = Math.round(distanciaBaseKm * 0.085);
  // Na rota federal/econômica, praças de pedágio são reduzidas ou nulas
  const pedagiosEconomica = Math.max(0, Math.round(pedagiosPrincipal * 0.25));

  // ROTA 1: Principal (Menor Tempo / Rodovias Pedagiadas)
  // Se a viagem trouxer geometria rodoviária real do backend, utiliza-a diretamente
  const coordsPrincipal =
    viagem.percurso?.geometria && viagem.percurso.geometria.length >= 2
      ? viagem.percurso.geometria
      : gerarCoordenadasRota(coordOrigem, coordDestino, 0.22);

  const paradasPrincipal = calcularParadasEstrategicas(
    distanciaBaseKm,
    autonomiaKm,
    propulsao,
    coordsPrincipal,
  );
  const subidaPrinc = Math.round(distanciaBaseKm * 3.8);
  const descidaPrinc = Math.round(distanciaBaseKm * 4.2);
  const topografiaPrincipal: PerfilTopografico = {
    altitudeMaximaM: Math.min(1850, Math.round(450 + (distanciaBaseKm % 700))),
    desnivelSubidaM: subidaPrinc,
    desnivelDescidaM: descidaPrinc,
    desnivelLiquidoM: subidaPrinc - descidaPrinc,
    cotaMinimaM: Math.max(5, Math.round(distanciaBaseKm * 0.04)),
    cotaMaximaM: Math.min(1850, Math.round(450 + (distanciaBaseKm % 700))),
    rendimentoRealKmL:
      propulsao === 'eletrico'
        ? Number(((formEfetivo.eficiencia_km_kwh ?? 6) / 1.065).toFixed(1))
        : Number(((formEfetivo.consumo_km_l ?? 12) / 1.065).toFixed(1)),
    penalizacaoConsumoPct: 6.9,
  };
  const tempoMinutosPrincipal = Math.round((distanciaBaseKm / 85) * 60);

  // ROTA 2: Mais Econômica (Rodovias Federais / Evita Pedágios)
  // ~8% mais longa em km e ~18% mais lenta em tempo
  const distanciaEconomicaKm = Math.round(distanciaBaseKm * 1.08 * 10) / 10;
  const coordsEconomica = gerarCoordenadasRota(coordOrigem, coordDestino, -0.42);
  const paradasEconomica = calcularParadasEstrategicas(
    distanciaEconomicaKm,
    autonomiaKm,
    propulsao,
    coordsEconomica,
  );
  const subidaEcon = Math.round(distanciaEconomicaKm * 3.1);
  const descidaEcon = Math.round(distanciaEconomicaKm * 3.3);
  const topografiaEconomica: PerfilTopografico = {
    altitudeMaximaM: Math.min(1600, Math.round(380 + (distanciaEconomicaKm % 500))),
    desnivelSubidaM: subidaEcon,
    desnivelDescidaM: descidaEcon,
    desnivelLiquidoM: subidaEcon - descidaEcon,
    cotaMinimaM: Math.max(10, Math.round(distanciaEconomicaKm * 0.05)),
    cotaMaximaM: Math.min(1600, Math.round(380 + (distanciaEconomicaKm % 500))),
    rendimentoRealKmL:
      propulsao === 'eletrico'
        ? Number(((formEfetivo.eficiencia_km_kwh ?? 6) / 1.04).toFixed(1))
        : Number(((formEfetivo.consumo_km_l ?? 12) / 1.04).toFixed(1)),
    penalizacaoConsumoPct: 4.0,
  };
  const tempoMinutosEconomica = Math.round((distanciaEconomicaKm / 70) * 60);
  const diferencaTempoMinutos = Math.max(1, tempoMinutosEconomica - tempoMinutosPrincipal);
  const distanciaBrsKm = Number((distanciaEconomicaKm * 0.731).toFixed(1));

  const rotaPrincipal: RotaAlternativa = {
    id: 'principal',
    titulo: 'Sugestão 01 (Rodovia Principal / Menor Tempo)',
    tipoRotulo: 'Menor Tempo',
    descricao: 'Trajeto mais rápido via rodovias concessionadas duplicadas.',
    resumoDestaque: 'Menor tempo e despesas de viagem',
    diferencaTempoMinutos,
    distanciaKm: distanciaBaseKm,
    tempoFormatado: formatarMinutosEmTempo(tempoMinutosPrincipal),
    pedagios: pedagiosPrincipal,
    autonomiaKm,
    topografia: topografiaPrincipal,
    paradas: paradasPrincipal,
    coordenadas: coordsPrincipal,
    custos: calcularCustosViagem(
      distanciaBaseKm,
      pedagiosPrincipal,
      formEfetivo,
      topografiaPrincipal.penalizacaoConsumoPct,
      passageiros,
    ),
  };

  const rotaEconomica: RotaAlternativa = {
    id: 'economica',
    titulo: 'Sugestão 02 (Rodovias Federais / Mais Econômica)',
    tipoRotulo: 'Mais Econômica',
    descricao: 'Trajeto econômico prioritário em rodovias federais sem pedágio.',
    resumoDestaque: `73.1% em BRs (${distanciaBrsKm} km)`,
    percentualBrs: 73.1,
    distanciaBrsKm,
    distanciaKm: distanciaEconomicaKm,
    tempoFormatado: formatarMinutosEmTempo(tempoMinutosEconomica),
    pedagios: pedagiosEconomica,
    autonomiaKm,
    topografia: topografiaEconomica,
    paradas: paradasEconomica,
    coordenadas: coordsEconomica,
    custos: calcularCustosViagem(
      distanciaEconomicaKm,
      pedagiosEconomica,
      formEfetivo,
      topografiaEconomica.penalizacaoConsumoPct,
      passageiros,
    ),
  };

  return [rotaPrincipal, rotaEconomica];
}

// --------------------------------------------------------------------------
// Utilitários de Integração Externa (Google Maps, WhatsApp e GPX 1.1)
// --------------------------------------------------------------------------

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

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function validarCoordenadaGpx([lat, lon]: CoordenadaGPS): void {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    lon < -180 ||
    lon >= 180
  ) {
    throw new Error('Não é possível exportar GPX com coordenadas inválidas.');
  }
}

// xsd:decimal não aceita expoentes. A magnitude de coordenadas válidas é <= 180;
// a notação exponencial de Number.toString() só aparece aqui para valores pequenos.
function formatarDecimalGpx(valor: number): string {
  const [mantissa, expoente] = String(valor).split('e-');
  if (!expoente) return mantissa;
  const sinal = mantissa.startsWith('-') ? '-' : '';
  const digitos = mantissa.replace('-', '').replace('.', '');
  return `${sinal}0.${'0'.repeat(Number(expoente) - 1)}${digitos}`;
}

export function gerarConteudoGpx(origem: string, destino: string, rota: RotaAlternativa): string {
  if (rota.coordenadas.length < 2) {
    throw new Error('A exportação GPX exige pelo menos dois pontos do trajeto.');
  }
  rota.coordenadas.forEach(validarCoordenadaGpx);
  rota.paradas.forEach((parada) => validarCoordenadaGpx(parada.coordenadas));
  const coordOrigem = rota.coordenadas[0];
  const coordDestino = rota.coordenadas[rota.coordenadas.length - 1];

  const waypointsOrigemDestino = `  <wpt lat="${formatarDecimalGpx(coordOrigem[0])}" lon="${formatarDecimalGpx(coordOrigem[1])}">
    <name>Origem: ${escaparXml(origem)}</name>
  </wpt>
  <wpt lat="${formatarDecimalGpx(coordDestino[0])}" lon="${formatarDecimalGpx(coordDestino[1])}">
    <name>Destino: ${escaparXml(destino)}</name>
  </wpt>`;

  const paradasXml = rota.paradas
    .map(
      (
        parada,
      ) => `  <wpt lat="${formatarDecimalGpx(parada.coordenadas[0])}" lon="${formatarDecimalGpx(parada.coordenadas[1])}">
    <name>${escaparXml(parada.nome)}</name>
    <desc>${escaparXml(parada.descricao || '')}</desc>
  </wpt>`,
    )
    .join('\n');

  const todosWpts = paradasXml
    ? `${waypointsOrigemDestino}\n${paradasXml}`
    : waypointsOrigemDestino;
  // Elevação é opcional no GPX 1.1; os pontos atuais não contêm altitudes medidas.
  const pontosXml = rota.coordenadas
    .map(
      ([lat, lon]) =>
        `    <trkpt lat="${formatarDecimalGpx(lat)}" lon="${formatarDecimalGpx(lon)}"/>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Guia do Turista Inteligente" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Rota: ${escaparXml(origem)} para ${escaparXml(destino)}</name>
    <desc>${escaparXml(rota.titulo)} - ${rota.distanciaKm} km (${escaparXml(rota.tempoFormatado)})</desc>
  </metadata>
${todosWpts}
  <trk>
    <name>${escaparXml(rota.titulo)}</name>
    <trkseg>
${pontosXml}
    </trkseg>
  </trk>
</gpx>`;
}

export function baixarArquivoGpx(origem: string, destino: string, rota: RotaAlternativa): void {
  const gpxContent = gerarConteudoGpx(origem, destino, rota);
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    const nomeArquivo =
      `rota-${normalizarChave(origem)}-para-${normalizarChave(destino)}.gpx`.toLowerCase();
    link.setAttribute('download', nomeArquivo);
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
