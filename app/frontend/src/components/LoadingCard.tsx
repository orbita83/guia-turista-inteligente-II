interface LoadingCardProps {
  origem: string;
  destino: string;
}

const BADGES = [
  ['🌡️', 'Clima', ''],
  ['💧', 'Umidade', ''],
  ['💨', 'Vento', ''],
  ['🚗', 'Distância', ' tele-badge-destaque'],
  ['⏱️', 'Tempo estimado', ' tele-badge-tempo'],
] as const;

export function LoadingCard({ origem, destino }: LoadingCardProps) {
  return (
    <article className="viagem-card viagem-card-loading" aria-live="polite" aria-busy="true">
      <div className="viagem-header">
        <div className="viagem-rota-info">
          <div className="viagem-rota-titulo">
            <span>{origem || 'Origem'}</span>
            <span className="viagem-rota-seta" aria-hidden="true">
              ➔
            </span>
            <span>{destino || 'Destino'}</span>
            <span className="badge-status-loading">
              <span className="spinner-inline" aria-hidden="true" /> Processando
            </span>
          </div>
        </div>
      </div>

      <div className="telemetria-grid" aria-label="Dados em processamento">
        {BADGES.map(([icone, texto, destaque]) => (
          <span key={texto} className={`tele-badge tele-badge-loading${destaque}`}>
            <span className="spinner-mini" aria-hidden="true" /> {icone} {texto}
          </span>
        ))}
      </div>

      <div className="secao-guia secao-guia-loading">
        <div className="secao-guia-header">
          <span className="spinner-mini" aria-hidden="true" /> 🤖 Consultando Inteligência
          Artificial Gemini...
        </div>
        <div className="skeleton-linhas" aria-hidden="true">
          <div className="skeleton-linha w-80" />
          <div className="skeleton-linha w-95" />
          <div className="skeleton-linha w-60" />
        </div>
        <p className="loading-subtexto">
          Integrando Open-Meteo, OSRM e Gemini AI. Por favor, aguarde alguns instantes...
        </p>
      </div>
    </article>
  );
}
