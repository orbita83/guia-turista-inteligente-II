import { useEffect, useId, useMemo, useRef, useState } from 'react';
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

function coordenadaValida([latitude, longitude]: CoordenadaGPS): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

export function MapaRota({
  viagem,
  formParams,
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
  const distanciaAtiva = rotaAtiva
    ? `${rotaAtiva.distanciaKm} km`
    : (alternativa?.distancia ?? viagem.percurso.distancia);
  const tempoAtivo = rotaAtiva?.tempoFormatado ?? alternativa?.tempo ?? viagem.percurso.tempo;
  const paradasAtivas = rotaAtiva?.paradas ?? autonomia?.paradas;
  const autonomiaAtiva = rotaAtiva?.autonomiaKm ?? autonomia?.autonomiaMaximaKm;
  const dinheiro = (valor: string) =>
    Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const [expandirPerfil, setExpandirPerfil] = useState(true);

  const topografiaObj = rotaAtiva
    ? rotaAtiva.topografia
    : alternativa
      ? alternativa.topografia
      : viagem.percurso.topografia;

  const elevations = elevation?.map((point) => point.altitudeM) ?? [];
  const minAltitude = elevations.reduce((min, altitude) => Math.min(min, altitude), Infinity);
  const maxAltitude = elevations.reduce((max, altitude) => Math.max(max, altitude), -Infinity);
  const distanceEnd = elevation?.[elevation.length - 1]?.distanciaKm ?? 0;

  const cotaMinExibida = minAltitude !== Infinity ? minAltitude : topografiaObj?.cotaMinimaM;
  const cotaMaxExibida = maxAltitude !== -Infinity ? maxAltitude : topografiaObj?.cotaMaximaM;

  const subidasM =
    topografiaObj?.subidasAcumuladasM ??
    topografiaObj?.desnivelSubidaM ??
    (elevations.length >= 2
      ? elevations
          .slice(1)
          .reduce((sum, altitude, index) => sum + Math.max(0, altitude - elevations[index]), 0)
      : undefined);
  const descidasM =
    topografiaObj?.descidasAcumuladasM ??
    topografiaObj?.desnivelDescidaM ??
    (elevations.length >= 2
      ? elevations
          .slice(1)
          .reduce((sum, altitude, index) => sum + Math.max(0, elevations[index] - altitude), 0)
      : undefined);
  const desnivelLiquidoM =
    topografiaObj?.desnivelLiquidoM ??
    (subidasM !== undefined && descidasM !== undefined ? subidasM - descidasM : undefined);

  const penalizacaoPct =
    topografiaObj?.penalizacaoConsumoPct ?? topografiaObj?.dadosConsumo?.penalizacaoConsumoPct;

  const fatorTerreno = topografiaObj?.fatorTerreno ?? topografiaObj?.dadosConsumo?.fatorTerreno;
  const rotuloTerreno =
    fatorTerreno === 'montanhoso'
      ? 'Terreno Montanhoso'
      : fatorTerreno === 'plano'
        ? 'Terreno Plano'
        : fatorTerreno === 'ondulado'
          ? 'Terreno Ondulado'
          : 'Terreno não informado';

  const propulsao = formParams?.propulsao;
  const isEletrico = propulsao === 'eletrico';
  const consumoNominalValor = isEletrico ? formParams?.eficiencia_km_kwh : formParams?.consumo_km_l;
  const unidadeConsumo = isEletrico ? 'km/kWh' : 'km/l';
  const consumoNominalFormatado =
    consumoNominalValor === undefined
      ? 'Indisponível'
      : `${consumoNominalValor.toFixed(1)} ${unidadeConsumo}`;

  const rendimentoRealValor =
    topografiaObj?.rendimentoRealKmL !== undefined
      ? topografiaObj.rendimentoRealKmL
      : penalizacaoPct !== undefined && penalizacaoPct > -100 && consumoNominalValor !== undefined
        ? consumoNominalValor / (1 + penalizacaoPct / 100)
        : undefined;
  const rendimentoRealFormatado =
    rendimentoRealValor === undefined
      ? 'Indisponível'
      : `${rendimentoRealValor.toFixed(1)} ${unidadeConsumo}`;

  const penalizacaoTexto =
    penalizacaoPct === undefined
      ? null
      : `${penalizacaoPct > 0 ? '+' : ''}${penalizacaoPct % 1 === 0 ? penalizacaoPct.toFixed(0) : penalizacaoPct.toFixed(1)}`;

  const textoDescritivoRelevo = topografiaObj?.descricaoRelevo;

  const hasElevationPoints = Boolean(elevation && elevation.length >= 2);
  const chartPoints = hasElevationPoints
    ? elevation!
        .map((point) => {
          const x = distanceEnd > 0 ? (point.distanciaKm / distanceEnd) * 480 + 10 : 10;
          const y =
            maxAltitude > minAltitude
              ? 70 - ((point.altitudeM - minAltitude) / (maxAltitude - minAltitude)) * 55
              : 40;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ')
    : '';
  const polygonPoints = hasElevationPoints ? `10,75 ${chartPoints} 490,75` : '';

  useEffect(() => {
    if (!mapContainerRef.current || !geometriaValida(geometria) || !geometria) return;
    const map = L.map(mapContainerRef.current, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    const line = L.polyline(geometria, { color: '#0284c7', weight: 5 }).addTo(map);
    L.circleMarker(geometria[0], {
      radius: 8,
      color: '#15803d',
      fillColor: '#16a34a',
      fillOpacity: 1,
    })
      .bindTooltip('Origem')
      .addTo(map);
    L.circleMarker(geometria[geometria.length - 1], {
      radius: 8,
      color: '#b91c1c',
      fillColor: '#dc2626',
      fillOpacity: 1,
    })
      .bindTooltip('Destino')
      .addTo(map);
    for (const [index, parada] of (paradasAtivas ?? []).entries()) {
      if (!coordenadaValida(parada.coordenadas)) continue;
      const tooltip = document.createElement('span');
      tooltip.textContent = `${index + 1}. ${parada.nome} — ${parada.origem === 'verificado' ? 'estabelecimento verificado' : 'ponto projetado, não confirmado'}`;
      L.marker(parada.coordenadas, {
        icon: L.divIcon({
          className: 'route-stop-marker',
          html: `<span>${index + 1}</span>`,
          iconSize: [32, 38],
          iconAnchor: [16, 38],
        }),
      })
        .bindTooltip(tooltip)
        .addTo(map);
    }
    map.fitBounds(line.getBounds(), { padding: [30, 30] });
    return () => {
      map.remove();
    };
  }, [geometria, paradasAtivas]);

  return (
    <section className="mapa-card" aria-labelledby={titleId}>
      <header className="mapa-heading">
        <span className="mapa-heading-icon" aria-hidden="true">
          🗺️
        </span>
        <div>
          <h2 id={titleId}>Mapa da Rota & Paradas</h2>
          <p>Traçado rodoviário e paradas calculadas por autonomia.</p>
        </div>
      </header>

      <div className="map-vehicle-label">
        Veículo:{' '}
        <strong>
          {propulsao === 'eletrico'
            ? '100% Elétrico'
            : propulsao === 'combustao'
              ? 'Combustão'
              : 'Não informado'}
        </strong>
      </div>

      <div className="metrics-grid" aria-label="Indicadores da rota ativa">
        {[
          ['Distância', distanciaAtiva],
          ['Duração', tempoAtivo],
          ['Paradas', paradasAtivas ? String(paradasAtivas.length) : 'Indisponível'],
          ['Autonomia', autonomiaAtiva === undefined ? 'Indisponível' : `${autonomiaAtiva} km`],
          [
            'Sugestão de rota',
            rotaAtiva?.titulo ??
              (alternativa ? `Alternativa ${(alternativaAtiva ?? 0) + 1}` : 'Rota principal'),
          ],
          [
            'Topografia',
            topografiaObj?.fatorTerreno ??
              (elevation?.length ? 'Perfil disponível' : 'Indisponível'),
          ],
        ].map(([label, value]) => (
          <div className="metric-card" key={label}>
            <span className="metric-card-label">{label}</span>
            <strong className="metric-card-value">{value}</strong>
          </div>
        ))}
      </div>

      {geometriaValida(geometria) && geometria ? (
        <>
          {(rotas.length > 1 || alternativas.length > 0) && (
            <section
              className="route-suggestions-panel"
              aria-label="Sugestões de trajeto rodoviário"
            >
              <div className="suggestions-panel-header">
                <div className="suggestions-panel-title-row">
                  <h3>
                    Sugestões de trajeto rodoviário ({rotas.length || alternativas.length + 1}{' '}
                    opções disponíveis)
                  </h3>
                </div>
                <p className="suggestions-panel-subtitle">
                  Selecione a rota para atualizar mapa, relevo, paradas e custos.
                </p>
              </div>
              <div className="route-suggestions-list">
                {rotas.map((rota) => (
                  <button
                    key={rota.id}
                    type="button"
                    className={`route-suggestion-row${rotaAtiva?.id === rota.id ? ' is-active' : ''}`}
                    aria-label={rota.titulo}
                    aria-pressed={rotaAtiva?.id === rota.id}
                    onClick={() => onRotaChange?.(rota)}
                  >
                    <span className="suggestion-row-content">
                      <strong className="suggestion-row-name">{rota.titulo}</strong>
                      <span className="suggestion-row-meta">
                        {rota.distanciaKm} km · {rota.tempoFormatado}
                      </span>
                    </span>
                    {rotaAtiva?.id === rota.id && (
                      <span className="in-display-badge">Em exibição</span>
                    )}
                  </button>
                ))}
                {rotas.length === 0 && (
                  <>
                    <button
                      type="button"
                      className={`route-suggestion-row${alternativaAtiva === null ? ' is-active' : ''}`}
                      aria-label="Rota principal"
                      aria-pressed={alternativaAtiva === null}
                      onClick={() => onAlternativaChange?.(null)}
                    >
                      <span className="suggestion-row-content">
                        <strong className="suggestion-row-name">Rota principal</strong>
                        <span className="suggestion-row-meta">
                          {viagem.percurso.distancia} · {viagem.percurso.tempo}
                        </span>
                      </span>
                      {alternativaAtiva === null && (
                        <span className="in-display-badge">Em exibição</span>
                      )}
                    </button>
                    {alternativas.map((rota, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`route-suggestion-row${alternativaAtiva === index ? ' is-active' : ''}`}
                        aria-label={`Alternativa ${index + 1} (${rota.distancia})`}
                        aria-pressed={alternativaAtiva === index}
                        onClick={() => onAlternativaChange?.(index)}
                      >
                        <span className="suggestion-row-content">
                          <strong className="suggestion-row-name">Alternativa {index + 1}</strong>
                          <span className="suggestion-row-meta">
                            {rota.distancia} · {rota.tempo}
                          </span>
                        </span>
                        {alternativaAtiva === index && (
                          <span className="in-display-badge">Em exibição</span>
                        )}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </section>
          )}
          <div className="map-container-wrapper">
            <div
              ref={mapContainerRef}
              className="leaflet-map-root"
              role="img"
              aria-label={`Traçado de ${viagem.origem} até ${viagem.destino}`}
            />
            <div className="map-floating-legend" aria-label="Legenda do mapa">
              <span className="legend-item">
                <i className="legend-dot origin-color" />
                Origem
              </span>
              <span className="legend-item">
                <i className="legend-dot dest-color" />
                Destino
              </span>
              {paradasAtivas?.length ? (
                <span className="legend-item">
                  <i className="legend-dot stop-color" />
                  Paradas
                </span>
              ) : null}
            </div>
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
          {rotaAtiva && rotaAtiva.paradas.length > 0 && (
            <div className="metrics-grid" aria-label="Métricas da rota ativa">
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
        </>
      ) : (
        <div className="map-unavailable" role="status">
          <p>Traçado rodoviário indisponível para esta viagem.</p>
          <p>Distância informada: {viagem.percurso.distancia}.</p>
          <p>Duração informada: {viagem.percurso.tempo}.</p>
        </div>
      )}

      <div className="topografia-card" aria-label="Topografia e relevo">
        <div className="topografia-header">
          <div className="topografia-title-group">
            <span className="topografia-icon" aria-hidden="true">
              📈
            </span>
            <h4>Topografia & Relevo da Rota</h4>
            <span className="topografia-badge">
              {rotuloTerreno}
              {penalizacaoTexto === null ? '' : ` (${penalizacaoTexto}%)`}
            </span>
          </div>
          <button
            type="button"
            className="btn-toggle-perfil"
            aria-expanded={expandirPerfil}
            onClick={() => setExpandirPerfil((atual) => !atual)}
          >
            {expandirPerfil ? 'Ocultar perfil ▴' : 'Ver perfil ▾'}
          </button>
        </div>

        <div className="topografia-body">
          <div className="topografia-metrics-row">
            <span className="consumption-nominal">
              Consumo nominal: <strong>{consumoNominalFormatado}</strong>
            </span>
            <span className="consumption-real-badge">
              Rendimento Real: <strong>{rendimentoRealFormatado}</strong>
            </span>
          </div>

          {(subidasM !== undefined ||
            descidasM !== undefined ||
            desnivelLiquidoM !== undefined) && (
            <div className="topografia-slopes-row">
              {subidasM !== undefined && (
                <span>
                  Subidas acumuladas: <strong>+{subidasM}m</strong>
                </span>
              )}
              {descidasM !== undefined && (
                <span>
                  Descidas acumuladas: <strong>-{descidasM}m</strong>
                </span>
              )}
              {desnivelLiquidoM !== undefined && (
                <span>
                  Desnível líquido:{' '}
                  <strong>
                    {desnivelLiquidoM > 0 ? '+' : ''}
                    {desnivelLiquidoM}m
                  </strong>
                </span>
              )}
            </div>
          )}

          {textoDescritivoRelevo && <p className="topografia-text-desc">{textoDescritivoRelevo}</p>}

          {expandirPerfil && (
            <div className="elevation-chart-container">
              <div className="elevation-chart-header">
                {cotaMinExibida !== undefined && (
                  <span className="cota-min-badge">Cota Mín: {cotaMinExibida}m</span>
                )}
                <span className="elevation-title">
                  <span aria-hidden="true">📈</span> Perfil Topográfico de Elevação
                </span>
                {cotaMaxExibida !== undefined && (
                  <span className="cota-max-badge">Cota Máx: {cotaMaxExibida}m</span>
                )}
              </div>

              {hasElevationPoints ? (
                <div className="elevation-svg-wrapper">
                  <svg
                    viewBox="0 0 500 80"
                    className="elevation-svg"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`Perfil de elevação de ${minAltitude} a ${maxAltitude} metros`}
                  >
                    <defs>
                      <linearGradient id="elevationGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05" />
                      </linearGradient>
                    </defs>
                    <polygon points={polygonPoints} fill="url(#elevationGrad)" />
                    <polyline points={chartPoints} fill="none" stroke="#0284c7" strokeWidth="2.5" />
                  </svg>
                </div>
              ) : (
                <p role="status">Perfil de elevação indisponível para esta viagem.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {(rotaAtiva || custos) && (
        <>
          <div className="total-cost-card" aria-label="Custos da rota selecionada">
            <div className="total-cost-main">
              <span className="total-cost-label">
                {rotaAtiva || custos?.totalCompleto
                  ? 'Custo total previsto'
                  : 'Custo parcial: pedágios indisponíveis'}
                {propulsao ? ` (${propulsao})` : ''}
              </span>
              <strong className="total-cost-value">
                {dinheiro(rotaAtiva ? String(rotaAtiva.custos.total) : custos!.custoTotal)}
              </strong>
            </div>
            <div className="total-cost-pills">
              <span className="cost-pill">
                {isEletrico ? 'Energia' : 'Combustível'}:{' '}
                <strong>
                  {dinheiro(
                    rotaAtiva
                      ? String(rotaAtiva.custos.combustivelOuEnergia)
                      : custos!.custoPropulsao,
                  )}
                </strong>
              </span>
              {rotaAtiva && (
                <span className="cost-pill">
                  Pedágios: <strong>{dinheiro(String(rotaAtiva.pedagios))}</strong>
                </span>
              )}
              {autonomiaAtiva !== undefined && (
                <span className="cost-pill">
                  Autonomia: <strong>{autonomiaAtiva} km</strong>
                </span>
              )}
            </div>
          </div>
          {custos && !custos.totalCompleto && (
            <p role="status">
              Os pedágios não estão completos; o valor não é o custo final da viagem.
            </p>
          )}
          <section
            className="passenger-sharing-card"
            aria-label="Divisão de custos entre passageiros"
          >
            <div className="passenger-sharing-header">
              <div className="passenger-sharing-title">
                <h4>Divisão de Custos entre Passageiros</h4>
              </div>
              {rotaAtiva && (
                <span className="passenger-sharing-badge">
                  {rotaAtiva.custos.passageiros} pessoa(s) ·{' '}
                  {dinheiro(String(rotaAtiva.custos.valorPorPassageiro))}/pessoa
                </span>
              )}
            </div>
            {custos?.cotas.map((cota) => (
              <p key={cota.passageiro}>
                Passageiro {cota.passageiro}: {dinheiro(cota.valor)}
              </p>
            ))}
          </section>
        </>
      )}
    </section>
  );
}
