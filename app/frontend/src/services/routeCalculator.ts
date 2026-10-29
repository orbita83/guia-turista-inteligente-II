import type { CoordenadaGPS, RotaAlternativa, Viagem } from '../types/domain';

function normalizarChave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function gerarRotasAlternativas(viagem: Viagem): RotaAlternativa[] {
  // TODO(integracao): representar alternativas OSRM reais sem fabricar custos, paradas ou relevo.
  return viagem.rotas ?? [];
}

export function gerarLinkGoogleMaps(origem: string, destino: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origem)}&destination=${encodeURIComponent(destino)}&travelmode=driving`;
}

export function gerarLinkWhatsApp(
  origem: string,
  destino: string,
  distanciaOuRota: string | RotaAlternativa,
  tempo?: string,
): string {
  const distancia =
    typeof distanciaOuRota === 'string' ? distanciaOuRota : `${distanciaOuRota.distanciaKm} km`;
  const duracao =
    typeof distanciaOuRota === 'string' ? (tempo ?? '') : distanciaOuRota.tempoFormatado;
  const texto = `🚗 Rota do Guia do Turista Brasil\nPartida: ${origem}\nDestino: ${destino}\nDistância: ${distancia}\nTempo de viagem: ${duracao}`;
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
}

export type GpxRoute = Pick<RotaAlternativa, 'titulo' | 'coordenadas' | 'paradas'> &
  Partial<Pick<RotaAlternativa, 'distanciaKm' | 'tempoFormatado'>>;

export function geometriaValida(geometria?: CoordenadaGPS[]): boolean {
  return Boolean(
    geometria &&
    geometria.length >= 2 &&
    geometria.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every(
          (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
        ) &&
        Math.abs(point[0]) <= 90 &&
        point[1] >= -180 && point[1] < 180,
    ),
  );
}

function escapeXml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function decimalGpx(value: number): string {
  const [mantissa, exponent] = String(value).split('e-');
  if (!exponent) return mantissa;
  const sign = mantissa.startsWith('-') ? '-' : '';
  const digits = mantissa.replace('-', '').replace('.', '');
  return `${sign}0.${'0'.repeat(Number(exponent) - 1)}${digits}`;
}

export function gerarConteudoGpx(origem: string, destino: string, rota: GpxRoute): string {
  if (!geometriaValida(rota.coordenadas)) {
    throw new Error('Geometria indisponível: informe pelo menos dois pontos e coordenadas válidas para GPX.');
  }
  if (rota.paradas.some((parada) => !geometriaValida([parada.coordenadas, parada.coordenadas]))) {
    throw new Error('Não é possível exportar GPX com coordenadas inválidas.');
  }
  const [coordOrigem] = rota.coordenadas;
  const coordDestino = rota.coordenadas[rota.coordenadas.length - 1];
  const waypoints: { coordenadas: CoordenadaGPS; nome: string; descricao?: string }[] = [
    { coordenadas: coordOrigem, nome: `Origem: ${origem}` },
    { coordenadas: coordDestino, nome: `Destino: ${destino}` },
    ...rota.paradas.map((parada) => ({ coordenadas: parada.coordenadas, nome: parada.nome, descricao: parada.descricao })),
  ];
  const waypointsXml = waypoints
    .map(
      ({ coordenadas: [lat, lon], nome, descricao }) =>
        `  <wpt lat="${decimalGpx(lat)}" lon="${decimalGpx(lon)}"><name>${escapeXml(nome)}</name>${descricao ? `<desc>${escapeXml(descricao)}</desc>` : ''}</wpt>`,
    )
    .join('\n');
  const pointsXml = rota.coordenadas
    .map(([lat, lon]) => `      <trkpt lat="${decimalGpx(lat)}" lon="${decimalGpx(lon)}" />`)
    .join('\n');
  const summary = `${rota.titulo}${rota.distanciaKm === undefined ? '' : ` - ${rota.distanciaKm} km`}${rota.tempoFormatado ? ` (${rota.tempoFormatado})` : ''}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Guia do Turista Inteligente" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Rota: ${escapeXml(origem)} para ${escapeXml(destino)}</name><desc>${escapeXml(summary)}</desc></metadata>
${waypointsXml}
  <trk><name>${escapeXml(rota.titulo)}</name><trkseg>
${pointsXml}
  </trkseg></trk>
</gpx>`;
}

export function baixarArquivoGpx(origem: string, destino: string, rota: GpxRoute): void {
  const content = gerarConteudoGpx(origem, destino, rota);
  const url = URL.createObjectURL(
    new Blob([content], { type: 'application/gpx+xml;charset=utf-8' }),
  );
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = `rota-${normalizarChave(origem)}-para-${normalizarChave(destino)}.gpx`;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
