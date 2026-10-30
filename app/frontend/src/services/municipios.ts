import type { MunicipioOption } from '../types/domain';
import { buscarMunicipiosIbge } from './api';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseMunicipio(value: unknown): MunicipioOption | null {
  const municipio = record(value);
  const nome = municipio?.nome;
  const microrregiao = record(municipio?.microrregiao);
  const mesorregiao = record(microrregiao?.mesorregiao);
  const regiaoIntermediaria = record(municipio?.['regiao-imediata']);
  const regiaoIntermediariaPai = record(regiaoIntermediaria?.['regiao-intermediaria']);
  const uf = record(mesorregiao?.UF) ?? record(regiaoIntermediariaPai?.UF);
  const sigla = uf?.sigla;

  if (
    typeof nome !== 'string' ||
    !nome.trim() ||
    typeof sigla !== 'string' ||
    !/^[A-Z]{2}$/.test(sigla)
  ) {
    return null;
  }

  return { nome: nome.trim(), uf: sigla };
}

/** Carrega e valida o catálogo oficial de municípios publicado pelo IBGE. */
export async function carregarMunicipios(signal?: AbortSignal): Promise<MunicipioOption[]> {
  const payload = await buscarMunicipiosIbge(signal);
  if (!Array.isArray(payload)) throw new Error('O catálogo do IBGE retornou um formato inválido.');

  const municipios = payload
    .map(parseMunicipio)
    .filter((item): item is MunicipioOption => item !== null);
  if (municipios.length === 0) throw new Error('O catálogo do IBGE não contém municípios válidos.');

  return municipios;
}
