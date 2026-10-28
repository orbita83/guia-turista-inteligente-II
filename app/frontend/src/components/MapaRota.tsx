import { useEffect, useId, useMemo, useRef, useState } from 'react';
import L from 'leaflet';

import type { CoordenadaGPS, RotaAlternativa, RoteiroFormData, Viagem } from '../types/domain';

export interface MapaRotaProps {
  viagem: Viagem;
  formParams?: RoteiroFormData | null;
  passageirosIniciais?: number;
  onRotaChange?: (rota: RotaAlternativa) => void;
}

export function MapaRota({ viagem, onRotaChange }: MapaRotaProps) {
  const titleId = useId();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [rotaAtivaId, setRotaAtivaId] = useState<RotaAlternativa['id']>('principal');
  const rotas = useMemo(
    () => (viagem.rotas ?? []).filter((rota) => rota.coordenadas.length >= 2),
    [viagem.rotas],
  );
  const rotaAtiva = rotas.find((rota) => rota.id === rotaAtivaId) ?? rotas[0];
  const geometria: CoordenadaGPS[] | undefined =
    rotaAtiva?.coordenadas ?? viagem.percurso.geometria;
  const elevation = rotaAtiva ? rotaAtiva.perfilElevacao : viagem.percurso.perfilElevacao;
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
    if (rotaAtiva) onRotaChange?.(rotaAtiva);
  }, [rotaAtiva, onRotaChange]);

  useEffect(() => {
    if (!mapContainerRef.current || !geometria || geometria.length < 2) return;
    const map = L.map(mapContainerRef.current, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    const line = L.polyline(geometria, { color: '#0284c7', weight: 5 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [30, 30] });
    return () => {
      map.remove();
    };
  }, [geometria]);

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

      {geometria && geometria.length >= 2 ? (
        <>
          {rotas.length > 1 && (
            <div className="control-button-group" role="group" aria-label="Rotas disponíveis">
              {rotas.map((rota) => (
                <button
                  key={rota.id}
                  type="button"
                  className={`btn-pill-control${rotaAtiva?.id === rota.id ? ' is-active' : ''}`}
                  aria-pressed={rotaAtiva?.id === rota.id}
                  onClick={() => setRotaAtivaId(rota.id)}
                >
                  {rota.titulo}
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
              {rotaAtiva?.titulo ?? 'Traçado principal'}: {viagem.origem} até {viagem.destino}.
              Distância: {rotaAtiva ? `${rotaAtiva.distanciaKm} km` : viagem.percurso.distancia}.
              Duração: {rotaAtiva?.tempoFormatado ?? viagem.percurso.tempo}.
            </p>
          </div>
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
