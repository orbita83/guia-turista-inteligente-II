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

export function App() {
  const [abaViagemAtiva, setAbaViagemAtiva] = useState<AbaViagem>('visao-geral');
  const [rotaAtivaId, setRotaAtivaId] = useState<RotaAlternativa['id']>('principal');
  const [alternativaAtiva, setAlternativaAtiva] = useState<number | null>(null);

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
    deleteTrip,
    selectTrip,
    toggleVisitaAtrativo,
    retryLocalVisits,
    updateStreamSession,
  } = useViagem();
  const { municipios, status: municipioCatalogStatus } = useMunicipios(Boolean(data.usuario));

  useEffect(() => {
    setRotaAtivaId('principal');
    setAlternativaAtiva(null);
  }, [activeTrip?.id]);
  const rotaAtiva =
    activeTrip?.rotas?.find((rota) => rota.id === rotaAtivaId) ?? activeTrip?.rotas?.[0];

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
                />

                {activeTrip ? (
                  <>
                    <TripNavigationTabs
                      viagem={activeTrip}
                      abaAtiva={abaViagemAtiva}
                      onAbaChange={setAbaViagemAtiva}
                      onExcluir={() => deleteTrip(activeTrip.id)}
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
                          onRotaChange={(rota) => setRotaAtivaId(rota.id)}
                          alternativaAtiva={alternativaAtiva}
                          onAlternativaChange={setAlternativaAtiva}
                        />
                      </div>
                    )}

                    {(abaViagemAtiva === 'visao-geral' || abaViagemAtiva === 'guia') && (
                      <div
                        id="panel-guia"
                        role="tabpanel"
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
                    )}
                  </>
                ) : null}
              </section>
              <aside className="planning-aside" aria-label="Painéis da viagem">
                <TelemetriaCard
                  state={telemetryState}
                  apiHealthStatus={apiHealthStatus}
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
