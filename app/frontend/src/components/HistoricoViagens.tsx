import { useState } from 'react';

import type { MouseEvent } from 'react';
import type { Viagem } from '../types/domain';

interface ViagemCardProps {
  viagem: Viagem;
  deleting?: boolean;
  onDelete: (viagemId: string) => void | Promise<void>;
}

function criarMapsUrl(viagem: Viagem) {
  const params = new URLSearchParams({
    api: '1',
    origin: viagem.origem,
    destination: viagem.destino,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function ViagemCard({ viagem, deleting = false, onDelete }: ViagemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = `detalhes-${viagem.id}`;

  const alternarCard = (event: MouseEvent<HTMLElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest('.btn-actions, .btn, button, a, form, input, .viagem-detalhes')
    ) {
      return;
    }
    setExpanded((atual) => !atual);
  };

  return (
    <article
      className="viagem-card"
      id={`card-${viagem.id}`}
      title="Clique no cartão para expandir ou recolher o guia"
      onClick={alternarCard}
    >
      <div className="viagem-header">
        <div className="viagem-rota-info">
          <h3 className="viagem-rota-titulo">
            <button
              type="button"
              className="viagem-accordion-trigger"
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={() => setExpanded((atual) => !atual)}
            >
              <span>{viagem.origem}</span>
              <span className="viagem-rota-seta" aria-hidden="true">
                ➔
              </span>
              <span>{viagem.destino}</span>
              <span className={`indicador-accordion${expanded ? ' ativo' : ''}`} aria-hidden="true">
                {expanded ? '▲' : '▼'}
              </span>
            </button>
          </h3>
        </div>
        <div className="btn-actions">
          <a
            href={criarMapsUrl(viagem)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-maps btn"
          >
            🗺️ Maps
          </a>
          <button
            type="button"
            className="btn-danger btn"
            disabled={deleting}
            onClick={() => onDelete(viagem.id)}
          >
            {deleting ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>

      <div className="telemetria-grid" aria-label="Resumo da viagem">
        <span className="tele-badge">🌡️ {viagem.clima.temperatura}</span>
        <span className="tele-badge">💧 {viagem.clima.umidade}</span>
        <span className="tele-badge">💨 {viagem.clima.vento}</span>
        <span className="tele-badge tele-badge-destaque">🚗 {viagem.percurso.distancia}</span>
        <span className="tele-badge tele-badge-tempo">⏱️ {viagem.percurso.tempo}</span>
      </div>

      <div id={detailsId} className={`viagem-detalhes${expanded ? '' : ' hidden'}`}>
        <section className="secao-guia" aria-label="Guia turístico">
          <h4 className="secao-guia-header">🏛️ Guia Turístico &amp; Culinária do Destino</h4>
          <div className="guia-texto">{viagem.dicas_destino}</div>
        </section>
      </div>
    </article>
  );
}

interface HistoricoViagensProps {
  viagens: readonly Viagem[];
  jsonUrl: string;
  deletingId?: string | null;
  loadingCard?: React.ReactNode;
  onDelete: (viagemId: string) => void | Promise<void>;
}

export function HistoricoViagens({
  viagens,
  jsonUrl,
  deletingId,
  loadingCard,
  onDelete,
}: HistoricoViagensProps) {
  return (
    <section className="card" aria-labelledby="historico-title">
      <div className="historico-header">
        <h2 id="historico-title" className="form-title">
          📍 Seus Roteiros Salvos
        </h2>
        <a
          href={jsonUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-toggle btn-json"
          title="Visualizar estrutura e metadados brutos do arquivo JSON de viagens"
        >
          📄 Ver JSON (API)
        </a>
      </div>

      {loadingCard}

      <div id="listaViagens">
        {viagens.length > 0 ? (
          viagens.map((viagem) => (
            <ViagemCard
              key={viagem.id}
              viagem={viagem}
              deleting={deletingId === viagem.id}
              onDelete={onDelete}
            />
          ))
        ) : loadingCard ? null : (
          <p id="msgSemRoteiros" className="empty-message">
            Nenhum roteiro salvo ainda. Planeje sua primeira rota acima!
          </p>
        )}
      </div>
    </section>
  );
}
