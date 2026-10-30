import { useEffect, useMemo, useRef, useState } from 'react';
import { streamGuiaTuristico } from '../services/streamingGuide';
import type {
  AtrativoTuristico,
  GuiaStreamingStatus,
  RoteiroFormData,
  StreamTelemetryUpdate,
  Viagem,
} from '../types/domain';

export interface RoteiroResultProps {
  viagem: Viagem;
  formParams?: RoteiroFormData | null;
  visitasIds?: readonly string[];
  visitadosIds?: readonly string[];
  visitPersistenceStatus?: 'pending' | 'local' | 'confirmed' | 'error';
  onToggleVisita?: (atrativoId: string) => void | Promise<void>;
  onRetryVisitas?: () => void | Promise<void>;
  onStreamTelemetry?: (update: StreamTelemetryUpdate) => void;
}

type FiltroAtrativo = 'todos' | 'pendentes' | 'visitados' | 'gastronomia';

/**
 * Seções estruturadas do guia conciso para exibição limpa.
 */
interface SecaoGuia {
  titulo: string;
  conteudo: string;
  icone: string;
}

function extrairSecoesGuia(texto: string): SecaoGuia[] {
  if (!texto) return [];

  const secoes: SecaoGuia[] = [];

  // Padrão de seções do Gemini AI pedagógico da apostila:
  // 📍 Pontos turísticos / Identidade | 🍽️ Culinária / Gastronomia | 💡 Dica de ouro / Clima
  const regex = /(📍[^\n]+|🍽️?[^\n]+|💡[^\n]+|📅[^\n]+)/g;
  const marcadores = Array.from(texto.matchAll(regex));

  if (marcadores.length >= 2) {
    for (let i = 0; i < marcadores.length; i++) {
      const match = marcadores[i];
      const tituloCompleto = match[0].trim();
      const inicio = (match.index || 0) + match[0].length;
      const fim = i + 1 < marcadores.length ? marcadores[i + 1].index : texto.length;
      const conteudo = texto.slice(inicio, fim).trim();

      let icone = '📌';
      if (tituloCompleto.includes('📍')) icone = '📍';
      else if (tituloCompleto.includes('🍽️') || tituloCompleto.includes('Culinária')) icone = '🍽️';
      else if (tituloCompleto.includes('💡') || tituloCompleto.includes('Dica')) icone = '💡';
      else if (tituloCompleto.includes('📅') || tituloCompleto.includes('Turnos')) icone = '📅';

      secoes.push({
        titulo: tituloCompleto,
        conteudo,
        icone,
      });
    }
  }

  return secoes;
}

function formatarPerfilViagem(perfis?: readonly string[]): string {
  if (!perfis || perfis.length === 0) return 'Perfil não informado';
  const mapa: Record<string, string> = {
    cultural: 'Cultural & Histórico',
    gastronomico: 'Gastronômico',
    natureza: 'Ecoturismo & Natureza',
    praia: 'Praia & Lazer',
    aventura: 'Aventura & Ecoturismo',
    compras: 'Compras & Urbano',
  };
  return perfis.map((p) => mapa[p] || p.charAt(0).toUpperCase() + p.slice(1)).join(' & ');
}

function obterIconeClima(condicao?: string): string {
  if (!condicao) return '🌡️';
  const c = condicao.toLowerCase();
  if (c.includes('chuva') || c.includes('chuv')) return '🌧️';
  if (c.includes('nublado') || c.includes('parcialmente')) return '🌤️';
  if (c.includes('tempestade') || c.includes('trovo')) return '⛈️';
  if (c.includes('neve')) return '❄️';
  if (c.includes('nevoeiro') || c.includes('névoa')) return '🌫️';
  return '☀️';
}

function climaDisponivel(value?: string): string | null {
  const normalized = value?.trim();
  return normalized && normalized !== 'Aguardando dados' && normalized.toUpperCase() !== 'N/D'
    ? normalized
    : null;
}

