import {
  AppHeader,
  HistoricoViagens,
  LoginCard,
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
    historyStatus,
    historyError,
    persistenceById,
    telemetryState,
    connectivity,
    copyTelemetryRequestId,
    dismissToast,
    loginWithGoogle,
    loginAsVisitor,
    logout,
    submitTrip,
    deleteTrip,
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
                <RoteiroForm ufs={data.ufs} isSubmitting={isSubmitting} onSubmit={submitTrip} />
              </section>
              <aside className="planning-aside" aria-label="Painéis da viagem">
                <TelemetriaCard
                  state={telemetryState}
                  connectivity={connectivity}
                  onCopyRequestId={copyTelemetryRequestId}
                />
                <HistoricoViagens
                  viagens={data.viagens}
                  status={historyStatus}
                  errorMessage={historyError}
                  deletingIds={deletingIds}
                  pendingRoute={pendingRoute}
                  persistenceById={persistenceById}
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
