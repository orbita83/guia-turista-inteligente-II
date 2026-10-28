import { useEffect, useId, useMemo, useRef, useState } from 'react';
import L from 'leaflet';

import {
  baixarArquivoGpx,
  gerarLinkGoogleMaps,
  gerarLinkWhatsApp,
  gerarRotasAlternativas,
} from '../services/routeCalculator';
import type { RotaAlternativa, RoteiroFormData, Viagem } from '../types/domain';

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
  const [passageiros, setPassageiros] = useState<number>(() =>
    Math.min(8, Math.max(1, passageirosIniciais)),
  );
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const titleId = useId();

  // Gera as rotas alternativas e recalcula custos atomicamente
  const rotas = useMemo(() => {
    return gerarRotasAlternativas(viagem, formParams || undefined, passageiros);
  }, [viagem, formParams, passageiros]);

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

    // Destrói instância prévia do mapa antes de recriar
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

      // Marcador de Origem
      const coordOrigem = rotaAtiva.coordenadas[0];
      if (coordOrigem) {
        const pinOrigem = L.divIcon({
          className: 'custom-map-pin',
          html: '<span aria-hidden="true">🚩</span>',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        });
        L.marker([coordOrigem[0], coordOrigem[1]], { icon: pinOrigem })
          .addTo(map)
          .bindPopup(`<strong>Origem:</strong> ${viagem.origem}`);
      }

      // Marcador de Destino
      const coordDestino = rotaAtiva.coordenadas[rotaAtiva.coordenadas.length - 1];
      if (coordDestino) {
        const pinDestino = L.divIcon({
          className: 'custom-map-pin',
          html: '<span aria-hidden="true">🏁</span>',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
        });
        L.marker([coordDestino[0], coordDestino[1]], { icon: pinDestino })
          .addTo(map)
          .bindPopup(`<strong>Destino:</strong> ${viagem.destino}`);
      }

      // Marcadores das Paradas Estratégicas por Autonomia
      rotaAtiva.paradas.forEach((parada) => {
        const iconeHtml = parada.tipo === 'recarga' ? '⚡' : '⛽';
        const pinParada = L.divIcon({
          className: 'custom-map-pin',
          html: `<span aria-hidden="true">${iconeHtml}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        });
        L.marker([parada.coordenadas[0], parada.coordenadas[1]], { icon: pinParada })
          .addTo(map)
          .bindPopup(
            `<strong>${parada.nome}</strong><br/>${parada.descricao || ''}<br/><em>Bateria/Tanque na chegada: ~${parada.nivelBateriaOuTanquePct}%</em>`,
          );
      });

      // Ajusta o zoom para enquadrar a rota inteira
      if (latLngs.length > 0) {
        map.fitBounds(polyline.getBounds(), { padding: [25, 25] });
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

  return (
    <section className="mapa-card" aria-labelledby={titleId}>
      {/* 1. Cabeçalho */}
      <header className="mapa-heading">
        <span className="mapa-heading-icon" aria-hidden="true">
          🗺️
        </span>
        <div>
          <h2 id={titleId}>Rota e Autonomia</h2>
          <p>
            {viagem.origem} ➔ {viagem.destino}
          </p>
        </div>
      </header>

      {/* 2. Seleção de Rotas Alternativas (Abas Interativas) */}
      <div className="route-tabs" role="tablist" aria-label="Opções de rota">
        {rotas.map((rota) => {
          const selecionada = rota.id === rotaAtivaId;
          return (
            <button
              key={rota.id}
              type="button"
              role="tab"
              id={`tab-${rota.id}`}
              aria-selected={selecionada}
              aria-controls={`painel-rota-${rota.id}`}
              className={`route-tab${selecionada ? ' is-active' : ''}`}
              onClick={() => setRotaAtivaId(rota.id)}
            >
              <div className="route-tab-header">
                <strong>{rota.titulo}</strong>
                <span className="route-tab-badge">{rota.tipoRotulo}</span>
              </div>
              <span className="route-tab-meta">
                {rota.distanciaKm} km • {rota.tempoFormatado} • Pedágio: R${' '}
                {rota.pedagios.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Badges Métricos */}
      <div className="metrics-grid" aria-label="Métricas da rota ativa">
        <div className="metric-card">
          <span className="metric-card-label">Distância</span>
          <span className="metric-card-value">{rotaAtiva.distanciaKm} km</span>
          <span className="metric-card-sub">Percurso total</span>
        </div>
        <div className="metric-card">
          <span className="metric-card-label">Tempo</span>
          <span className="metric-card-value">{rotaAtiva.tempoFormatado}</span>
          <span className="metric-card-sub">Estimado rodoviário</span>
        </div>
        <div className="metric-card">
          <span className="metric-card-label">Pedágios</span>
          <span className="metric-card-value">R$ {rotaAtiva.pedagios.toFixed(2)}</span>
          <span className="metric-card-sub">Tarifa regional</span>
        </div>
        <div className="metric-card">
          <span className="metric-card-label">Autonomia</span>
          <span className="metric-card-value">~{rotaAtiva.autonomiaKm} km</span>
          <span className="metric-card-sub">Reserva mín. 18%</span>
        </div>
        <div className="metric-card">
          <span className="metric-card-label">Desnível</span>
          <span className="metric-card-value">
            +{rotaAtiva.topografia.desnivelSubidaM}m / -{rotaAtiva.topografia.desnivelDescidaM}m
          </span>
          <span className="metric-card-sub">Relevo acumulado</span>
        </div>
      </div>

      {/* 4. Traçado Geográfico no Leaflet */}
      <div className="map-container-wrapper">
        <div
          ref={mapContainerRef}
          className="leaflet-map-root"
          role="application"
          aria-label={`Mapa da rota ${rotaAtiva.titulo} entre ${viagem.origem} e ${viagem.destino}`}
        />
      </div>

      {/* 5. Alternativa Textual Acessível */}
      <div
        className="text-route-summary"
        role="region"
        aria-label="Descrição textual acessível da rota e paradas"
      >
        <p>
          <strong>{rotaAtiva.titulo}:</strong> Trajeto de {rotaAtiva.distanciaKm} km partindo de{' '}
          {viagem.origem} até {viagem.destino}, com tempo de viagem estimado em{' '}
          {rotaAtiva.tempoFormatado}.
        </p>
        {rotaAtiva.paradas.length > 0 ? (
          <div>
            <p>
              <strong>
                Paradas estratégicas recomendadas ({rotaAtiva.paradas.length} antes do limite de 18%
                da reserva):
              </strong>
            </p>
            <ul className="stops-list">
              {rotaAtiva.paradas.map((parada) => (
                <li key={parada.id}>
                  {parada.nome} — {parada.descricao}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p>
            Autonomia de ~{rotaAtiva.autonomiaKm} km é suficiente para completar o trajeto sem
            necessidade de paradas intermediárias.
          </p>
        )}
      </div>

      {/* 6. Sanfona de Topografia & Relevo */}
      <details className="relief-details">
        <summary className="relief-summary">⛰️ Topografia e Relevo da Rodovia (Expandir)</summary>
        <div className="relief-grid">
          <div className="relief-item">
            <span className="relief-item-label">Altitude Máxima</span>
            <span className="relief-item-value">{rotaAtiva.topografia.altitudeMaximaM} m</span>
          </div>
          <div className="relief-item">
            <span className="relief-item-label">Desnível Subida</span>
            <span className="relief-item-value">+{rotaAtiva.topografia.desnivelSubidaM} m</span>
          </div>
          <div className="relief-item">
            <span className="relief-item-label">Desnível Descida</span>
            <span className="relief-item-value">-{rotaAtiva.topografia.desnivelDescidaM} m</span>
          </div>
        </div>
        <p className="relief-warning">
          ⚡ <strong>Impacto no Consumo:</strong> +{rotaAtiva.topografia.penalizacaoConsumoPct}% de
          penalização no consumo nominal provocado por relevo de serra e oscilações altimétricas.
        </p>
      </details>

      {/* 7. Calculadora e Rateio entre Passageiros (1 a 8) */}
      <div className="cost-sharing-card">
        <div className="cost-header">
          <h4>💰 Previsão de Custos e Rateio</h4>
          <span className="cost-total-badge">Total: R$ {rotaAtiva.custos.total.toFixed(2)}</span>
        </div>
        <div className="cost-breakdown">
          <span>
            Combustível / Energia:{' '}
            <strong>R$ {rotaAtiva.custos.combustivelOuEnergia.toFixed(2)}</strong>
          </span>
          <span>
            Pedágios: <strong>R$ {rotaAtiva.custos.pedagios.toFixed(2)}</strong>
          </span>
        </div>

        <div className="passenger-selector-wrapper">
          <label className="passenger-selector-label" id="passageiros-label">
            Dividir custo entre passageiros (1 a 8):
          </label>
          <div className="passenger-buttons" role="radiogroup" aria-labelledby="passageiros-label">
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
              Cota individual ({passageiros} {passageiros === 1 ? 'pessoa' : 'pessoas'}):
            </span>
            <strong>R$ {rotaAtiva.custos.valorPorPassageiro.toFixed(2)} / pessoa</strong>
          </div>
        </div>
      </div>

      {/* 8. Ações Rápidas de Navegação */}
      <div className="map-actions" aria-label="Ações de navegação e compartilhamento">
        <a
          href={gerarLinkGoogleMaps(viagem.origem, viagem.destino)}
          target="_blank"
          rel="noopener noreferrer"
          className="map-action-btn btn-gmaps"
        >
          <span aria-hidden="true">🗺️</span> Abrir no Google Maps
        </a>
        <a
          href={gerarLinkWhatsApp(viagem.origem, viagem.destino, rotaAtiva)}
          target="_blank"
          rel="noopener noreferrer"
          className="map-action-btn btn-whatsapp"
        >
          <span aria-hidden="true">💬</span> Compartilhar no WhatsApp
        </a>
        <button
          type="button"
          className="map-action-btn btn-gpx"
          onClick={() => baixarArquivoGpx(viagem.origem, viagem.destino, rotaAtiva)}
        >
          <span aria-hidden="true">📥</span> Baixar GPX 1.1
        </button>
      </div>
    </section>
  );
}
