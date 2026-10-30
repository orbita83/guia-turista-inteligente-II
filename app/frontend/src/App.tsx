import { useEffect, useState } from 'react';
import {
  HistoricoViagens,
  LoginCard,
  MapaRota,
  RoteiroForm,
  RoteiroResult,
  TelemetriaCard,
  ToastContainer,
  TripNavigationTabs,
} from './components';
import { SessionHeader } from './components/SessionHeader';
import type { AbaViagem, RotaAlternativa } from './types/domain';
import { useViagem } from './hooks/useViagem';
import { useMunicipios } from './hooks/useMunicipios';
import { baixarGpxViagem } from './services/api';
import { geometriaValida } from './services/routeCalculator';

export function App() {
  const [abaViagemAtiva, setAbaViagemAtiva] = useState<AbaViagem>('visao-geral');
  const [routeSelection, setRouteSelection] = useState<
    { kind: 'legacy'; id: RotaAlternativa['id'] } | { kind: 'backend'; alternative: number | null }
  >({ kind: 'backend', alternative: null });

  const {
    data,
    toasts,
    initialLoading,
    sessionLoading,
    savedGoogleUser,
    sessionTimerLabel,
    isSubmitting,
    deletingIds,
    pendingRoute,
    activeTrip,
    activeTripForm,
    historyStatus,
    historyError,
    persistenceById,
    telemetryState,
    apiHealthStatus,
    operationalTelemetry,
    operationalError,
    sugestoes,
    suggestionStatus,
    visitasPorViagem,
    visitPersistenceByTrip,
    connectivity,
    copyTelemetryRequestId,
    dismissToast,
    loginWithGoogle,
    loginAsVisitor,
    restoreGoogleUser,
    logout,
    solicitarSugestoesGps,
    submitTrip,
    cancelTrip,
    deleteTrip,
    selectTrip,
    toggleVisitaAtrativo,
    retryLocalVisits,
    updateStreamSession,
  } = useViagem();
  const { municipios, status: municipioCatalogStatus } = useMunicipios(Boolean(data.usuario));

  useEffect(() => {
    setRouteSelection({ kind: 'backend', alternative: null });
  }, [activeTrip?.id]);
  const rotaAtivaId = routeSelection.kind === 'legacy' ? routeSelection.id : 'principal';
  const alternativaAtiva = routeSelection.kind === 'backend' ? routeSelection.alternative : null;
  const rotasValidas = activeTrip?.rotas?.filter((rota) => geometriaValida(rota.coordenadas)) ?? [];
  const rotaAtiva = rotasValidas.find((rota) => rota.id === rotaAtivaId) ?? rotasValidas[0];

  return (
    <div className="app-shell">
      <SessionHeader
        usuario={data.usuario}
        savedGoogleUser={savedGoogleUser}
        sessionTimerLabel={sessionTimerLabel}
        isBusy={sessionLoading}
        onVisitorLogin={loginAsVisitor}
        onRestoreGoogle={restoreGoogleUser}
        onLogout={logout}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <main aria-busy={initialLoading || sessionLoading}>
        {initialLoading ? (
          <section className="card boot-card" aria-live="polite">
            <span className="spinner-inline" aria-hidden="true" />
            Carregando sua sessão e seus roteiros...
          </section>
        ) : data.usuario ? (
          <>
            <div className="planning-layout planning-layout-with-sidebar">
              <section className="planning-column" aria-label="Planejamento da viagem">
                <RoteiroForm
                  ufs={data.ufs}
                  isSubmitting={isSubmitting}
                  municipios={municipios}
                  municipioCatalogStatus={municipioCatalogStatus}
                  sugestoes={sugestoes}
                  suggestionStatus={suggestionStatus}
                  onRequestSuggestions={solicitarSugestoesGps}
                  onSubmit={submitTrip}
                  onCancel={cancelTrip}
                />

                {activeTrip ? (
                  <>
                    <TripNavigationTabs
                      viagem={activeTrip}
                      abaAtiva={abaViagemAtiva}
                      onAbaChange={setAbaViagemAtiva}
                      onExcluir={() => deleteTrip(activeTrip.id)}
                      onGpxDownload={
                        rotaAtiva
                          ? undefined
                          : () => baixarGpxViagem(activeTrip.id, alternativaAtiva ?? -1)
                      }
                      rotaAtiva={rotaAtiva}
                      alternativaAtiva={
                        rotaAtiva
                          ? undefined
                          : activeTrip.percurso.alternativas?.[alternativaAtiva ?? -1]
                      }
                    />

                    {(abaViagemAtiva === 'visao-geral' || abaViagemAtiva === 'mapa') && (
                      <div
                        id="panel-mapa"
                        role="tabpanel"
                        aria-labelledby={
                          abaViagemAtiva === 'visao-geral' ? 'tab-visao-geral' : 'tab-mapa'
                        }
                      >
                        <MapaRota
                          viagem={activeTrip}
                          formParams={activeTripForm}
                          rotaAtivaId={rotaAtivaId}
                          onRotaChange={(rota) =>
                            setRouteSelection({ kind: 'legacy', id: rota.id })
                          }
                          alternativaAtiva={alternativaAtiva}
                          onAlternativaChange={(alternative) =>
                            setRouteSelection({ kind: 'backend', alternative })
                          }
                        />
                      </div>
                    )}

                    {
                      <div
                        id="panel-guia"
                        role="tabpanel"
                        hidden={abaViagemAtiva === 'mapa'}
                        aria-labelledby={
                          abaViagemAtiva === 'visao-geral' ? 'tab-visao-geral' : 'tab-guia'
                        }
                      >
                        {/* TODO(integracao): validar SSE e visitas persistidas no fluxo real, inclusive erros e recarga. */}
                        <RoteiroResult
                          viagem={activeTrip}
                          formParams={activeTripForm}
                          onStreamTelemetry={updateStreamSession}
                          visitPersistenceStatus={visitPersistenceByTrip[activeTrip.id]}
                          visitasIds={
                            visitasPorViagem[activeTrip.id] ??
                            activeTrip.atrativosVisitadosIds ??
                            []
                          }
                          onToggleVisita={(atrativoId) =>
                            toggleVisitaAtrativo(activeTrip.id, atrativoId)
                          }
                          onRetryVisitas={() => retryLocalVisits(activeTrip.id)}
                        />
                      </div>
                    }
                  </>
                ) : null}
              </section>
              <aside className="planning-aside" aria-label="Painéis da viagem">
                <TelemetriaCard
                  state={telemetryState}
                  apiHealthStatus={apiHealthStatus}
                  operationalTelemetry={operationalTelemetry}
                  operationalError={operationalError}
                  connectivity={connectivity}
                  onCopyRequestId={copyTelemetryRequestId}
                />
                <HistoricoViagens
                  viagens={data.viagens}
                  status={historyStatus}
                  errorMessage={historyError}
                  deletingIds={deletingIds}
                  activeTripId={activeTrip?.id}
                  pendingRoute={pendingRoute}
                  persistenceById={persistenceById}
                  onSelectTrip={selectTrip}
                  onDelete={deleteTrip}
                />
              </aside>
            </div>
          </>
        ) : (
          <LoginCard
            googleClientId={data.google_client_id}
            isBusy={sessionLoading}
            onGoogleCredential={loginWithGoogle}
            onVisitorLogin={loginAsVisitor}
          />
        )}
      </main>
    </div>
  );
}
