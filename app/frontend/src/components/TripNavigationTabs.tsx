import { useState, type KeyboardEvent } from 'react';
import {
  baixarArquivoGpx,
  gerarLinkGoogleMaps,
  gerarLinkWhatsApp,
  geometriaValida,
} from '../services/routeCalculator';
import type { AbaViagem, RotaAlternativa, Viagem } from '../types/domain';

export interface TripNavigationTabsProps {
  viagem: Viagem;
  abaAtiva: AbaViagem;
  onAbaChange: (aba: AbaViagem) => void;
  onExcluir?: () => void;
  onGpxDownload?: () => void;
  rotaAtiva?: RotaAlternativa;
}

export function TripNavigationTabs({
  viagem,
  abaAtiva,
  onAbaChange,
  onExcluir,
  onGpxDownload,
  rotaAtiva,
}: TripNavigationTabsProps) {
  const [gpxFeedback, setGpxFeedback] = useState('');
  const geometria = rotaAtiva?.coordenadas ?? viagem.percurso.geometria;
  const podeExportar = geometriaValida(geometria);
  const linkMaps = gerarLinkGoogleMaps(viagem.origem, viagem.destino);
  const linkWhatsapp = gerarLinkWhatsApp(
    viagem.origem,
    viagem.destino,
    rotaAtiva ?? viagem.percurso.distancia,
    rotaAtiva ? undefined : viagem.percurso.tempo,
  );

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleTabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs: AbaViagem[] = ['visao-geral', 'mapa', 'guia'];
    const current = tabs.indexOf(abaAtiva);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onAbaChange(tabs[next]);
    event.currentTarget.querySelector<HTMLElement>(`#tab-${tabs[next]}`)?.focus();
  };

  const handleGpx = () => {
    if (!geometriaValida(geometria) || !geometria) return;
    try {
      if (onGpxDownload) onGpxDownload();
      else
        baixarArquivoGpx(
          viagem.origem,
          viagem.destino,
          rotaAtiva ?? {
            titulo: 'Traçado principal',
            coordenadas: geometria,
            paradas: [],
          },
        );
      setGpxFeedback('Arquivo GPX preparado para download.');
    } catch {
      setGpxFeedback('Não foi possível exportar o GPX. Tente novamente.');
    }
  };

  return (
    <nav className="trip-navigation-container" aria-label="Navegação e ações da viagem planejada">
      {/* 1. Linha de Abas de Navegação (Issue #11) */}
      <div
        className="trip-tabs-bar"
        role="tablist"
        aria-label="Seções do resultado da viagem"
        onKeyDown={handleTabKeys}
      >
        <button
          type="button"
          role="tab"
          id="tab-visao-geral"
          aria-selected={abaAtiva === 'visao-geral'}
          aria-controls="panel-mapa panel-guia"
          tabIndex={abaAtiva === 'visao-geral' ? 0 : -1}
          className={`trip-tab-btn${abaAtiva === 'visao-geral' ? ' is-active' : ''}`}
          onClick={() => onAbaChange('visao-geral')}
        >
          <span aria-hidden="true" className="trip-tab-icon">
            📋
          </span>
          <span>Visão Geral</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-mapa"
          aria-selected={abaAtiva === 'mapa'}
          aria-controls="panel-mapa"
          tabIndex={abaAtiva === 'mapa' ? 0 : -1}
          className={`trip-tab-btn${abaAtiva === 'mapa' ? ' is-active' : ''}`}
          onClick={() => onAbaChange('mapa')}
        >
          <span aria-hidden="true" className="trip-tab-icon">
            🗺️
          </span>
          <span>Mapa & Paradas</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-guia"
          aria-selected={abaAtiva === 'guia'}
          aria-controls="panel-guia"
          tabIndex={abaAtiva === 'guia' ? 0 : -1}
          className={`trip-tab-btn${abaAtiva === 'guia' ? ' is-active' : ''}`}
          onClick={() => onAbaChange('guia')}
        >
          <span aria-hidden="true" className="trip-tab-icon">
            🧭
          </span>
          <span>Guia & Clima</span>
        </button>
      </div>

      {/* 2. Linha de Ações da Viagem (Issue #11) */}
      <div className="trip-actions-bar" aria-label="Ações rápidas da viagem">
        <a
          href={linkMaps}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-trip-action btn-action-maps"
          title="Abrir rota completa no Google Maps (nova aba)"
        >
          <span aria-hidden="true">🗺️</span>
          <span>Abrir no Maps</span>
        </a>

        <a
          href={linkWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-trip-action btn-action-wpp"
          title="Compartilhar resumo da viagem pelo WhatsApp"
        >
          <span aria-hidden="true">💬</span>
          <span>WhatsApp</span>
        </a>

        <button
          type="button"
          className="btn-trip-action btn-action-print"
          onClick={handlePrint}
          title="Imprimir ou salvar este roteiro em PDF"
        >
          <span aria-hidden="true">🖨️</span>
          <span>Imprimir</span>
        </button>

        <button
          type="button"
          className="btn-trip-action btn-action-delete"
          onClick={onExcluir}
          title="Excluir este roteiro de viagem"
        >
          <span aria-hidden="true">🗑️</span>
          <span>Excluir</span>
        </button>

        <button
          type="button"
          className="btn-trip-action btn-action-gpx"
          onClick={handleGpx}
          disabled={!podeExportar}
          title="Baixar arquivo GPX 1.1 da rota para GPS ou Garmin"
        >
          <span aria-hidden="true">📥</span>
          <span>Baixar GPX</span>
        </button>
      </div>
      {gpxFeedback && <p role={gpxFeedback.startsWith('Não') ? 'alert' : 'status'}>{gpxFeedback}</p>}
    </nav>
  );
}
