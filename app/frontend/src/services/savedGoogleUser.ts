import type { Usuario } from '../types/domain';

export const SAVED_GOOGLE_USER_KEY = 'guia_turista_saved_google_user';

function isGoogleUser(value: unknown): value is Usuario {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return (
    user.tipo === 'google' &&
    typeof user.id === 'string' &&
    user.id.length > 0 &&
    typeof user.nome === 'string' &&
    typeof user.email === 'string' &&
    typeof user.foto === 'string'
  );
}

export function readSavedGoogleUser(): Usuario | null {
  try {
    const raw = localStorage.getItem(SAVED_GOOGLE_USER_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isGoogleUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGoogleUser(user: Usuario): void {
  if (user.tipo !== 'google') return;
  try {
    localStorage.setItem(SAVED_GOOGLE_USER_KEY, JSON.stringify(user));
  } catch {
    // A sessão continua utilizável quando o armazenamento local está indisponível.
  }
}

export function clearSavedGoogleUser(): void {
  try {
    localStorage.removeItem(SAVED_GOOGLE_USER_KEY);
  } catch {
    // O logout no backend ainda encerra a sessão ativa.
  }
}
