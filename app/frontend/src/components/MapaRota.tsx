import { useEffect, useId, useMemo, useRef } from 'react';
import L from 'leaflet';
import { geometriaValida } from '../services/routeCalculator';

import type { CoordenadaGPS, RotaAlternativa, RoteiroFormData, Viagem } from '../types/domain';

export interface MapaRotaProps {
  viagem: Viagem;
  formParams?: RoteiroFormData | null;
  passageirosIniciais?: number;
  rotaAtivaId?: RotaAlternativa['id'];
  onRotaChange?: (rota: RotaAlternativa) => void;
  alternativaAtiva?: number | null;
  onAlternativaChange?: (index: number | null) => void;
}

export function MapaRota({
  viagem,
  rotaAtivaId = 'principal',
  onRotaChange,
  alternativaAtiva = null,
  onAlternativaChange,
}: MapaRotaProps) {
  const titleId = useId();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const rotas = useMemo(
    () => (viagem.rotas ?? []).filter((rota) => geometriaValida(rota.coordenadas)),
    [viagem.rotas],
  );
  const rotaAtiva = rotas.find((rota) => rota.id === rotaAtivaId) ?? rotas[0];
  const alternativas = viagem.percurso.alternativas ?? [];
  const alternativa = rotas.length ? undefined : alternativas[alternativaAtiva ?? -1];
  const geometria: CoordenadaGPS[] | undefined =
    rotaAtiva?.coordenadas ?? alternativa?.geometria ?? viagem.percurso.geometria;
  const elevation = rotaAtiva
    ? rotaAtiva.perfilElevacao
    : alternativa
      ? alternativa.perfilElevacao
      : viagem.percurso.perfilElevacao;
  const autonomia = rotaAtiva
    ? undefined
    : alternativa
      ? alternativa.autonomia
      : viagem.percurso.autonomia;
  const custos = rotaAtiva ? undefined : alternativa ? alternativa.custos : viagem.percurso.custos;
  const dinheiro = (valor: string) =>
    Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const paradas = autonomia?.paradas;
  const elevations = elevation?.map((point) => point.altitudeM) ?? [];
  const minAltitude = elevations.reduce((min, altitude) => Math.min(min, altitude), Infinity);
  const maxAltitude = elevations.reduce((max, altitude) => Math.max(max, altitude), -Infinity);
  const distanceEnd = elevation?.[elevation.length - 1]?.distanciaKm ?? 0;
  const chartPoints = elevation
    ?.map((point) => {
      const x = distanceEnd > 0 ? (point.distanciaKm / distanceEnd) * 480 + 10 : 10;
      const y =
        maxAltitude > minAltitude
          ? 90 - ((point.altitudeM - minAltitude) / (maxAltitude - minAltitude)) * 80
          : 50;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  useEffect(() => {
    if (!mapContainerRef.current || !geometriaValida(geometria) || !geometria) return;
    const map = L.map(mapContainerRef.current, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    const line = L.polyline(geometria, { color: '#0284c7', weight: 5 }).addTo(map);
    for (const parada of paradas ?? []) {
      const tooltip = document.createElement('span');
      tooltip.textContent = `${parada.nome} — ${parada.origem === 'verificado' ? 'estabelecimento verificado' : 'ponto projetado, não confirmado'}`;
      L.circleMarker(parada.coordenadas, { radius: 7, color: '#b45309' })
        .bindTooltip(tooltip)
        .addTo(map);
    }
    map.fitBounds(line.getBounds(), { padding: [30, 30] });
    return () => {
      map.remove();
    };
  }, [geometria, paradas]);

  return (
    <section className="mapa-card" aria-labelledby={titleId}>
      <header className="mapa-heading">
        <span className="mapa-heading-icon" aria-hidden="true">
          🗺️
        </span>
        <div>
          <h2 id={titleId}>Mapa da Rota & Paradas</h2>
          <p>Traçado disponível apenas quando a viagem traz geometria válida.</p>
        </div>
      </header>

      {geometriaValida(geometria) && geometria ? (
        <>
          {rotas.length > 1 && (
            <div className="control-button-group" role="group" aria-label="Rotas disponíveis">
              {rotas.map((rota) => (
                <button
                  key={rota.id}
                  type="button"
                  className={`btn-pill-control${rotaAtiva?.id === rota.id ? ' is-active' : ''}`}
                  aria-pressed={rotaAtiva?.id === rota.id}
                  onClick={() => onRotaChange?.(rota)}
                >
                  {rota.titulo}
                </button>
              ))}
            </div>
          )}
          {rotas.length === 0 && alternativas.length > 0 && (
            <div className="control-button-group" role="group" aria-label="Rotas disponíveis">
              <button
                type="button"
                className={`btn-pill-control${alternativaAtiva === null ? ' is-active' : ''}`}
                aria-pressed={alternativaAtiva === null}
                onClick={() => onAlternativaChange?.(null)}
              >
                Rota principal
              </button>
              {alternativas.map((rota, index) => (
                <button
                  key={index}
                  type="button"
                  className={`btn-pill-control${alternativaAtiva === index ? ' is-active' : ''}`}
                  aria-pressed={alternativaAtiva === index}
                  onClick={() => onAlternativaChange?.(index)}
                >
                  Alternativa {index + 1} ({rota.distancia})
                </button>
              ))}
            </div>
          )}
          <div className="map-container-wrapper">
            <div
              ref={mapContainerRef}
              className="leaflet-map-root"
              role="img"
              aria-label={`Traçado de ${viagem.origem} até ${viagem.destino}`}
            />
          </div>
          <div role="region" aria-label="Descrição textual da rota">
            <p>
              {rotaAtiva?.titulo ??
                (alternativa ? `Alternativa ${(alternativaAtiva ?? 0) + 1}` : 'Traçado principal')}
              : {viagem.origem} até {viagem.destino}. Distância:{' '}
              {rotaAtiva
                ? `${rotaAtiva.distanciaKm} km`
                : (alternativa?.distancia ?? viagem.percurso.distancia)}
              . Duração: {rotaAtiva?.tempoFormatado ?? alternativa?.tempo ?? viagem.percurso.tempo}.
            </p>
          </div>
          {rotaAtiva && (
            <div className="metrics-grid" aria-label="Métricas da rota ativa">
              <p>Autonomia: {rotaAtiva.autonomiaKm} km</p>
              <p>Pedágios: R$ {rotaAtiva.pedagios.toFixed(2)}</p>
              <p>Custo total: R$ {rotaAtiva.custos.total.toFixed(2)}</p>
              <p>Paradas: {rotaAtiva.paradas.length}</p>
              {rotaAtiva.paradas.map((parada) => (
                <p key={parada.id}>
                  {parada.nome}: km {parada.km}
                </p>
              ))}
            </div>
          )}
          {autonomia && (
            <div className="metrics-grid" aria-label="Autonomia e paradas da rota">
              {autonomia.autonomiaMaximaKm !== undefined && (
                <p>
                  Autonomia nominal estimada: {autonomia.autonomiaMaximaKm} km, considerando tanque
                  ou bateria cheios e sem ajuste de relevo.
                </p>
              )}
              {!autonomia.sucesso || !autonomia.solucaoSegura ? (
                <p role="status">Não foi possível confirmar um plano de paradas seguro.</p>
              ) : null}
              <p>
                Paradas informadas: {autonomia.paradas.length}. Confirme postos e disponibilidade
                antes da viagem.
              </p>
              {autonomia.paradas.map((parada) => (
                <p key={parada.id}>
                  {parada.nome}: km {parada.km} —{' '}
                  {parada.origem === 'verificado'
                    ? 'estabelecimento verificado'
                    : 'ponto projetado, não confirmado'}
                </p>
              ))}
            </div>
          )}
          {custos && (
            <div className="metrics-grid" aria-label="Custos estimados da rota">
              <p>Combustível ou energia: {dinheiro(custos.custoPropulsao)}</p>
              <p>
                {custos.totalCompleto
                  ? 'Total estimado'
                  : 'Total parcial, pedágios incompletos ou indisponíveis'}
                : {dinheiro(custos.custoTotal)}
              </p>
              {!custos.totalCompleto && (
                <p>Os pedágios não estão completos; o valor não é o custo final da viagem.</p>
              )}
              <p>Rateio {custos.totalCompleto ? 'estimado' : 'parcial'}:</p>
              {custos.cotas.map((cota) => (
                <p key={cota.passageiro}>
                  Passageiro {cota.passageiro}: {dinheiro(cota.valor)}
                </p>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="map-unavailable" role="status">
          <p>Traçado rodoviário indisponível para esta viagem.</p>
          <p>Distância informada: {viagem.percurso.distancia}.</p>
          <p>Duração informada: {viagem.percurso.tempo}.</p>
        </div>
      )}

      <div className="topografia-card" aria-label="Topografia e relevo">
        <h3>Topografia e relevo</h3>
        {elevation && elevation.length >= 2 ? (
          <>
            <p>
              Elevação recebida: {minAltitude} m a {maxAltitude} m ao longo de {distanceEnd} km.
            </p>
            <svg
              viewBox="0 0 500 100"
              role="img"
              aria-label={`Perfil de elevação de ${minAltitude} a ${maxAltitude} metros`}
            >
              <polyline points={chartPoints} fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </>
        ) : (
          <p role="status">Perfil de elevação indisponível para esta viagem.</p>
        )}
      </div>
    </section>
  );
}
