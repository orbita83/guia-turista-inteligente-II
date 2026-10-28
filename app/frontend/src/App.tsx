import {
  AppHeader,
  HistoricoViagens,
  LoginCard,
  MapaRota,
  RoteiroForm,
  TelemetriaCard,
  ToastContainer,
  UserBar,
} from './components';
import { useApp } from './hooks/useApp';

export function App() {
  const {
    data,
    toasts,
    initialLoading,
    sessionLoading,
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
    connectivity,
    copyTelemetryRequestId,
    dismissToast,
    loginWithGoogle,
    loginAsVisitor,
    logout,
    submitTrip,
    deleteTrip,
    selectTrip,
  } = useApp();

  return (
    <div className="app-shell">
      <AppHeader />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <main aria-busy={initialLoading || sessionLoading}>
        {initialLoading ? (
          <section className="card boot-card" aria-live="polite">
            <span className="spinner-inline" aria-hidden="true" />
            Carregando sua sessão e seus roteiros...
          </section>
        ) : data.usuario ? (
          <>
            <UserBar usuario={data.usuario} isBusy={sessionLoading} onLogout={logout} />
            <div className="planning-layout planning-layout-with-sidebar">
              <section className="planning-column" aria-label="Planejamento da viagem">
                {/* TODO(backend): ligar o catálogo de municípios e as sugestões por GPS
                    quando a API expuser esses dados; o formulário já aceita ambos por props. */}
                <RoteiroForm ufs={data.ufs} isSubmitting={isSubmitting} onSubmit={submitTrip} />

                {activeTrip ? <MapaRota viagem={activeTrip} formParams={activeTripForm} /> : null}
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
