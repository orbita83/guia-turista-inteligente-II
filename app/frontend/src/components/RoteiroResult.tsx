import { useEffect, useMemo, useRef, useState } from 'react';
import { obterAtrativosPorDestino } from '../services/atrativosService';
import { streamGuiaTuristico } from '../services/streamingGuide';
import type { GuiaStreamingStatus, RoteiroFormData, Viagem } from '../types/domain';

export interface RoteiroResultProps {
  viagem: Viagem;
  formParams?: RoteiroFormData | null;
  visitasIds?: readonly string[];
  visitadosIds?: readonly string[];
  onToggleVisita?: (atrativoId: string) => void | Promise<void>;
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

export function RoteiroResult({
  viagem,
  formParams,
  visitasIds,
  visitadosIds,
  onToggleVisita,
}: RoteiroResultProps) {
  const idsVisitados = useMemo(
    () => visitasIds ?? visitadosIds ?? viagem.atrativosVisitadosIds ?? [],
    [visitasIds, visitadosIds, viagem.atrativosVisitadosIds],
  );

  // Estado do Streaming
  const [streamText, setStreamText] = useState('');
  const [streamStatus, setStreamStatus] = useState<GuiaStreamingStatus>('idle');
  const [copiado, setCopiado] = useState(false);
  const streamAbortControllerRef = useRef<AbortController | null>(null);

  // Filtro de atrativos
  const [filtroAtrativo, setFiltroAtrativo] = useState<FiltroAtrativo>('todos');

  // Atrativos do destino
  const todosAtrativos = useMemo(() => {
    // TODO(backend): receber a coleção estruturada de atrativos e gastronomia diretamente da resposta JSON de /planejar ou /minhas-viagens.
    if (viagem.atrativos && viagem.atrativos.length > 0) {
      return viagem.atrativos;
    }
    return obterAtrativosPorDestino(viagem.destino, formParams?.perfis);
  }, [viagem.destino, viagem.atrativos, formParams?.perfis]);

  // Estatísticas de visita
  const totalAtrativos = todosAtrativos.length;
  const visitadosCount = useMemo(
    () => todosAtrativos.filter((a) => idsVisitados.includes(a.id)).length,
    [todosAtrativos, idsVisitados],
  );
  const progressoPct = totalAtrativos > 0 ? Math.round((visitadosCount / totalAtrativos) * 100) : 0;

  // Atrativos filtrados
  const atrativosFiltrados = useMemo(() => {
    return todosAtrativos.filter((item) => {
      const isVisitado = idsVisitados.includes(item.id);
      if (filtroAtrativo === 'visitados') return isVisitado;
      if (filtroAtrativo === 'pendentes') return !isVisitado;
      if (filtroAtrativo === 'gastronomia') return item.categoria === 'gastronomia';
      return true;
    });
  }, [todosAtrativos, idsVisitados, filtroAtrativo]);

  // Função para acionar o streaming do guia
  const dispararStreaming = () => {
    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    streamAbortControllerRef.current = controller;

    setStreamText('');
    setStreamStatus('streaming');

    const payload = {
      destino: viagem.destino,
      dias_estadia: formParams?.duracao_dias || 1,
      estilo_viagem: formParams?.perfis?.[0] || 'cultural',
      clima_info: viagem.clima,
    };

    void streamGuiaTuristico(
      payload,
      {
        onChunk: (chunk) => {
          setStreamText((atual) => atual + chunk);
        },
        onDone: (full) => {
          setStreamText(full);
          setStreamStatus('completed');
        },
        onError: () => {
          // Em caso de falha de conexão, garante que o dicas_destino padrão seja exibido
          setStreamText(viagem.dicas_destino || 'Guia indisponível temporariamente.');
          setStreamStatus('error');
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
    dispararStreaming();
    return () => {
      if (streamAbortControllerRef.current) {
        streamAbortControllerRef.current.abort();
      }
    };
  }, [viagem.id]);

  const copiarTextoGuia = async () => {
    try {
      await navigator.clipboard.writeText(streamText || viagem.dicas_destino);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Ignora falhas de clipboard silenciosamente
    }
  };

  const secoesParsed = useMemo(() => extrairSecoesGuia(streamText), [streamText]);

  return (
    <article
      className="roteiro-result-card"
      aria-label={`Resultado do destino para ${viagem.destino}`}
    >
      {/* ------------------------------------------------------------------
          1. Banner Meteorológico (Open-Meteo) - RF-GUI-001
          ------------------------------------------------------------------ */}
      <section className="weather-banner" aria-labelledby="weather-title">
        {/* TODO(backend): preencher sensação térmica e condição climática estendida quando providas pelo Open-Meteo no backend. */}
        <div className="weather-banner-header">
          <h3 id="weather-title" className="weather-destination-title">
            <span aria-hidden="true">🌤️</span> Clima em {viagem.destino}
          </h3>
          <span className="weather-provider-badge">Open-Meteo API</span>
        </div>

        <div className="weather-metrics-grid">
          <div className="weather-metric-item">
            <span className="weather-metric-label">
              <span aria-hidden="true">🌡️</span> Temperatura
            </span>
            <strong className="weather-metric-value">{viagem.clima.temperatura || '-- °C'}</strong>
          </div>

          <div className="weather-metric-item">
            <span className="weather-metric-label">
              <span aria-hidden="true">💨</span> Vento
            </span>
            <strong className="weather-metric-value">{viagem.clima.vento || '-- km/h'}</strong>
          </div>

          <div className="weather-metric-item">
            <span className="weather-metric-label">
              <span aria-hidden="true">💧</span> Umidade
            </span>
            <strong className="weather-metric-value">{viagem.clima.umidade || '-- %'}</strong>
          </div>

          <div className="weather-metric-item">
            <span className="weather-metric-label">
              <span aria-hidden="true">☀️</span> Sensação
            </span>
            <strong className="weather-metric-value">
              {viagem.clima.sensacao || viagem.clima.temperatura || 'Agradável'}
            </strong>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          2. Guia do Viajante com Streaming (Gemini AI / SSE) - RF-GUI-002–004
          ------------------------------------------------------------------ */}
      <section className="guide-streaming-block" aria-labelledby="guide-title">
        <div className="guide-header">
          <div className="guide-title-wrapper">
            <h3 id="guide-title" className="guide-title">
              Guia do Viajante
            </h3>
            <span className="guide-ai-tag">Gemini AI</span>
          </div>

          <div className="guide-header-badges">
            {streamStatus === 'streaming' && (
              <span className="guide-status-badge is-streaming" role="status">
                <span className="pulse-dot" aria-hidden="true" />
                Transmitindo ao vivo…
              </span>
            )}
            {streamStatus === 'completed' && (
              <span className="guide-status-badge is-completed" role="status">
                ✓ Guia completo
              </span>
            )}
            {streamStatus === 'error' && (
              <span className="guide-status-badge is-error" role="status">
                ⚠️ Modo contingência
              </span>
            )}
          </div>
        </div>

        {/* Área de Texto em Streaming */}
        <div className="guide-content-area" role="region" aria-live="polite">
          {secoesParsed.length >= 2 ? (
            <div className="guide-parsed-sections">
              {secoesParsed.map((secao) => (
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
              {streamText || 'Aguardando transmissão do roteiro…'}
              {streamStatus === 'streaming' && (
                <span className="streaming-cursor" aria-hidden="true" />
              )}
            </p>
          )}
        </div>

        {/* Ações Rápidas do Guia */}
        <div className="guide-actions-bar">
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
            disabled={!streamText}
            title="Copiar texto do guia para a área de transferência"
          >
            <span aria-hidden="true">{copiado ? '✓' : '📋'}</span>
            <span>{copiado ? 'Copiado!' : 'Copiar guia'}</span>
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          3. Catálogo Interativo de Atrativos e Gastronomia - RF-GUI-005, RF-GUI-006
          ------------------------------------------------------------------ */}
      <section className="attractions-section" aria-labelledby="attractions-title">
        {/* TODO(backend): sincronizar confirmação de visita com o backend via PATCH /roteiros/{id}/visitas assim que disponível. */}
        <div className="attractions-header">
          <div className="attractions-title-box">
            <h3 id="attractions-title">Atrativos & Gastronomia</h3>
            <p>Descubra e marque os locais e pratos que você já conheceu.</p>
          </div>
        </div>

        {/* Barra de Progresso de Visitas */}
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

        {/* Abas de Filtros */}
        <div className="attractions-filter-tabs" role="tablist" aria-label="Filtrar atrativos">
          {(['todos', 'pendentes', 'visitados', 'gastronomia'] as const).map((aba) => (
            <button
              key={aba}
              type="button"
              role="tab"
              aria-selected={filtroAtrativo === aba}
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

        {/* Grid de Cards */}
        <div className="attractions-grid">
          {atrativosFiltrados.map((item) => {
            const isVisitado = idsVisitados.includes(item.id);
            return (
              <div key={item.id} className={`attraction-card${isVisitado ? ' is-visited' : ''}`}>
                <div className="attraction-card-top">
                  <div className="attraction-tag-row">
                    <span className="attraction-category-badge">{item.categoria}</span>
                    <span className="attraction-icon" aria-hidden="true">
                      {item.icone}
                    </span>
                  </div>
                  <h4 className="attraction-name">{item.nome}</h4>
                  <p className="attraction-description">{item.descricao}</p>
                </div>

                <button
                  type="button"
                  className={`btn-toggle-visit${isVisitado ? ' is-visited' : ''}`}
                  aria-pressed={isVisitado}
                  onClick={() => onToggleVisita?.(item.id)}
                >
                  <span aria-hidden="true">{isVisitado ? '✓' : '○'}</span>
                  <span>{isVisitado ? 'Visitado' : 'Marcar como visitado'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </article>
  );
}
