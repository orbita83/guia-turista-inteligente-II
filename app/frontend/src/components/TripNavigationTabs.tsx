import { useState } from 'react';
import {
  baixarArquivoGpx,
  gerarLinkGoogleMaps,
  gerarLinkWhatsApp,
  gerarRotasAlternativas,
} from '../services/routeCalculator';
import type { AbaViagem, Viagem } from '../types/domain';

export interface TripNavigationTabsProps {
  viagem: Viagem;
  abaAtiva: AbaViagem;
  onAbaChange: (aba: AbaViagem) => void;
  onExcluir?: () => void;
  onGpxDownload?: () => void;
}

export function TripNavigationTabs({
  viagem,
  abaAtiva,
  onAbaChange,
  onExcluir,
  onGpxDownload,
}: TripNavigationTabsProps) {
  const [erroGpx, setErroGpx] = useState('');
  const linkMaps = gerarLinkGoogleMaps(viagem.origem, viagem.destino);
  const linkWhatsapp = gerarLinkWhatsApp(
    viagem.origem,
    viagem.destino,
    viagem.percurso?.distancia || '',
    viagem.percurso?.tempo || '',
  );

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleGpx = () => {
    setErroGpx('');
    try {
      if (onGpxDownload) {
        onGpxDownload();
        return;
      }
      if (!Array.isArray(viagem.percurso?.geometria) || viagem.percurso.geometria.length < 2) {
        throw new Error('GPX indisponível: esta viagem não possui geometria rodoviária real.');
      }
      const [rotaPrincipal] = gerarRotasAlternativas(viagem);
      if (rotaPrincipal) baixarArquivoGpx(viagem.origem, viagem.destino, rotaPrincipal);
    } catch (error) {
      setErroGpx(error instanceof Error ? error.message : 'Não foi possível baixar o GPX.');
    }
  };

  return (
    <nav className="trip-navigation-container" aria-label="Navegação e ações da viagem planejada">
      {erroGpx && <p role="alert">{erroGpx}</p>}
      {/* 1. Linha de Abas de Navegação (Issue #11) */}
      <div className="trip-tabs-bar" role="tablist" aria-label="Seções do resultado da viagem">
        <button
          type="button"
          role="tab"
          id="tab-visao-geral"
          aria-selected={abaAtiva === 'visao-geral'}
          aria-controls="panel-visao-geral"
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
          title="Baixar arquivo GPX 1.1 da rota para GPS ou Garmin"
        >
          <span aria-hidden="true">📥</span>
          <span>Baixar GPX</span>
        </button>
      </div>
    </nav>
  );
}
