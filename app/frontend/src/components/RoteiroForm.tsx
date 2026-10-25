import { useState, type FormEvent } from 'react';

import type { RoteiroFormData } from '../types/domain';

const FORMULARIO_VAZIO: RoteiroFormData = {
  origem_cidade: '',
  origem_uf: '',
  destino_cidade: '',
  destino_uf: '',
};

interface RoteiroFormProps {
  ufs: readonly string[];
  isSubmitting: boolean;
  onSubmit: (data: RoteiroFormData) => void | Promise<void>;
}

export function RoteiroForm({ ufs, isSubmitting, onSubmit }: RoteiroFormProps) {
  const [formData, setFormData] = useState<RoteiroFormData>(FORMULARIO_VAZIO);

  const atualizarCampo = (campo: keyof RoteiroFormData, valor: string) => {
    setFormData((atual) => ({ ...atual, [campo]: valor }));
  };

  const submeter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await onSubmit({
        origem_cidade: formData.origem_cidade.trim(),
        origem_uf: formData.origem_uf,
        destino_cidade: formData.destino_cidade.trim(),
        destino_uf: formData.destino_uf,
      });
      setFormData(FORMULARIO_VAZIO);
    } catch {
      // O estado e a mensagem de erro pertencem ao hook que executa a operação.
    }
  };

  return (
    <section className="card" aria-labelledby="roteiro-form-title">
      <h2 id="roteiro-form-title" className="form-title">
        🚗 Planejar Novo Roteiro
      </h2>

      <form id="formCriarViagem" onSubmit={submeter} aria-busy={isSubmitting}>
        <fieldset className="form-fieldset" disabled={isSubmitting}>
          <legend className="sr-only">Origem e destino da viagem</legend>

          <label className="form-label" htmlFor="origem_cidade">
            Origem:
          </label>
          <div className="form-row">
            <input
              type="text"
              id="origem_cidade"
              name="origem_cidade"
              placeholder="Cidade de Origem (ex: Recife)"
              value={formData.origem_cidade}
              onChange={(event) => atualizarCampo('origem_cidade', event.currentTarget.value)}
              autoComplete="address-level2"
              required
            />
            <label className="sr-only" htmlFor="origem_uf">
              UF de origem
            </label>
            <select
              id="origem_uf"
              name="origem_uf"
              value={formData.origem_uf}
              onChange={(event) => atualizarCampo('origem_uf', event.currentTarget.value)}
              required
            >
              <option value="">UF</option>
              {ufs.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>

          <label className="form-label" htmlFor="destino_cidade">
            Destino:
          </label>
          <div className="form-row">
            <input
              type="text"
              id="destino_cidade"
              name="destino_cidade"
              placeholder="Cidade de Destino (ex: Salvador)"
              value={formData.destino_cidade}
              onChange={(event) => atualizarCampo('destino_cidade', event.currentTarget.value)}
              autoComplete="address-level2"
              required
            />
            <label className="sr-only" htmlFor="destino_uf">
              UF de destino
            </label>
            <select
              id="destino_uf"
              name="destino_uf"
              value={formData.destino_uf}
              onChange={(event) => atualizarCampo('destino_uf', event.currentTarget.value)}
              required
            >
              <option value="">UF</option>
              {ufs.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            id="btnGerarGuia"
            className={`btn btn-primary${isSubmitting ? ' btn-loading' : ''}`}
          >
            {isSubmitting ? (
              <>
                <span className="spinner-btn" aria-hidden="true" />
                Consultando APIs e Gemini AI...
              </>
            ) : (
              'Gerar Guia com APIs & IA (Python)'
            )}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
