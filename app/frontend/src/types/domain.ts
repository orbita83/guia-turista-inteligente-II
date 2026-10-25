export type TipoUsuario = 'google' | 'visitante';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  foto: string;
  tipo: TipoUsuario;
}

export interface ClimaViagem {
  temperatura: string;
  umidade: string;
  vento: string;
}

export interface PercursoViagem {
  distancia: string;
  tempo: string;
}

export interface Viagem {
  id: string;
  criado_em?: string;
  origem: string;
  destino: string;
  clima: ClimaViagem;
  percurso: PercursoViagem;
  dicas_destino: string;
  diagnostico_ia?: Record<string, unknown>;
}

export interface RoteiroFormData {
  origem_cidade: string;
  origem_uf: string;
  destino_cidade: string;
  destino_uf: string;
}

export type TipoToast = 'erro' | 'error' | 'danger' | 'sucesso' | 'success' | 'info';

export interface ToastMessage {
  id: string;
  mensagem: string;
  tipo?: TipoToast;
  titulo?: string;
}
