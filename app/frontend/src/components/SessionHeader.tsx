import { useEffect, useRef, useState } from 'react';

import type { Usuario } from '../types/domain';
import { useTheme } from '../hooks/useTheme';

interface SessionHeaderProps {
  usuario: Usuario | null;
  savedGoogleUser: Usuario | null;
  sessionTimerLabel?: string | null;
  isBusy: boolean;
  onVisitorLogin: () => void;
  onRestoreGoogle: () => void;
  onLogout: () => void;
}

function Avatar({ user }: { user: Usuario }) {
  return user.tipo === 'google' && user.foto ? (
    <img className="account-avatar" src={user.foto} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className="account-avatar account-avatar-placeholder" aria-hidden="true">
      👤
    </span>
  );
}

export function SessionHeader({
  usuario,
  savedGoogleUser,
  sessionTimerLabel,
  isBusy,
  onVisitorLogin,
  onRestoreGoogle,
  onLogout,
}: SessionHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { dark, toggleTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target))
        setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [menuOpen]);

  const act = (callback: () => void) => {
    setMenuOpen(false);
    callback();
  };

  return (
    <header className="session-header">
      <div className="session-header-inner">
        <div className="session-brand">
          <span className="brand-mark" aria-hidden="true">
            ⚑
          </span>
          <div>
            <h1>Guia do Turista Brasil</h1>
            <p>
              Consultor inteligente de viagens com rotas, clima e guia turístico gerado com Python e
              IA
            </p>
            {usuario?.tipo === 'visitante' && sessionTimerLabel && (
              <p role="status">Sessão temporária: {sessionTimerLabel} restantes</p>
            )}
          </div>
        </div>
        <div className="session-header-actions">
          <button
            type="button"
            className="theme-toggle"
            aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'}
            onClick={toggleTheme}
          >
            {dark ? '☀️' : '🌙'}
          </button>
          {usuario && (
            <div className="account-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="account-trigger"
                aria-expanded={menuOpen}
                aria-controls="account-menu"
                disabled={isBusy}
                onClick={() => setMenuOpen((current) => !current)}
              >
                <Avatar user={usuario} />
                <span>{usuario.nome.split(' ')[0]}</span>
                <span className="account-chevron" aria-hidden="true">
                  {menuOpen ? '▲' : '▼'}
                </span>
              </button>
              {menuOpen && (
                <div id="account-menu" className="account-menu" aria-label="Opções da conta">
                  <div className="account-menu-user">
                    <Avatar user={usuario} />
                    <div>
                      <strong>{usuario.nome}</strong>
                      <span>{usuario.email}</span>
                      <span className="account-status">
                        {usuario.tipo === 'google'
                          ? '🔒 Conta Google Conectada'
                          : '👤 Modo Visitante'}
                      </span>
                    </div>
                  </div>
                  <div className="account-menu-section">
                    <h2>Alternar modo de navegação</h2>
                    {usuario.tipo === 'google' ? (
                      <button
                        type="button"
                        className="account-switch"
                        onClick={() => act(onVisitorLogin)}
                      >
                        <span aria-hidden="true">👤</span>
                        <span>
                          <strong>Alternar para Modo Visitante</strong>
                          <small>Navegação temporária sem vincular conta</small>
                        </span>
                        <span className="switch-arrow" aria-hidden="true">
                          ➜
                        </span>
                      </button>
                    ) : savedGoogleUser ? (
                      <button
                        type="button"
                        className="account-switch"
                        onClick={() => act(onRestoreGoogle)}
                      >
                        <span aria-hidden="true">↩</span>
                        <span>
                          <strong>Voltar para {savedGoogleUser.nome.split(' ')[0]}</strong>
                          <small>Retornar à sua conta Google</small>
                        </span>
                        <span className="switch-arrow" aria-hidden="true">
                          ➜
                        </span>
                      </button>
                    ) : (
                      <p className="account-menu-hint">
                        Entre com Google pela tela inicial para vincular sua conta.
                      </p>
                    )}
                  </div>
                  <div className="account-menu-footer">
                    <button type="button" onClick={() => act(onLogout)}>
                      🚪{' '}
                      {usuario.tipo === 'google'
                        ? 'Sair da Conta Google'
                        : 'Sair do Modo Visitante'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
