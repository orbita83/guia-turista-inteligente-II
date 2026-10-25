import { useEffect, useRef } from 'react';

import type { Usuario } from '../types/domain';

const AVATAR_PADRAO = 'https://lh3.googleusercontent.com/a/default-user=s96-c';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityApi {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_prompt: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme: string;
      size: string;
      text: string;
      shape: string;
      width: number;
    },
  ) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleIdentityApi;
      };
    };
  }
}

export function AppHeader() {
  return (
    <header className="app-header">
      <h1>🇧🇷 Guia do Turista Brasil</h1>
      <p>
        Consultor inteligente de viagens com rotas, clima e guia turístico gerado com Python e IA
      </p>
    </header>
  );
}

interface LoginCardProps {
  googleClientId?: string;
  isBusy?: boolean;
  onGoogleCredential: (credential: string) => void;
  onVisitorLogin: () => void;
}

export function LoginCard({
  googleClientId,
  isBusy = false,
  onGoogleCredential,
  onVisitorLogin,
}: LoginCardProps) {
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!googleClientId) return;

    let timeoutId: number | undefined;

    const renderGoogleButton = () => {
      const identity = window.google?.accounts?.id;
      const container = googleButtonRef.current;
      if (!identity || !container) return;

      container.replaceChildren();
      identity.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (response.credential) onGoogleCredential(response.credential);
        },
        auto_prompt: false,
      });
      identity.renderButton(container, {
        theme: 'outline',
        size: 'large',
        text: 'sign_in_with',
        shape: 'pill',
        width: 280,
      });
    };

    renderGoogleButton();
    timeoutId = window.setTimeout(renderGoogleButton, 800);

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      googleButtonRef.current?.replaceChildren();
    };
  }, [googleClientId, onGoogleCredential]);

  return (
    <section className="card login-card" aria-labelledby="login-title" aria-busy={isBusy}>
      <div className="login-lock" aria-hidden="true">
        🔒
      </div>
      <h2 id="login-title" className="login-title">
        Autenticação Necessária
      </h2>
      <p className="login-description">
        Faça login com sua Conta Google para acessar o planejador de viagens.
      </p>

      <div className="login-actions">
        <div
          ref={googleButtonRef}
          className="google-button-container"
          aria-label="Entrar com Google"
        >
          {googleClientId ? null : <p className="login-unavailable">Login Google indisponível.</p>}
        </div>

        <div className="visitor-login">
          <p>Ambiente de teste / desenvolvimento:</p>
          <button
            type="button"
            className="btn btn-toggle"
            disabled={isBusy}
            onClick={onVisitorLogin}
          >
            {isBusy ? 'Entrando...' : '👤 Entrar como Visitante'}
          </button>
        </div>
      </div>
    </section>
  );
}

interface UserBarProps {
  usuario: Usuario;
  isBusy?: boolean;
  onLogout: () => void;
}

export function UserBar({ usuario, isBusy = false, onLogout }: UserBarProps) {
  return (
    <section className="card user-bar" aria-label="Sessão ativa">
      <div className="user-info">
        <img
          src={usuario.foto || AVATAR_PADRAO}
          alt={`Avatar de ${usuario.nome}`}
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = AVATAR_PADRAO;
          }}
        />
        <div>
          <div className="user-name">{usuario.nome}</div>
          <div className="user-email">{usuario.email}</div>
        </div>
      </div>
      <button type="button" className="btn-logout btn" disabled={isBusy} onClick={onLogout}>
        {isBusy ? 'Saindo...' : 'Sair ➜'}
      </button>
    </section>
  );
}
