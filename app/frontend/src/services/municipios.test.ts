import { describe, expect, it, vi } from 'vite-plus/test';

import { carregarMunicipios } from './municipios';

describe('carregarMunicipios', () => {
  it('valida e normaliza municípios e suas UFs do catálogo do IBGE', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            nome: ' Recife ',
            microrregiao: { mesorregiao: { UF: { sigla: 'PE' } } },
          },
          { nome: 'Sem UF' },
          { nome: '', microrregiao: { mesorregiao: { UF: { sigla: 'PE' } } } },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(carregarMunicipios()).resolves.toEqual([{ nome: 'Recife', uf: 'PE' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    fetchMock.mockRestore();
  });

  it('rejeita HTTP ou payload inválidos', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(carregarMunicipios()).rejects.toThrow('HTTP 503');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ municipios: [] }), { status: 200 }),
    );
    await expect(carregarMunicipios()).rejects.toThrow('formato inválido');
    fetchMock.mockRestore();
  });
});