export function RoteiroResult({
  viagem,
  formParams,
  visitasIds,
  visitadosIds,
  visitPersistenceStatus,
  onToggleVisita,
  onRetryVisitas,
  onStreamTelemetry,
}: RoteiroResultProps) {
  const idsVisitados = useMemo(
    () => visitasIds ?? visitadosIds ?? viagem.atrativosVisitadosIds ?? [],
    [visitasIds, visitadosIds, viagem.atrativosVisitadosIds],
  );

  // Estado do Streaming
  const [streamText, setStreamText] = useState('');
  const [streamStatus, setStreamStatus] = useState<GuiaStreamingStatus>('idle');
  const [streamMessage, setStreamMessage] = useState('');
  const [streamMode, setStreamMode] = useState<'connecting' | 'sse' | 'fallback'>('connecting');
  const [copiado, setCopiado] = useState(false);
  const [detalhesAbertos, setDetalhesAbertos] = useState(true);
  const streamAbortControllerRef = useRef<AbortController | null>(null);

  // Filtro de atrativos
  const [filtroAtrativo, setFiltroAtrativo] = useState<FiltroAtrativo>('todos');

  // Atrativos do destino
  const todosAtrativos = useMemo(() => viagem.atrativos ?? [], [viagem.atrativos]);

  // Estatísticas de visita
  const totalAtrativos = todosAtrativos.length;
  const totalPontos = todosAtrativos.filter((item) => item.categoria !== 'gastronomia').length;
  const totalGastronomia = totalAtrativos - totalPontos;
  const visitadosCount = useMemo(
    () => todosAtrativos.filter((a) => idsVisitados.includes(a.id)).length,
    [todosAtrativos, idsVisitados],
  );
  const progressoPct = totalAtrativos > 0 ? Math.round((visitadosCount / totalAtrativos) * 100) : 0;

  // Filtragem dos atrativos
  const atrativosFiltrados = useMemo(() => {
    return todosAtrativos.filter((item) => {
      const isVisitado = idsVisitados.includes(item.id);
      if (filtroAtrativo === 'visitados') return isVisitado;
      if (filtroAtrativo === 'pendentes') return !isVisitado;
      if (filtroAtrativo === 'gastronomia') return item.categoria === 'gastronomia';
      return true;
    });
  }, [todosAtrativos, idsVisitados, filtroAtrativo]);

  // Separação em duas categorias do wireframe
  const pontosTuristicos = useMemo(() => {
    if (filtroAtrativo === 'gastronomia') return [];
    return atrativosFiltrados.filter((item) => item.categoria !== 'gastronomia');
  }, [atrativosFiltrados, filtroAtrativo]);

  const gastronomia = useMemo(() => {
    return atrativosFiltrados.filter((item) => item.categoria === 'gastronomia');
  }, [atrativosFiltrados]);

  // Função para acionar o streaming do guia
  const dispararStreaming = () => {
    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    streamAbortControllerRef.current = controller;

    setStreamText('');
    setStreamMessage('');
    setStreamStatus('streaming');
    setStreamMode('connecting');

    const payload = {
      destino: viagem.destino,
      ...(formParams?.duracao_dias ? { dias_estadia: formParams.duracao_dias } : {}),
      ...(formParams?.perfis?.length ? { estilo_viagem: formParams.perfis.join(', ') } : {}),
      clima_info: viagem.clima,
      atrativos: todosAtrativos
        .filter((item) => item.categoria !== 'gastronomia')
        .map((item) => item.nome)
        .slice(0, 30),
      gastronomia: todosAtrativos
        .filter((item) => item.categoria === 'gastronomia')
        .map((item) => item.nome)
        .slice(0, 30),
    };

    void streamGuiaTuristico(
      payload,
      {
        onMode: setStreamMode,
        onChunk: (chunk) => {
          if (!controller.signal.aborted) setStreamText((atual) => atual + chunk);
        },
        onReplace: (text) => {
          if (!controller.signal.aborted) setStreamText(text);
        },
        onDone: (full) => {
          if (controller.signal.aborted) return;
          setStreamText(full);
          setStreamStatus('completed');
        },
        onError: (error) => {
          if (controller.signal.aborted) return;
          setStreamMessage(error.message);
          setStreamStatus('error');
        },
        onTelemetry: (update) => {
          if (!controller.signal.aborted) {
            onStreamTelemetry?.(update);
          }
        },
      },
      {
        signal: controller.signal,
        fallbackText: viagem.dicas_destino,
        fallbackTokenDelayMs:
          Boolean(import.meta.env?.MODE === 'test') ||
          (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test')
            ? 0
            : 20,
      },
    );
  };

  useEffect(() => {
    // O planejamento já entrega o guia; uma segunda geração só ocorre por ação explícita.
    if (!viagem.dicas_destino.trim()) dispararStreaming();
    return () => {
      if (streamAbortControllerRef.current) {
        streamAbortControllerRef.current.abort();
      }
    };
  }, [viagem.id]);

  const cancelarStreaming = () => {
    streamAbortControllerRef.current?.abort();
    setStreamText('');
    setStreamStatus('idle');
    setStreamMessage('Transmissão cancelada.');
  };

  const textoGuia = streamStatus === 'error' || !streamText ? viagem.dicas_destino : streamText;

  const copiarTextoGuia = async () => {
    try {
      await navigator.clipboard.writeText(textoGuia);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Ignora falhas de clipboard silenciosamente
    }
  };

  const secoesParsed = useMemo(() => extrairSecoesGuia(textoGuia), [textoGuia]);
  const secoesExibidas = useMemo(() => {
    const pontos = secoesParsed.find((secao) => secao.titulo.includes('📍'));
    if (!pontos) return secoesParsed;
    const primeiroTurno = pontos.conteudo.search(/(?:Manhã|Tarde|Noite|Dia\s+\d+)\s*[:：-]/i);
    if (primeiroTurno < 0) return secoesParsed;
    const identidade = pontos.conteudo.slice(0, primeiroTurno).trim();
    const roteiro = pontos.conteudo.slice(primeiroTurno).trim();
    return secoesParsed.flatMap((secao) => {
      if (secao !== pontos) {
        if (secao.titulo.includes('🍽️')) return [{ ...secao, titulo: 'Tradições Gastronômicas' }];
        if (secao.titulo.includes('💡'))
          return [{ ...secao, titulo: 'Orientações Práticas e Clima' }];
        return [secao];
      }
      return [
        ...(identidade
          ? [{ titulo: 'Identidade e Atmosfera Local', conteudo: identidade, icone: '📍' }]
          : []),
        { titulo: 'Roteiro Sugerido', conteudo: roteiro, icone: '📅' },
      ];
    });
  }, [secoesParsed]);

  const duracao = formParams?.duracao_dias;
  const duracaoLabel = duracao
    ? `${duracao} Dia${duracao > 1 ? 's' : ''}`
    : 'Duração não informada';
  const perfilLabel = formParams?.perfis?.length
    ? formatarPerfilViagem(formParams.perfis)
    : 'Perfil não informado';

  const renderCard = (item: AtrativoTuristico) => {
    const isVisitado = idsVisitados.includes(item.id);
    const linkMaps =
      item.linkMaps ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${item.nome} ${viagem.destino}`,
      )}`;

    return (
      <article
        key={item.id}
        className={`attraction-card${isVisitado ? ' is-visited' : ''}`}
        aria-label={`${item.nome} (${item.categoria})`}
      >
        <div className="attraction-card-top">
          <div className="attraction-tag-row">
            <span className="attraction-category-badge">{item.categoria.toUpperCase()}</span>
            <a
              href={linkMaps}
              target="_blank"
              rel="noopener noreferrer"
              className="attraction-maps-link"
              title={`Ver ${item.nome} no Google Maps`}
            >
              Maps ↗
            </a>
          </div>

          <h5 className="attraction-name">{item.nome}</h5>

          {item.destaque ? (
            <p className="attraction-highlight">
              <strong>Destaque:</strong> {item.destaque}
            </p>
          ) : (
            <p className="attraction-description">{item.descricao}</p>
          )}
        </div>

        <button
          type="button"
          className={`btn-toggle-visit${isVisitado ? ' is-visited' : ''}`}
          aria-pressed={isVisitado}
          disabled={visitPersistenceStatus === 'pending'}
          onClick={() => onToggleVisita?.(item.id)}
        >
          <span aria-hidden="true">{isVisitado ? '✓' : '○'}</span>
          <span>{isVisitado ? 'Visitado' : 'Marcar como visitado'}</span>
        </button>
      </article>
    );
  };

  return (
    <div className="roteiro-result-layout">
      <article
        className="roteiro-result-card"
        aria-label={`Resultado do destino para ${viagem.destino}`}
      >
        {/* ------------------------------------------------------------------
          1. Topo / Identificação da Viagem (Wireframe Seção 3.3)
          ------------------------------------------------------------------ */}
        <div className="trip-summary-header-card" aria-label="Identificação da viagem">
          <div className="trip-profile-pill">
            <span className="trip-profile-icon" aria-hidden="true">
              🏛️
            </span>
            <span className="trip-profile-text">
              {perfilLabel} · {duracaoLabel}
            </span>
          </div>
          <div className="trip-route-title">
            <span aria-hidden="true">🚗</span>
            <span>
              {viagem.origem} ➔ {viagem.destino}
            </span>
          </div>
        </div>

        {/* ------------------------------------------------------------------
          2. Banner Meteorológico (Open-Meteo) - Conforme Wireframe Seção 3.3
          ------------------------------------------------------------------ */}
        <section className="weather-banner" aria-labelledby="weather-title">
          <div className="weather-banner-header">
            <div className="weather-destination-group">
              <span className="weather-icon" aria-hidden="true">
                {obterIconeClima(climaDisponivel(viagem.clima.condicao) ?? undefined)}
              </span>
              <h3
                id="weather-title"
                className="weather-destination-title"
                aria-label={`Clima em ${viagem.destino}`}
              >
                CLIMA NO DESTINO ({viagem.destino.toUpperCase()})
              </h3>
              <span className="sr-only">Clima em {viagem.destino}</span>
            </div>
            {(climaDisponivel(viagem.clima.temperatura) ||
              climaDisponivel(viagem.clima.condicao)) && (
              <span className="weather-provider-badge">Open-Meteo API</span>
            )}
          </div>

          <div className="weather-banner-details">
            <div className="weather-highlight">
              <strong className="weather-temp-val">
                {climaDisponivel(viagem.clima.temperatura) ?? 'Temperatura indisponível'}
              </strong>
              <span className="weather-dot-sep">·</span>
              <span className="weather-cond-label">
                {climaDisponivel(viagem.clima.condicao) ?? 'Condição indisponível'}
              </span>
            </div>

            <div className="weather-sub-metrics">
              <div className="weather-sub-item">
                <span className="weather-sub-label">Sensação:</span>
                <strong className="weather-sub-val">
                  {climaDisponivel(viagem.clima.sensacao) ?? 'Indisponível'}
                </strong>
              </div>
              {climaDisponivel(viagem.clima.vento) && (
                <div className="weather-sub-item">
                  <span className="weather-sub-label">Vento:</span>
                  <strong className="weather-sub-val">{climaDisponivel(viagem.clima.vento)}</strong>
                </div>
              )}
              {climaDisponivel(viagem.clima.umidade) && (
                <div className="weather-sub-item">
                  <span className="weather-sub-label">Umidade:</span>
                  <strong className="weather-sub-val">
                    {climaDisponivel(viagem.clima.umidade)}
                  </strong>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------
          3. Guia do Viajante com Streaming (Gemini AI / SSE) - RF-GUI-002–004
          ------------------------------------------------------------------ */}
        <section className="guide-streaming-block" aria-labelledby="guide-title">
          <div className="guide-header">
            <div className="guide-title-wrapper">
              <h3 id="guide-title" className="guide-title">
                <span aria-hidden="true">🧭</span> <span>Guia do Viajante</span>
              </h3>
              {viagem.telemetria?.provedores?.gemini === 'disponivel' && (
                <span className="guide-ai-tag">Gemini AI</span>
              )}
            </div>

            <div className="guide-header-badges">
              {streamStatus === 'streaming' && (
                <span className="guide-status-badge is-streaming" role="status">
                  <span className="pulse-dot" aria-hidden="true" />
                  {streamMode === 'sse'
                    ? 'Transmitindo ao vivo…'
                    : streamMode === 'fallback'
                      ? 'Exibindo conteúdo existente…'
                      : 'Conectando ao guia…'}
                </span>
              )}
              {streamStatus === 'completed' && (
                <span className="guide-status-badge is-completed" role="status">
                  {streamMode === 'sse'
                    ? '✓ Transmissão concluída'
                    : '✓ Conteúdo existente exibido'}
                </span>
              )}
              {streamStatus === 'idle' && !streamMessage && viagem.dicas_destino.trim() && (
                <span className="guide-status-badge is-completed" role="status">
                  Guia recebido no planejamento
                </span>
              )}
              {streamStatus === 'idle' && streamMessage && (
                <span className="guide-status-badge" role="status">
                  {streamMessage}
                </span>
              )}
              {streamStatus === 'error' && (
                <span className="guide-status-badge is-error" role="status">
                  ⚠️ Falha na transmissão
                </span>
              )}
            </div>
          </div>

          {streamStatus === 'error' && <p role="alert">{streamMessage}</p>}
          {textoGuia &&
            (streamStatus === 'error' || (streamStatus === 'streaming' && !streamText)) && (
              <p role="status">Exibindo o guia recebido no planejamento.</p>
            )}

          {/* Área de Texto em Streaming */}
          <div
            className="guide-content-area"
            role="region"
            aria-label="Conteúdo do guia"
            hidden={!detalhesAbertos}
          >
            {secoesExibidas.length >= 2 ? (
              <div className="guide-parsed-sections">
                {secoesExibidas.map((secao) => (
                  <div key={secao.titulo} className="guide-section-card">
                    <div className="guide-section-heading">
                      <span aria-hidden="true">{secao.icone}</span>
                      <span>{secao.titulo}</span>
                    </div>
                    <p className="guide-section-text">{secao.conteudo}</p>
                  </div>
                ))}
                {streamStatus === 'streaming' && (
                  <span className="streaming-cursor" aria-hidden="true" />
                )}
              </div>
            ) : (
              <p>
                {textoGuia || 'Aguardando transmissão do roteiro…'}
                {streamStatus === 'streaming' && (
                  <span className="streaming-cursor" aria-hidden="true" />
                )}
              </p>
            )}
          </div>

          {/* Ações Rápidas do Guia */}
          <div className="guide-actions-bar">
            {streamStatus === 'streaming' && (
              <button type="button" className="btn-guide-action" onClick={cancelarStreaming}>
                Cancelar transmissão
              </button>
            )}
            <button
              type="button"
              className="btn-guide-action"
              onClick={dispararStreaming}
              disabled={streamStatus === 'streaming'}
              title="Retransmitir o guia turístico pelo assistente"
            >
              <span aria-hidden="true">🔄</span>
              <span>Retransmitir</span>
            </button>

            <button
              type="button"
              className="btn-guide-action"
              onClick={copiarTextoGuia}
              disabled={!textoGuia}
              title="Copiar texto do guia para a área de transferência"
            >
              <span aria-hidden="true">{copiado ? '✓' : '📋'}</span>
              <span>{copiado ? 'Copiado!' : 'Copiar guia'}</span>
            </button>
            <div className="guide-collapse-row">
              <button
                type="button"
                className="btn-guide-action btn-guide-collapse"
                aria-expanded={detalhesAbertos}
                onClick={() => setDetalhesAbertos((atual) => !atual)}
              >
                {detalhesAbertos ? 'Recolher detalhes do guia' : 'Mostrar detalhes do guia'}
              </button>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------
          4. Catálogo Interativo de Atrativos e Gastronomia - Wireframe Seção 3.3
          ------------------------------------------------------------------ */}
      </article>
      <section className="attractions-section" aria-label="Atrativos e gastronomia do destino">
        {/* TODO(integracao): reconciliar visitas com a resposta PATCH e com o histórico após recarga. */}
        {totalAtrativos === 0 && (
          <div className="attractions-header">
            <div className="attractions-title-box">
              <h3 id="attractions-title">Atrativos & Gastronomia</h3>
              <p>Descubra e marque os locais e pratos que você já conheceu.</p>
              <p role="status">Ainda não há atrativos catalogados para {viagem.destino}.</p>
            </div>
          </div>
        )}

        {visitPersistenceStatus && (
          <p role="status" className="visits-persistence-status">
            {visitPersistenceStatus === 'pending' && 'Salvando visita…'}
            {visitPersistenceStatus === 'local' && 'Visitas salvas apenas neste dispositivo.'}
            {visitPersistenceStatus === 'confirmed' && 'Visitas confirmadas no servidor.'}
            {visitPersistenceStatus === 'error' && 'Falha ao salvar visita. Tente novamente.'}
          </p>
        )}
        {visitPersistenceStatus === 'local' && onRetryVisitas && (
          <button type="button" className="btn-guide-action" onClick={onRetryVisitas}>
            Tentar sincronizar visitas
          </button>
        )}

        {/* Barra de Progresso de Visitas */}
        {totalAtrativos > 0 && (
          <div className="visits-progress-container">
            <div className="visits-progress-header">
              <span>Seu progresso no destino</span>
              <strong>
                {visitadosCount} de {totalAtrativos} visitados ({progressoPct}%)
              </strong>
            </div>
            <div
              className="visits-progress-bar"
              role="progressbar"
              aria-valuenow={progressoPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso de atrativos visitados"
            >
              <div className="visits-progress-fill" style={{ width: `${progressoPct}%` }} />
            </div>
          </div>
        )}

        {/* Abas de Filtros */}
        {totalAtrativos > 0 && (
          <div className="attractions-filter-tabs" role="group" aria-label="Filtrar atrativos">
            {(['todos', 'pendentes', 'visitados', 'gastronomia'] as const).map((aba) => (
              <button
                key={aba}
                type="button"
                aria-pressed={filtroAtrativo === aba}
                className={`filter-tab-btn${filtroAtrativo === aba ? ' is-active' : ''}`}
                onClick={() => setFiltroAtrativo(aba)}
              >
                {aba === 'todos' && 'Todos'}
                {aba === 'pendentes' && 'A visitar'}
                {aba === 'visitados' && `Visitados (${visitadosCount})`}
                {aba === 'gastronomia' && 'Gastronomia'}
              </button>
            ))}
          </div>
        )}

        {/* Seção 1: Pontos Turísticos & Atrativos */}
        {filtroAtrativo !== 'gastronomia' && (
          <div className="attractions-group" aria-label="Pontos Turísticos & Atrativos">
            <div className="attractions-group-header">
              <h4 className="attractions-group-title">
                <span aria-hidden="true">📍</span> Pontos Turísticos & Atrativos
              </h4>
              <p>Principais atrativos catalogados no destino.</p>
              <span className="attractions-count-pill">
                {totalPontos} {totalPontos === 1 ? 'local' : 'locais'}
              </span>
            </div>
            {pontosTuristicos.length > 0 ? (
              <div className="attractions-grid">{pontosTuristicos.map(renderCard)}</div>
            ) : (
              <p className="attractions-group-empty">
                {totalPontos
                  ? 'Nenhum ponto turístico corresponde ao filtro selecionado.'
                  : 'Sem pontos turísticos catalogados para este destino.'}
              </p>
            )}
          </div>
        )}

        {/* Seção 2: Restaurantes & Gastronomia */}
        <div className="attractions-group" aria-label="Restaurantes & Gastronomia">
          <div className="attractions-group-header">
            <h4 className="attractions-group-title">
              <span aria-hidden="true">🍽️</span> Restaurantes & Gastronomia
            </h4>
            <p>Opções gastronômicas catalogadas no destino.</p>
            <span className="attractions-count-pill">
              {totalGastronomia} {totalGastronomia === 1 ? 'opção' : 'opções'}
            </span>
          </div>
          {gastronomia.length > 0 ? (
            <div className="attractions-grid">{gastronomia.map(renderCard)}</div>
          ) : (
            <p className="attractions-group-empty">
              {totalGastronomia
                ? 'Nenhuma opção gastronômica corresponde ao filtro selecionado.'
                : 'Sem restaurantes catalogados para este destino.'}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
