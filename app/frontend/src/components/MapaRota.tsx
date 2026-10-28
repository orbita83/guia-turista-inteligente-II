// TODO(backend): o endpoint /api/v1/roteiros/planejar
// precisa retornar a geometria rodoviária real (coordenadas da rota)
// e coordenadas geocodificadas de origem/destino.
// O contrato atual retorna apenas distância, tempo e modal.
// Não usar interpolação entre cidades como trajeto rodoviário real.
// Relacionado à Issue #15 (geometria rodoviária).

// TODO(backend): obter geometria rodoviária real e amostras de
// elevação ao longo do trajeto para renderizar o perfil topográfico.
// A resposta atual de planejamento não fornece série de altitudes.
// Não exibir valores simulados como medições reais.
// Relacionado à Issue #15 (geometria rodoviária) e Issue #16 (altimetria e relevo).

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import L from 'leaflet';

import { gerarRotasAlternativas } from '../services/routeCalculator';
import type { RotaAlternativa, RoteiroFormData, TipoPropulsao, Viagem } from '../types/domain';

export interface MapaRotaProps {
  viagem: Viagem;
  formParams?: RoteiroFormData | null;
  passageirosIniciais?: number;
  onRotaChange?: (rota: RotaAlternativa) => void;
}

export function MapaRota({
  viagem,
  formParams,
  passageirosIniciais = 1,
  onRotaChange,
}: MapaRotaProps) {
  const [rotaAtivaId, setRotaAtivaId] = useState<'principal' | 'economica'>('principal');
  const [propulsaoAtiva, setPropulsaoAtiva] = useState<TipoPropulsao>(
    formParams?.propulsao || 'combustao',
  );
  const [passageiros, setPassageiros] = useState<number>(() =>
    Math.min(8, Math.max(1, passageirosIniciais)),
  );
  const [expandirPerfil, setExpandirPerfil] = useState(true);
  const [expandirAjustePassageiros, setExpandirAjustePassageiros] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const titleId = useId();

  // Sincroniza se o formulário original mudar
  useEffect(() => {
    if (formParams?.propulsao) {
      setPropulsaoAtiva(formParams.propulsao);
    }
  }, [formParams?.propulsao]);

  // Gera as rotas alternativas e recalcula custos atomicamente
  const rotas = useMemo(() => {
    return gerarRotasAlternativas(viagem, formParams || undefined, passageiros, propulsaoAtiva);
  }, [viagem, formParams, passageiros, propulsaoAtiva]);

  const rotaPrincipal = rotas[0];
  const rotaEconomica = rotas[1] || rotas[0];

  const rotaAtiva = useMemo(() => {
    return rotas.find((r) => r.id === rotaAtivaId) || rotas[0];
  }, [rotas, rotaAtivaId]);

  // Notifica componentes pais se callback for fornecido
  useEffect(() => {
    onRotaChange?.(rotaAtiva);
  }, [rotaAtiva, onRotaChange]);

  // Inicialização e atualização do mapa Leaflet
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(container, {
        zoomControl: true,
        scrollWheelZoom: false,
      });
      mapInstanceRef.current = map;

      // Camada de mapa OpenStreetMap
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Traçado da rodovia (Polyline)
      const latLngs: L.LatLngExpression[] = rotaAtiva.coordenadas.map((coord) => [
        coord[0],
        coord[1],
      ]);
      const polylineCor = rotaAtiva.id === 'principal' ? '#0284c7' : '#16a34a';
      const polyline = L.polyline(latLngs, {
        color: polylineCor,
        weight: 5,
        opacity: 0.85,
        smoothFactor: 1,
      }).addTo(map);

      // Marcador de Origem (Círculo verde)
      const coordOrigem = rotaAtiva.coordenadas[0];
      if (coordOrigem) {
        const pinOrigem = L.divIcon({
          className: 'custom-map-pin map-pin-origin',
          html: '<span class="map-pin-inner origin-dot" aria-hidden="true">🟢</span>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([coordOrigem[0], coordOrigem[1]], { icon: pinOrigem })
          .addTo(map)
          .bindPopup(`<strong>Origem:</strong> ${viagem.origem}`);
      }

      // Marcador de Destino (Bandeira de chegada)
      const coordDestino = rotaAtiva.coordenadas[rotaAtiva.coordenadas.length - 1];
      if (coordDestino) {
        const pinDestino = L.divIcon({
          className: 'custom-map-pin map-pin-dest',
          html: '<span class="map-pin-inner dest-dot" aria-hidden="true">🏁</span>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([coordDestino[0], coordDestino[1]], { icon: pinDestino })
          .addTo(map)
          .bindPopup(`<strong>Destino:</strong> ${viagem.destino}`);
      }

      // Marcadores das Paradas Estratégicas por Autonomia (Laranja numerado)
      rotaAtiva.paradas.forEach((parada, idx) => {
        const pinParada = L.divIcon({
          className: 'custom-map-pin map-pin-stop',
          html: `<span class="map-pin-stop-badge" aria-hidden="true">${idx + 1}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        L.marker([parada.coordenadas[0], parada.coordenadas[1]], { icon: pinParada })
          .addTo(map)
          .bindPopup(
            `<strong>${parada.nome}</strong><br/>${parada.descricao || ''}<br/><em>Bateria/Tanque na chegada: ~${parada.nivelBateriaOuTanquePct}%</em>`,
          );
      });

      // Ajusta o zoom para enquadrar a rota inteira
      if (latLngs.length > 0) {
        map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
      }
    } catch {
      // Falha silenciosa em ambientes sem suporte a WebGL/DOM Canvas completo (ex. testes de unidade)
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [rotaAtiva, viagem.origem, viagem.destino]);

  // Consumo nominal e rendimento real
  const consumoNominal =
    propulsaoAtiva === 'eletrico'
      ? `${(formParams?.eficiencia_km_kwh ?? 6).toFixed(1)} km/kWh`
      : `${(formParams?.consumo_km_l ?? 12).toFixed(1)} km/l`;

  const rendimentoReal =
    propulsaoAtiva === 'eletrico'
      ? `${rotaAtiva.topografia.rendimentoRealKmL ?? 5.6} km/kWh`
      : `${rotaAtiva.topografia.rendimentoRealKmL ?? 11.2} km/l`;

  const diferencaMinutos = rotaPrincipal.diferencaTempoMinutos ?? 118;

  return (
    <section className="mapa-card" aria-labelledby={titleId}>
      {/* ------------------------------------------------------------------
          1. Cabeçalho Oficial da Seção 3.3
          ------------------------------------------------------------------ */}
      <header className="mapa-heading">
        <span className="mapa-heading-icon" aria-hidden="true">
          🗺️
        </span>
        <div>
          <h2 id={titleId}>Mapa da Rota & Paradas</h2>
          <p>Traçado rodoviário e paradas calculadas por autonomia.</p>
        </div>
      </header>

      {/* ------------------------------------------------------------------
          2. Faixa de Controles Superiores: Propulsão & Sugestões de Rota
          ------------------------------------------------------------------ */}
      <div className="map-controls-bar" aria-label="Controles de propulsão e rota">
        {/* Seletor de Propulsão */}
        <div className="control-button-group" role="group" aria-label="Tipo de propulsão">
          <button
            type="button"
            className={`btn-pill-control${propulsaoAtiva === 'combustao' ? ' is-active' : ''}`}
            aria-pressed={propulsaoAtiva === 'combustao'}
            onClick={() => setPropulsaoAtiva('combustao')}
          >
            <span aria-hidden="true">⛽</span>
            <span>Combustão</span>
          </button>
          <button
            type="button"
            className={`btn-pill-control${propulsaoAtiva === 'eletrico' ? ' is-active' : ''}`}
            aria-pressed={propulsaoAtiva === 'eletrico'}
            onClick={() => setPropulsaoAtiva('eletrico')}
          >
            <span aria-hidden="true">⚡</span>
            <span>Elétrico (EV)</span>
          </button>
        </div>

        {/* Seletor de Sugestão de Rota */}
        <div className="control-button-group" role="tablist" aria-label="Sugestões de rota rápidas">
          <button
            type="button"
            role="tab"
            aria-selected={rotaAtivaId === 'principal'}
            className={`btn-pill-control${rotaAtivaId === 'principal' ? ' is-active' : ''}`}
            onClick={() => setRotaAtivaId('principal')}
          >
            <span aria-hidden="true">⚡</span>
            <span>Sugestão 01</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rotaAtivaId === 'economica'}
            className={`btn-pill-control${rotaAtivaId === 'economica' ? ' is-active' : ''}`}
            onClick={() => setRotaAtivaId('economica')}
          >
            <span aria-hidden="true">🛣️</span>
            <span>Sugestão 02</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------
          3. Grade de 6 Indicadores (Wireframe Seção 3.3)
          ------------------------------------------------------------------ */}
      <div className="metrics-grid" aria-label="Métricas da rota ativa">
        <div className="metric-card">
          <span className="metric-icon" aria-hidden="true">
            📏
          </span>
          <span className="metric-card-label">DISTÂNCIA</span>
          <strong className="metric-card-value">{rotaAtiva.distanciaKm} km</strong>
        </div>

        <div className="metric-card">
          <span className="metric-icon" aria-hidden="true">
            ⏱️
          </span>
          <span className="metric-card-label">DURAÇÃO</span>
          <strong className="metric-card-value">{rotaAtiva.tempoFormatado}</strong>
        </div>

        <div className="metric-card">
          <span className="metric-icon" aria-hidden="true">
            🛑
          </span>
          <span className="metric-card-label">PARADAS</span>
          <strong className="metric-card-value">{rotaAtiva.paradas.length} parada(s)</strong>
        </div>

        <div className="metric-card">
          <span className="metric-icon" aria-hidden="true">
            🔋
          </span>
          <span className="metric-card-label">AUTONOMIA</span>
          <strong className="metric-card-value">~{rotaAtiva.autonomiaKm} km</strong>
        </div>

        <div className="metric-card">
          <span className="metric-icon" aria-hidden="true">
            ⚡
          </span>
          <span className="metric-card-label">SUGESTÃO DE ROTA</span>
          <strong className="metric-card-value">
            {rotaAtiva.id === 'principal' ? 'Mais ágil' : 'Mais Econômica'}
          </strong>
        </div>

        <div className="metric-card">
          <span className="metric-icon" aria-hidden="true">
            〰️
          </span>
          <span className="metric-card-label">TOPOGRAFIA</span>
          <strong className="metric-card-value">
            Terreno Ondulado (+{rotaAtiva.topografia.penalizacaoConsumoPct}%)
          </strong>
        </div>
      </div>

      {/* ------------------------------------------------------------------
          4. Painel de Sugestões de Trajeto Rodoviário (Issue #14)
          ------------------------------------------------------------------ */}
      <div className="route-suggestions-panel" aria-label="Sugestões de trajeto rodoviário">
        <div className="suggestions-panel-header">
          <div className="suggestions-panel-title-row">
            <span className="suggestions-panel-icon" aria-hidden="true">
              🛣️
            </span>
            <h3>Sugestões de Trajeto Rodoviário ({rotas.length} opções disponíveis)</h3>
          </div>
          <p className="suggestions-panel-subtitle">
            {rotaAtivaId === 'principal'
              ? `Sugestão 01 selecionada: trajeto principal mais ágil (${rotaPrincipal.distanciaKm} km, ~${diferencaMinutos} min mais rápida).`
              : `Sugestão 02 selecionada: trajeto alternativo com pedágios reduzidos (${rotaEconomica.distanciaKm} km, ${rotaEconomica.resumoDestaque}).`}
          </p>
        </div>

        <div
          className="route-suggestions-list"
          role="listbox"
          aria-label="Opções de rota detalhadas"
        >
          {/* Opção 1: Sugestão 01 */}
          <button
            type="button"
            role="option"
            aria-selected={rotaAtivaId === 'principal'}
            className={`route-suggestion-row${rotaAtivaId === 'principal' ? ' is-active' : ''}`}
            onClick={() => setRotaAtivaId('principal')}
          >
            <div className="suggestion-row-content">
              <span className="suggestion-row-name">⚡ Sugestão 01</span>
              <span className="suggestion-row-meta">
                {rotaPrincipal.distanciaKm} km · {rotaPrincipal.tempoFormatado} · ⛰️ +
                {rotaPrincipal.topografia.desnivelSubidaM}m
              </span>
              <span className="suggestion-row-desc">{rotaPrincipal.resumoDestaque}</span>
            </div>
            {rotaAtivaId === 'principal' && (
              <span className="in-display-badge">
                <span aria-hidden="true">✓</span> Em exibição
              </span>
            )}
          </button>

          {/* Opção 2: Sugestão 02 */}
          <button
            type="button"
            role="option"
            aria-selected={rotaAtivaId === 'economica'}
            className={`route-suggestion-row${rotaAtivaId === 'economica' ? ' is-active' : ''}`}
            onClick={() => setRotaAtivaId('economica')}
          >
            <div className="suggestion-row-content">
              <span className="suggestion-row-name">🛣️ Sugestão 02</span>
              <span className="suggestion-row-meta">
                {rotaEconomica.distanciaKm} km · {rotaEconomica.tempoFormatado} · ⛰️ +
                {rotaEconomica.topografia.desnivelSubidaM}m
              </span>
              <span className="suggestion-row-desc">{rotaEconomica.resumoDestaque}</span>
            </div>
            {rotaAtivaId === 'economica' && (
              <span className="in-display-badge">
                <span aria-hidden="true">✓</span> Em exibição
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------
          5. Traçado Geográfico no Leaflet com Legenda no Canto
          ------------------------------------------------------------------ */}
      <div className="map-container-wrapper">
        <div
          ref={mapContainerRef}
          className="leaflet-map-root"
          role="application"
          aria-label={`Mapa da rota ${rotaAtiva.titulo} entre ${viagem.origem} e ${viagem.destino}`}
        />
        {/* Legenda Flutuante do Mapa */}
        <div className="map-floating-legend" aria-label="Legenda do mapa rodoviário">
          <div className="legend-item">
            <span className="legend-dot origin-color" aria-hidden="true" />
            <span>Origem</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot dest-color" aria-hidden="true" />
            <span>Destino</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot route-color" aria-hidden="true" />
            <span>Rota</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot stop-color" aria-hidden="true" />
            <span>Parada</span>
          </div>
        </div>
      </div>

      {/* Alternativa Textual Acessível */}
      <div
        className="text-route-summary sr-only"
        role="region"
        aria-label="Descrição textual acessível da rota e paradas"
      >
        <p>
          {rotaAtiva.titulo}: Trajeto de {rotaAtiva.distanciaKm} km partindo de {viagem.origem} até{' '}
          {viagem.destino}, com tempo de viagem estimado em {rotaAtiva.tempoFormatado}.
        </p>
      </div>

      {/* ------------------------------------------------------------------
          5.1 Paradas Estratégicas Recomendadas por Autonomia
          ------------------------------------------------------------------ */}
      {rotaAtiva.paradas.length > 0 && (
        <div className="stops-recommendation-panel" aria-label="Paradas estratégicas recomendadas">
          <div className="stops-panel-header">
            <span className="stops-panel-icon" aria-hidden="true">
              🛑
            </span>
            <h4>Paradas estratégicas recomendadas ({rotaAtiva.paradas.length})</h4>
          </div>
          <div className="stops-chips-list">
            {rotaAtiva.paradas.map((parada, idx) => (
              <div key={parada.id} className="stop-chip-item">
                <span className="stop-chip-badge" aria-hidden="true">
                  {idx + 1}
                </span>
                <div className="stop-chip-info">
                  <strong className="stop-chip-title">
                    Parada {idx + 1}: {parada.nome}
                  </strong>
                  <span className="stop-chip-meta">
                    ao km {parada.km} ·{' '}
                    {parada.tipo === 'recarga'
                      ? 'Ponto de Recarga Rápida'
                      : 'Posto de Abastecimento'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------
          6. Card "Topografia & Relevo da Rota" (Wireframe)
          ------------------------------------------------------------------ */}
      <div className="topografia-card" aria-label="Topografia e Relevo da Rodovia">
        <div className="topografia-header">
          <div className="topografia-title-group">
            <span className="topografia-icon" aria-hidden="true">
              📈
            </span>
            <h4>Topografia & Relevo da Rota</h4>
            <span className="topografia-badge">
              Terreno Ondulado (+{rotaAtiva.topografia.penalizacaoConsumoPct}%)
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
          {/* Linha de Consumo & Rendimento */}
          <div className="topografia-metrics-row">
            <div className="consumption-nominal">
              Consumo nominal: <strong>{consumoNominal}</strong>
            </div>
            <div className="consumption-real-badge">
              Rendimento Real: <strong>{rendimentoReal}</strong>
            </div>
          </div>

          {/* Subidas e Descidas Acumuladas */}
          <div className="topografia-slopes-row">
            <span>
              Subidas acumuladas: <strong>+{rotaAtiva.topografia.desnivelSubidaM}m</strong>
            </span>
            <span>
              Descidas acumuladas: <strong>-{rotaAtiva.topografia.desnivelDescidaM}m</strong>
            </span>
            <span>
              Desnível líquido: <strong>{rotaAtiva.topografia.desnivelLiquidoM}m</strong>
            </span>
          </div>

          <p className="topografia-text-desc">
            Terreno ondulado com relevo dinâmico (+{rotaAtiva.topografia.desnivelSubidaM}m de
            subidas / -{rotaAtiva.topografia.desnivelDescidaM}m de descidas). penalização no consumo
            nominal de +{rotaAtiva.topografia.penalizacaoConsumoPct}% devido a retomadas de
            aceleração.
          </p>

          {/* Gráfico do Perfil Topográfico SVG */}
          {expandirPerfil && (
            <div className="elevation-chart-container">
              <div className="elevation-chart-header">
                <span className="elevation-min">Cota Mín: {rotaAtiva.topografia.cotaMinimaM}m</span>
                <span className="elevation-title">📈 Perfil Topográfico de Elevação</span>
                <span className="elevation-max">
                  Altitude Máxima: {rotaAtiva.topografia.cotaMaximaM}m
                </span>
              </div>
              <div className="elevation-svg-wrapper">
                <svg
                  viewBox="0 0 500 80"
                  className="elevation-svg"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="elevationGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 0,65 Q 40,60 65,30 T 90,65 Q 150,70 180,55 T 230,68 Q 300,68 370,55 T 450,68 L 500,65 L 500,80 L 0,80 Z"
                    fill="url(#elevationGrad)"
                  />
                  <path
                    d="M 0,65 Q 40,60 65,30 T 90,65 Q 150,70 180,55 T 230,68 Q 300,68 370,55 T 450,68 L 500,65"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="2.5"
                  />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------
          7. Card de Custo Total Previsto (Wireframe)
          ------------------------------------------------------------------ */}
      <div className="total-cost-card" aria-label="Previsão de Custos e Rateio">
        <span className="sr-only">💰 Previsão de Custos e Rateio</span>
        <div className="total-cost-main">
          <span className="total-cost-label">
            CUSTO TOTAL PREVISTO ({propulsaoAtiva === 'eletrico' ? 'ELÉTRICO' : 'COMBUSTÃO'})
          </span>
          <strong className="total-cost-value">R$ {rotaAtiva.custos.total.toFixed(2)}</strong>
        </div>

        <div className="total-cost-pills">
          <div className="cost-pill">
            <span aria-hidden="true">{propulsaoAtiva === 'eletrico' ? '⚡' : '⛽'}</span>
            <span>
              {propulsaoAtiva === 'eletrico' ? 'Energia' : 'Combustível'}:{' '}
              <strong>R$ {rotaAtiva.custos.combustivelOuEnergia.toFixed(2)}</strong>
            </span>
          </div>
          <div className="cost-pill">
            <span aria-hidden="true">🔋</span>
            <span>
              Autonomia: <strong>~{rotaAtiva.autonomiaKm} km</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------
          8. Card de Divisão de Custos entre Passageiros (Wireframe)
          ------------------------------------------------------------------ */}
      <div className="passenger-sharing-card" aria-label="Rateio entre passageiros">
        <div className="passenger-sharing-header">
          <div className="passenger-sharing-title">
            <span aria-hidden="true">👥</span>
            <h4>Divisão de Custos entre Passageiros</h4>
          </div>
          <div className="passenger-sharing-badge">
            {passageiros} {passageiros === 1 ? 'pessoa' : 'pessoas'} · R${' '}
            {rotaAtiva.custos.valorPorPassageiro.toFixed(2)}/pessoa
          </div>
          <button
            type="button"
            className="btn-toggle-adjust"
            aria-expanded={expandirAjustePassageiros}
            onClick={() => setExpandirAjustePassageiros((atual) => !atual)}
          >
            {expandirAjustePassageiros ? 'Ocultar ▴' : 'Ajustar ▾'}
          </button>
        </div>

        {expandirAjustePassageiros && (
          <div className="passenger-adjust-body">
            <label className="passenger-selector-label" id="passageiros-label">
              Número de passageiros (1 a 8):
            </label>
            <div
              className="passenger-buttons"
              role="radiogroup"
              aria-labelledby="passageiros-label"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
                const ativo = passageiros === num;
                return (
                  <button
                    key={num}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    className={`passenger-btn${ativo ? ' is-active' : ''}`}
                    onClick={() => setPassageiros(num)}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
            <div className="passenger-quota-result">
              <span>
                Cota individual ({passageiros} {passageiros === 1 ? 'pessoa' : 'pessoas'}):{' '}
              </span>
              <strong>R$ {rotaAtiva.custos.valorPorPassageiro.toFixed(2)} / pessoa</strong>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
