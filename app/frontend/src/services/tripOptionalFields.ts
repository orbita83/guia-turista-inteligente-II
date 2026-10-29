import type {
  AtrativoTuristico,
  CategoriaAtrativo,
  CoordenadaGPS,
  ParadaEstrategica,
  PontoElevacao,
  PerfilTopografico,
  RotaAlternativa,
  Viagem,
} from '../types/domain';

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.trim().toUpperCase() !== 'N/D'
    ? value.trim()
    : null;
}

function number(value: unknown, allowNegative = false): number | null {
  return typeof value === 'number' && Number.isFinite(value) && (allowNegative || value >= 0)
    ? value
    : null;
}

function coordinate(value: unknown): CoordenadaGPS | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [latitude, longitude]: unknown[] = value;
  return typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude < 180
    ? [latitude, longitude]
    : null;
}

function coordinates(value: unknown): CoordenadaGPS[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const parsed = value.map(coordinate);
  return parsed.every((point): point is CoordenadaGPS => point !== null) ? parsed : null;
}

function elevationProfile(value: unknown, maxDistanceKm?: number): PontoElevacao[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const points: PontoElevacao[] = [];
  for (const entry of value) {
    const point = record(entry);
    const distanciaKm = number(point?.distanciaKm);
    const altitudeM = number(point?.altitudeM, true);
    if (
      distanciaKm === null ||
      altitudeM === null ||
      (points.length > 0 && distanciaKm <= points[points.length - 1].distanciaKm) ||
      (maxDistanceKm !== undefined && distanciaKm > maxDistanceKm)
    )
      return null;
    points.push({ distanciaKm, altitudeM });
  }
  return points;
}

const categories: readonly CategoriaAtrativo[] = [
  'historico',
  'natureza',
  'gastronomia',
  'mirante',
  'cultura',
  'outro',
];

function attraction(value: unknown): AtrativoTuristico | null {
  const item = record(value);
  if (!item) return null;
  const id = text(item.id);
  const nome = text(item.nome);
  const descricao = text(item.descricao);
  const categoria = categories.find((candidate) => candidate === item.categoria);
  if (!id || !nome || !descricao || !categoria) return null;
  const optionalText = (key: 'destaque' | 'horario' | 'enderecoOuReferencia' | 'icone') =>
    text(item[key]) ? { [key]: text(item[key]) } : {};
  let linkMaps: string | undefined;
  const link = text(item.linkMaps);
  if (link) {
    try {
      const url = new URL(link);
      if (url.protocol === 'https:' || url.protocol === 'http:') linkMaps = url.toString();
    } catch {
      // Ignora URLs externas inválidas.
    }
  }
  return {
    id,
    nome,
    descricao,
    categoria,
    ...optionalText('destaque'),
    ...optionalText('horario'),
    ...optionalText('enderecoOuReferencia'),
    ...optionalText('icone'),
    ...(linkMaps ? { linkMaps } : {}),
    ...(typeof item.visitado === 'boolean' ? { visitado: item.visitado } : {}),
  };
}

function topography(value: unknown): PerfilTopografico | null {
  const item = record(value);
  if (!item) return null;
  const altitudeMaximaM = number(item.altitudeMaximaM, true);
  const desnivelSubidaM = number(item.desnivelSubidaM);
  const desnivelDescidaM = number(item.desnivelDescidaM);
  const desnivelLiquidoM = number(item.desnivelLiquidoM, true);
  const cotaMinimaM = number(item.cotaMinimaM, true);
  const cotaMaximaM = number(item.cotaMaximaM, true);
  const penalizacaoConsumoPct = number(item.penalizacaoConsumoPct);
  if (
    [
      altitudeMaximaM,
      desnivelSubidaM,
      desnivelDescidaM,
      desnivelLiquidoM,
      cotaMinimaM,
      cotaMaximaM,
      penalizacaoConsumoPct,
    ].some((entry) => entry === null)
  )
    return null;
  return {
    altitudeMaximaM: altitudeMaximaM!,
    desnivelSubidaM: desnivelSubidaM!,
    desnivelDescidaM: desnivelDescidaM!,
    desnivelLiquidoM: desnivelLiquidoM!,
    cotaMinimaM: cotaMinimaM!,
    cotaMaximaM: cotaMaximaM!,
    penalizacaoConsumoPct: penalizacaoConsumoPct!,
    ...(number(item.rendimentoRealKmL) !== null
      ? { rendimentoRealKmL: number(item.rendimentoRealKmL)! }
      : {}),
  };
}

function stop(value: unknown): ParadaEstrategica | null {
  const item = record(value);
  if (!item) return null;
  const id = text(item.id);
  const nome = text(item.nome);
  const km = number(item.km);
  const nivelBateriaOuTanquePct = number(item.nivelBateriaOuTanquePct);
  const coordenadas = coordinate(item.coordenadas);
  if (
    !id ||
    !nome ||
    km === null ||
    nivelBateriaOuTanquePct === null ||
    nivelBateriaOuTanquePct > 100 ||
    !coordenadas ||
    (item.tipo !== 'combustivel' && item.tipo !== 'recarga')
  )
    return null;
  return {
    id,
    nome,
    km,
    nivelBateriaOuTanquePct,
    coordenadas,
    tipo: item.tipo,
    ...(text(item.descricao) ? { descricao: text(item.descricao)! } : {}),
  };
}

