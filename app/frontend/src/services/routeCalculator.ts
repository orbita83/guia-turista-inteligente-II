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

// Interpolação de coordenadas para gerar a polyline entre origem e destino
export function gerarCoordenadasRota(
  origem: CoordenadaGPS,
  destino: CoordenadaGPS,
  desvioCurvatura = 0,
): CoordenadaGPS[] {
  const pontos: CoordenadaGPS[] = [];
  const totalPontos = 10;
  for (let i = 0; i <= totalPontos; i++) {
    const t = i / totalPontos;
    // Interpolação linear + curva quadrática lateral baseada no desvio
    const curva = Math.sin(t * Math.PI) * desvioCurvatura;
    const lat = origem[0] + (destino[0] - origem[0]) * t + curva * 0.4;
    const lon = origem[1] + (destino[1] - origem[1]) * t + curva;
    pontos.push([Number(lat.toFixed(5)), Number(lon.toFixed(5))]);
  }
  return pontos;
}

export function calcularParadasEstrategicas(
  distanciaKm: number,
  autonomiaKm: number,
  propulsao: 'combustao' | 'eletrico',
  coordenadasRota: CoordenadaGPS[],
): ParadaEstrategica[] {
  // Margem de segurança de ~18% (RN-CST-002)
  const margemSeguranca = 0.18;
  const limiteCriticoKm = autonomiaKm * (1 - margemSeguranca);
  const paradas: ParadaEstrategica[] = [];

  if (distanciaKm <= limiteCriticoKm) {
    return paradas;
  }

  // Intervalo operacional seguro (antes dos 18% críticos)
  const intervaloParada = Math.round(autonomiaKm * 0.75);
  let kmAcumulado = intervaloParada;
  let indice = 1;

  while (kmAcumulado < distanciaKm) {
    const t = kmAcumulado / distanciaKm;
    const idxCoord = Math.min(
      coordenadasRota.length - 1,
      Math.max(0, Math.round(t * (coordenadasRota.length - 1))),
    );
    const coord = coordenadasRota[idxCoord];
    const tipo = propulsao === 'eletrico' ? 'recarga' : 'combustivel';
    const icone = propulsao === 'eletrico' ? '⚡ Eletroposto' : '⛽ Posto';

    paradas.push({
      id: `parada-${indice}`,
      nome: `${icone} km ${kmAcumulado} (Parada ${indice})`,
      km: kmAcumulado,
      tipo,
      nivelBateriaOuTanquePct: 22, // Reserva ao chegar antes do limite de 18%
      coordenadas: coord,
      descricao:
        propulsao === 'eletrico'
          ? 'Recarga rápida de conveniência (~30 min)'
          : 'Abastecimento e parada de descanso (~15 min)',
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

export function gerarRotasAlternativas(
  viagem: Viagem,
  form?: RoteiroFormData,
  passageiros = 1,
  propulsaoOverride?: TipoPropulsao,
): RotaAlternativa[] {
  const distanciaBaseKm = extrairKmDeTexto(viagem.percurso?.distancia);
  const coordOrigem = obterCoordenadasLocal(viagem.origem, form?.origem_uf);
  const coordDestino = obterCoordenadasLocal(viagem.destino, form?.destino_uf);
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
  const coordsPrincipal = gerarCoordenadasRota(coordOrigem, coordDestino, 0.2);
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
  const coordsEconomica = gerarCoordenadasRota(coordOrigem, coordDestino, -0.45);
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

// Gerador de arquivo GPX 1.1 em conformidade com o padrão TopoGrafix
export function gerarConteudoGpx(origem: string, destino: string, rota: RotaAlternativa): string {
  const agora = new Date().toISOString();
  const pontosXml = rota.coordenadas
    .map(
      (coord) =>
        `      <trkpt lat="${coord[0]}" lon="${coord[1]}">\n        <time>${agora}</time>\n      </trkpt>`,
    )
    .join('\n');

  const waypointsParadas = rota.paradas
    .map(
      (parada) =>
        `  <wpt lat="${parada.coordenadas[0]}" lon="${parada.coordenadas[1]}">\n    <name>${parada.nome}</name>\n    <desc>${parada.descricao || 'Parada por autonomia'}</desc>\n  </wpt>`,
    )
    .join('\n');

  const coordOrigem = rota.coordenadas[0] || [0, 0];
  const coordDestino = rota.coordenadas[rota.coordenadas.length - 1] || [0, 0];

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Guia do Turista Brasil - GTI 2.0" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Roteiro: ${origem} para ${destino}</name>
    <desc>${rota.titulo} - ${rota.distanciaKm} km - ${rota.tempoFormatado}</desc>
    <time>${agora}</time>
  </metadata>
  <wpt lat="${coordOrigem[0]}" lon="${coordOrigem[1]}">
    <name>Origem: ${origem}</name>
  </wpt>
  <wpt lat="${coordDestino[0]}" lon="${coordDestino[1]}">
    <name>Destino: ${destino}</name>
  </wpt>
${waypointsParadas}
  <trk>
    <name>${rota.titulo}</name>
    <trkseg>
${pontosXml}
    </trkseg>
  </trk>
</gpx>`;
}

export function baixarArquivoGpx(origem: string, destino: string, rota: RotaAlternativa): void {
  const conteudo = gerarConteudoGpx(origem, destino, rota);
  const blob = new Blob([conteudo], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const nomeArquivo =
    `roteiro-${normalizarChave(origem)}-${normalizarChave(destino)}.gpx`.toLowerCase();
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function gerarLinkGoogleMaps(origem: string, destino: string): string {
  const base = 'https://www.google.com/maps/dir/?api=1';
  return `${base}&origin=${encodeURIComponent(origem)}&destination=${encodeURIComponent(destino)}&travelmode=driving`;
}

export function gerarLinkWhatsApp(origem: string, destino: string, rota: RotaAlternativa): string {
  const texto = [
    `🚗 *Planejamento de Viagem - Guia do Turista*`,
    `📍 *Origem:* ${origem}`,
    `🏁 *Destino:* ${destino}`,
    `🛣️ *Rota:* ${rota.titulo}`,
    `📏 *Distância:* ${rota.distanciaKm} km | ⏱️ *Tempo:* ${rota.tempoFormatado}`,
    `💰 *Custo Total Previsto:* R$ ${rota.custos.total.toFixed(2)}`,
    rota.custos.passageiros > 1
      ? `👥 *Rateio (${rota.custos.passageiros} passageiros):* R$ ${rota.custos.valorPorPassageiro.toFixed(2)} cada`
      : '',
    rota.paradas.length > 0
      ? `⛽ *Paradas recomendadas:* ${rota.paradas.length} paradas estratégicas`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
}
