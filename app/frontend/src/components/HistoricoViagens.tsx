import type { HistoryStatus, PersistenceStatus, Viagem } from '../types/domain';

interface ViagemCardProps {
  viagem: Viagem;
  deleting?: boolean;
  disabled?: boolean;
  isActive?: boolean;
  persistenceStatus?: PersistenceStatus;
  onSelect?: (viagem: Viagem) => void;
  onDelete: (viagemId: string) => void | Promise<void>;
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  const unavailable = value === 'Aguardando dados';
  return (
    <span className={`history-metric${unavailable ? ' is-unavailable' : ''}`}>
      <span aria-hidden="true">{icon}</span>
      <span className="sr-only">{label}: </span>
      {value}
    </span>
  );
}

export function ViagemCard({
  viagem,
  deleting = false,
  disabled = false,
  isActive = false,
  persistenceStatus,
  onSelect,
  onDelete,
}: ViagemCardProps) {
  const routeLabel = `${viagem.origem} para ${viagem.destino}`;

  return (
    <article
      className={`history-trip${isActive ? ' is-active-trip' : ''}`}
      aria-label={`Viagem de ${routeLabel}`}
      onClick={() => onSelect?.(viagem)}
      style={{ cursor: onSelect ? 'pointer' : undefined }}
    >
      <div className="history-trip-topline">
        <h3 className="history-route">
          <span aria-hidden="true">🚗</span>
          <span>{viagem.origem}</span>
          <span className="history-route-arrow" aria-hidden="true">
            →
          </span>
          <span>{viagem.destino}</span>
        </h3>
        <span className="history-duration">
          <span aria-hidden="true">⚡</span>
          <span className="sr-only">Duração: </span>
          {viagem.percurso.tempo}
        </span>
      </div>

      <div className="history-trip-meta" aria-label="Resumo da viagem">
        <Metric icon="☀️" label="Temperatura" value={viagem.clima.temperatura} />
        <span className="history-meta-separator" aria-hidden="true">
          •
        </span>
        <Metric icon="🛣️" label="Distância" value={viagem.percurso.distancia} />
      </div>

      <div className="history-trip-footer">
        {persistenceStatus ? (
          <span className={`history-persistence is-${persistenceStatus}`} role="status">
            {persistenceStatus === 'pending' ? (
              <>
                <span className="spinner-mini" aria-hidden="true" /> Salvando viagem…
              </>
            ) : (
              'Ainda não foi possível confirmar'
            )}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="history-delete"
          disabled={deleting || disabled}
          aria-label={`${deleting ? 'Excluindo' : 'Excluir'} viagem de ${routeLabel}`}
          onClick={(event) => {
            event.stopPropagation();
            void onDelete(viagem.id);
          }}
        >
          <span aria-hidden="true">🗑️</span>
          {deleting ? 'Excluindo…' : 'Excluir'}
        </button>
      </div>
    </article>
  );
}

interface HistoricoViagensProps {
  viagens: readonly Viagem[];
  status?: HistoryStatus;
  errorMessage?: string;
  deletingIds?: readonly string[];
  activeTripId?: string | null;
  persistenceById?: Readonly<Record<string, PersistenceStatus>>;
  pendingRoute?: { origem: string; destino: string } | null;
  onSelectTrip?: (viagem: Viagem) => void;
  onDelete: (viagemId: string) => void | Promise<void>;
}

export function HistoricoViagens({
  viagens,
  status = 'ready',
  errorMessage,
  deletingIds = [],
  activeTripId = null,
  persistenceById = {},
  pendingRoute,
  onSelectTrip,
  onDelete,
}: HistoricoViagensProps) {
  return (
    <section className="card history-panel" aria-labelledby="historico-title">
      <header className="history-heading">
        <span className="history-heading-icon" aria-hidden="true">
          🗂️
        </span>
        <div>
          <h2 id="historico-title">Viagens Salvas</h2>
          <p>Histórico de viagens salvas</p>
        </div>
      </header>

      {status === 'loading' ? (
        <p className="history-state" role="status">
          <span className="spinner-inline" aria-hidden="true" />
          Carregando viagens salvas…
        </p>
      ) : null}

      {status === 'offline' || status === 'error' ? (
        <p className="history-state is-error" role="alert">
          {errorMessage ??
            (status === 'offline'
              ? 'Você está offline. As viagens confirmadas continuam disponíveis.'
              : 'Não foi possível atualizar o histórico. Tente novamente.')}
        </p>
      ) : null}

      {pendingRoute ? (
        <article className="history-trip is-planning" aria-label="Viagem em processamento">
          <div className="history-trip-topline">
            <h3 className="history-route">
              <span aria-hidden="true">🚗</span>
              <span>{pendingRoute.origem}</span>
              <span className="history-route-arrow" aria-hidden="true">
                →
              </span>
              <span>{pendingRoute.destino}</span>
            </h3>
          </div>
          <p className="history-planning-status" role="status">
            <span className="spinner-mini" aria-hidden="true" /> Gerando viagem…
          </p>
        </article>
      ) : null}

      <div className="history-list" aria-live="polite">
        {viagens.map((viagem) => (
          <ViagemCard
            key={viagem.id}
            viagem={viagem}
            deleting={deletingIds.includes(viagem.id)}
            disabled={status === 'offline'}
            isActive={viagem.id === activeTripId}
            persistenceStatus={persistenceById[viagem.id]}
            onSelect={onSelectTrip}
            onDelete={onDelete}
          />
        ))}
      </div>

      {status !== 'loading' && !pendingRoute && viagens.length === 0 ? (
        <div className="history-empty">
          <span aria-hidden="true">🧭</span>
          <p>Nenhuma viagem salva ainda.</p>
          <small>Planeje sua primeira viagem para vê-la aqui.</small>
        </div>
      ) : null}
    </section>
  );
}
