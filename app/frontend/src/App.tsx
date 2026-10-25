import {
  AppHeader,
  HistoricoViagens,
  LoadingCard,
  LoginCard,
  RoteiroForm,
  ToastContainer,
  UserBar,
} from './components';
import { useApp } from './hooks/useApp';

export function App() {
  const {
    data,
    jsonUrl,
    toasts,
    initialLoading,
    sessionLoading,
    isSubmitting,
    deletingId,
    pendingRoute,
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
            <RoteiroForm ufs={data.ufs} isSubmitting={isSubmitting} onSubmit={submitTrip} />
            <HistoricoViagens
              viagens={data.viagens}
              jsonUrl={jsonUrl}
              deletingId={deletingId}
              loadingCard={
                pendingRoute ? (
                  <LoadingCard origem={pendingRoute.origem} destino={pendingRoute.destino} />
                ) : null
              }
              onDelete={deleteTrip}
            />
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