function route(value: unknown): RotaAlternativa | null {
  const item = record(value);
  if (!item || (item.id !== 'principal' && item.id !== 'economica')) return null;
  const titulo = text(item.titulo);
  const tipoRotulo = text(item.tipoRotulo);
  const descricao = text(item.descricao);
  const resumoDestaque = text(item.resumoDestaque);
  const tempoFormatado = text(item.tempoFormatado);
  const distanciaKm = number(item.distanciaKm);
  const pedagios = number(item.pedagios);
  const autonomiaKm = number(item.autonomiaKm);
  const coordenadas = coordinates(item.coordenadas);
  const topografia = topography(item.topografia);
  const costs = record(item.custos);
  if (
    !titulo ||
    !tipoRotulo ||
    !descricao ||
    !resumoDestaque ||
    !tempoFormatado ||
    distanciaKm === null ||
    pedagios === null ||
    autonomiaKm === null ||
    !coordenadas ||
    !topografia ||
    !costs ||
    !Array.isArray(item.paradas)
  )
    return null;
  const paradas = item.paradas.map(stop);
  if (!paradas.every((entry): entry is ParadaEstrategica => entry !== null)) return null;
  const combustivelOuEnergia = number(costs.combustivelOuEnergia);
  const custosPedagios = number(costs.pedagios);
  const total = number(costs.total);
  const passageiros = number(costs.passageiros);
  const valorPorPassageiro = number(costs.valorPorPassageiro);
  if (
    combustivelOuEnergia === null ||
    custosPedagios === null ||
    total === null ||
    passageiros === null ||
    valorPorPassageiro === null ||
    !Number.isInteger(passageiros) ||
    passageiros < 1
  )
    return null;
  const optionalNumber = (key: 'percentualBrs' | 'distanciaBrsKm' | 'diferencaTempoMinutos') =>
    number(item[key]) !== null ? { [key]: number(item[key]) } : {};
  const perfilElevacao = elevationProfile(item.perfilElevacao, distanciaKm);
  return {
    id: item.id,
    titulo,
    tipoRotulo,
    descricao,
    resumoDestaque,
    tempoFormatado,
    distanciaKm,
    pedagios,
    autonomiaKm,
    coordenadas,
    topografia,
    paradas,
    custos: {
      combustivelOuEnergia,
      pedagios: custosPedagios,
      total,
      passageiros,
      valorPorPassageiro,
    },
    ...optionalNumber('percentualBrs'),
    ...optionalNumber('distanciaBrsKm'),
    ...optionalNumber('diferencaTempoMinutos'),
    ...(perfilElevacao ? { perfilElevacao } : {}),
  };
}

/** Campos futuros só atravessam a fronteira HTTP quando têm formato utilizável. */
export function parseTripOptionalFields(value: RecordValue): Pick<
  Viagem,
  'rotas' | 'atrativos' | 'atrativosVisitadosIds'
> & {
  clima: Partial<Viagem['clima']>;
  percurso: Partial<Viagem['percurso']>;
} {
  const clima = record(value.clima);
  const percurso = record(value.percurso);
  const optionalWeather = (key: 'sensacao' | 'condicao' | 'icone') =>
    text(clima?.[key]) ? { [key]: text(clima?.[key]) } : {};
  const geometria = coordinates(percurso?.geometria);
  const distanceText = typeof percurso?.distancia === 'string' ? percurso.distancia : '';
  const distanceMatch = /^\s*(\d+(?:[.,]\d+)?)\s*km\s*$/i.exec(distanceText);
  const distanceKm = distanceMatch ? Number(distanceMatch[1].replace(',', '.')) : undefined;
  const perfilElevacao = elevationProfile(percurso?.perfilElevacao, distanceKm);
  const rotas = Array.isArray(value.rotas)
    ? value.rotas.map(route).filter((item): item is RotaAlternativa => item !== null)
    : null;
  const atrativos = Array.isArray(value.atrativos)
    ? value.atrativos.map(attraction).filter((item): item is AtrativoTuristico => item !== null)
    : null;
  const ids =
    Array.isArray(value.atrativosVisitadosIds) &&
    value.atrativosVisitadosIds.every((id: unknown) => text(id) !== null)
      ? value.atrativosVisitadosIds.map((id: string) => id.trim())
      : null;
  return {
    clima: {
      ...optionalWeather('sensacao'),
      ...optionalWeather('condicao'),
      ...optionalWeather('icone'),
    },
    percurso: {
      ...(geometria ? { geometria } : {}),
      ...(perfilElevacao ? { perfilElevacao } : {}),
    },
    ...(rotas ? { rotas } : {}),
    ...(atrativos ? { atrativos } : {}),
    ...(ids ? { atrativosVisitadosIds: ids } : {}),
  };
}
