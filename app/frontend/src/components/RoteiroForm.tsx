import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../services/api';

import type {
  MunicipioOption,
  PerfilViajante,
  RoteiroFormData,
  SugestaoDestino,
  SuggestionStatus,
  TipoPropulsao,
} from '../types/domain';

export type { SuggestionStatus };

const FORMULARIO_INICIAL: Required<RoteiroFormData> = {
  origem_cidade: '',
  origem_uf: '',
  destino_cidade: '',
  destino_uf: '',
  duracao_dias: 1,
  perfis: [],
  propulsao: 'combustao',
  consumo_km_l: 12,
  capacidade_tanque_l: 50,
  preco_combustivel_l: 6.19,
  eficiencia_km_kwh: 6,
  capacidade_bateria_kwh: 60,
  preco_energia_kwh: 0.95,
};

const PERFIS: readonly { valor: PerfilViajante; rotulo: string; icone: string }[] = [
  { valor: 'cultural', rotulo: 'Cultural', icone: '🏛️' },
  { valor: 'gastronomico', rotulo: 'Gastronômico', icone: '🍲' },
  { valor: 'ecoturismo-aventura', rotulo: 'Ecoturismo / Aventura', icone: '🌿' },
  { valor: 'familia', rotulo: 'Família', icone: '👨‍👩‍👧' },
  { valor: 'economico', rotulo: 'Econômico', icone: '🎒' },
];

type NumericFieldName =
  | 'consumo_km_l'
  | 'capacidade_tanque_l'
  | 'preco_combustivel_l'
  | 'eficiencia_km_kwh'
  | 'capacidade_bateria_kwh'
  | 'preco_energia_kwh';
type ErrosFormulario = Partial<
  Record<'origem' | 'destino' | 'perfis' | 'form' | NumericFieldName, string>
>;

export interface RoteiroFormProps {
  ufs: readonly string[];
  isSubmitting: boolean;
  municipios?: readonly MunicipioOption[];
  sugestoes?: readonly SugestaoDestino[];
  suggestionStatus?: SuggestionStatus;
  onRequestSuggestions?: () => void | Promise<void>;
  onSubmit: (data: RoteiroFormData) => void | Promise<void>;
}

function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function municipioCorresponde(
  catalogo: readonly MunicipioOption[],
  cidade: string,
  uf: string,
): boolean {
  return catalogo.some(
    (municipio) => municipio.uf === uf && normalizar(municipio.nome) === normalizar(cidade),
  );
}

export function RoteiroForm({
  ufs,
  isSubmitting,
  municipios = [],
  sugestoes = [],
  suggestionStatus = 'unavailable',
  onRequestSuggestions,
  onSubmit,
}: RoteiroFormProps) {
  const [formData, setFormData] = useState<Required<RoteiroFormData>>(FORMULARIO_INICIAL);
  const [erros, setErros] = useState<ErrosFormulario>({});
  const bloqueioSubmissao = useRef(false);
  const advancedParametersRef = useRef<HTMLDetailsElement | null>(null);
  const catalogoDisponivel = municipios.length > 0;

  useEffect(() => {
    if (!isSubmitting) bloqueioSubmissao.current = false;
  }, [isSubmitting]);

  useEffect(() => {
    const numericFields: NumericFieldName[] = [
      'consumo_km_l',
      'capacidade_tanque_l',
      'preco_combustivel_l',
      'eficiencia_km_kwh',
      'capacidade_bateria_kwh',
      'preco_energia_kwh',
    ];
    if (numericFields.some((field) => erros[field]) && advancedParametersRef.current) {
      advancedParametersRef.current.open = true;
    }
  }, [erros]);

  const municipiosOrigem = useMemo(
    () =>
      municipios.filter((municipio) => !formData.origem_uf || municipio.uf === formData.origem_uf),
    [formData.origem_uf, municipios],
  );
  const municipiosDestino = useMemo(
    () =>
      municipios.filter(
        (municipio) => !formData.destino_uf || municipio.uf === formData.destino_uf,
      ),
    [formData.destino_uf, municipios],
  );

  const atualizarTexto = (
    campo: 'origem_cidade' | 'origem_uf' | 'destino_cidade' | 'destino_uf',
    valor: string,
  ) => {
    // TODO(frontend): ao selecionar município inequívoco, sincronizar a UF correspondente;
    // preservar escolha explícita quando houver homônimos e não depender do geocoding pós-envio.
    setFormData((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({
      ...atuais,
      [campo.startsWith('origem') ? 'origem' : 'destino']: undefined,
    }));
  };

  const atualizarNumero = (campo: NumericFieldName, valor: string) => {
    setFormData((atual) => ({ ...atual, [campo]: valor.trim() ? Number(valor) : Number.NaN }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  };

  const alternarPerfil = (perfil: PerfilViajante) => {
    setFormData((atual) => ({
      ...atual,
      perfis: atual.perfis.includes(perfil)
        ? atual.perfis.filter((item) => item !== perfil)
        : [...atual.perfis, perfil],
    }));
    setErros((atuais) => ({ ...atuais, perfis: undefined }));
  };

  const selecionarSugestao = (sugestao: SugestaoDestino) => {
    setFormData((atual) => ({ ...atual, destino_cidade: sugestao.nome, destino_uf: sugestao.uf }));
    setErros((atuais) => ({ ...atuais, destino: undefined }));
  };

  const validar = (): ErrosFormulario => {
    const novosErros: ErrosFormulario = {};
    if (!/^[A-Z]{2}$/.test(formData.origem_uf)) {
      novosErros.origem = 'Selecione uma UF válida com 2 letras maiúsculas.';
    } else if (!formData.origem_cidade.trim()) {
      novosErros.origem = 'Informe o município de origem.';
    } else if (
      catalogoDisponivel &&
      !municipioCorresponde(municipios, formData.origem_cidade, formData.origem_uf)
    ) {
      novosErros.origem = 'Selecione um município brasileiro correspondente à UF informada.';
    }

    if (!/^[A-Z]{2}$/.test(formData.destino_uf)) {
      novosErros.destino = 'Selecione uma UF válida com 2 letras maiúsculas.';
    } else if (!formData.destino_cidade.trim()) {
      novosErros.destino = 'Informe o município de destino.';
    } else if (
      catalogoDisponivel &&
      !municipioCorresponde(municipios, formData.destino_cidade, formData.destino_uf)
    ) {
      novosErros.destino = 'Selecione um município brasileiro correspondente à UF informada.';
    }
    if (formData.perfis.length === 0) novosErros.perfis = 'Selecione ao menos um perfil.';
    const activeFields: NumericFieldName[] =
      formData.propulsao === 'eletrico'
        ? ['eficiencia_km_kwh', 'capacidade_bateria_kwh', 'preco_energia_kwh']
        : ['consumo_km_l', 'capacidade_tanque_l', 'preco_combustivel_l'];
    for (const field of activeFields) {
      if (!Number.isFinite(formData[field]) || formData[field] <= 0) {
        novosErros[field] = 'Informe um número maior que zero.';
      }
    }
    return novosErros;
  };

  const submeter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (bloqueioSubmissao.current || isSubmitting) return;
    const novosErros = validar();
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    bloqueioSubmissao.current = true;
    try {
      const inactiveFields =
        formData.propulsao === 'eletrico'
          ? {
              consumo_km_l: undefined,
              capacidade_tanque_l: undefined,
              preco_combustivel_l: undefined,
            }
          : {
              eficiencia_km_kwh: undefined,
              capacidade_bateria_kwh: undefined,
              preco_energia_kwh: undefined,
            };
      await onSubmit({
        ...formData,
        ...inactiveFields,
        origem_cidade: formData.origem_cidade.trim(),
        destino_cidade: formData.destino_cidade.trim(),
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const fields = error.fieldErrors;
        setErros({
          ...(fields.origem_cidade || fields.origem_uf
            ? { origem: fields.origem_cidade ?? fields.origem_uf }
            : {}),
          ...(fields.destino_cidade || fields.destino_uf
            ? { destino: fields.destino_cidade ?? fields.destino_uf }
            : {}),
          ...(fields.perfis ? { perfis: fields.perfis } : {}),
          ...Object.fromEntries(
            (
              [
                'consumo_km_l',
                'capacidade_tanque_l',
                'preco_combustivel_l',
                'eficiencia_km_kwh',
                'capacidade_bateria_kwh',
                'preco_energia_kwh',
              ] as const
            )
              .filter((field) => fields[field])
              .map((field) => [field, fields[field]]),
          ),
          ...(!Object.keys(fields).length
            ? { form: 'Verifique os dados informados e tente novamente.' }
            : {}),
        });
      }
    } finally {
      bloqueioSubmissao.current = false;
    }
  };

  const selecionarPropulsao = (propulsao: TipoPropulsao) =>
    setFormData((atual) => ({ ...atual, propulsao }));

  return (
    <section className="card planner-card" aria-labelledby="roteiro-form-title">
      <header className="planner-heading">
        <span className="planner-heading-icon" aria-hidden="true">
          🗺️
        </span>
        <div>
          <h2 id="roteiro-form-title">Planejador de Viagens</h2>
          <p>Roteiro inteligente com mapa rodoviário, paradas e custos.</p>
        </div>
      </header>

      <form id="formCriarViagem" onSubmit={submeter} aria-busy={isSubmitting} noValidate>
        {erros.form && (
          <p role="alert" className="field-error">
            {erros.form}
          </p>
        )}
        <fieldset className="form-fieldset" disabled={isSubmitting}>
          <legend className="sr-only">Dados para planejar a viagem</legend>

          <div className="location-fields">
            <div className="city-field">
              <label className="form-label" htmlFor="origem_cidade">
                Cidade de origem
              </label>
              <input
                id="origem_cidade"
                name="origem_cidade"
                list="municipios-origem"
                placeholder="Ex.: Piripiri"
                value={formData.origem_cidade}
                onChange={(event) => atualizarTexto('origem_cidade', event.currentTarget.value)}
                aria-invalid={Boolean(erros.origem)}
                aria-describedby={erros.origem ? 'erro-origem' : undefined}
                autoComplete="address-level2"
                required
              />
              <datalist id="municipios-origem">
                {municipiosOrigem.map((municipio) => (
                  <option key={`${municipio.uf}-${municipio.nome}`} value={municipio.nome}>
                    {municipio.uf}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="uf-field">
              <label className="form-label" htmlFor="origem_uf">
                UF
              </label>
              <select
                id="origem_uf"
                name="origem_uf"
                aria-label="UF de origem"
                aria-invalid={Boolean(erros.origem)}
                aria-describedby={erros.origem ? 'erro-origem' : undefined}
                value={formData.origem_uf}
                onChange={(event) => atualizarTexto('origem_uf', event.currentTarget.value)}
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
          </div>
          {erros.origem ? (
            <p className="field-error" id="erro-origem">
              {erros.origem}
            </p>
          ) : null}

          <div className="location-fields">
            <div className="city-field">
              <label className="form-label" htmlFor="destino_cidade">
                Cidade de destino
              </label>
              <input
                id="destino_cidade"
                name="destino_cidade"
                list="municipios-destino"
                placeholder="Ex.: Juazeiro do Norte"
                value={formData.destino_cidade}
                onChange={(event) => atualizarTexto('destino_cidade', event.currentTarget.value)}
                aria-invalid={Boolean(erros.destino)}
                aria-describedby={erros.destino ? 'erro-destino' : undefined}
                autoComplete="address-level2"
                required
              />
              <datalist id="municipios-destino">
                {municipiosDestino.map((municipio) => (
                  <option key={`${municipio.uf}-${municipio.nome}`} value={municipio.nome}>
                    {municipio.uf}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="uf-field">
              <label className="form-label" htmlFor="destino_uf">
                UF
              </label>
              <select
                id="destino_uf"
                name="destino_uf"
                aria-label="UF de destino"
                aria-invalid={Boolean(erros.destino)}
                aria-describedby={erros.destino ? 'erro-destino' : undefined}
                value={formData.destino_uf}
                onChange={(event) => atualizarTexto('destino_uf', event.currentTarget.value)}
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
          </div>
          {erros.destino ? (
            <p className="field-error" id="erro-destino">
              {erros.destino}
            </p>
          ) : null}

          {/* TODO(frontend): mostrar o catálogo real quando houver fonte de municípios;
              a lista de UFs da sessão, sozinha, não preenche o datalist de cidades. */}
          <p
            className={`catalog-status${catalogoDisponivel ? '' : ' is-unavailable'}`}
            role="status"
          >
            Catálogo nacional: {catalogoDisponivel ? 'Disponível' : 'Inacessível'}
          </p>

          <section className="suggestions-block" aria-labelledby="suggestions-title">
            <div className="suggestions-heading">
              <div>
                <h3 id="suggestions-title">Sugestões acima de 400 km</h3>
                <p>
                  Quatro destinos acima de 400 km de distância geográfica aproximada, em linha reta.
                </p>
              </div>
              <button
                type="button"
                className="btn-location"
                onClick={onRequestSuggestions}
                disabled={!onRequestSuggestions || suggestionStatus === 'loading'}
              >
                {suggestionStatus === 'loading' ? 'Localizando…' : '⌖ Usar minha localização'}
              </button>
            </div>
            {/* TODO(frontend): validar no fluxo real as sugestões GPS e as distâncias geodésicas
                já calculadas pelo serviço local, incluindo permissão negada e erro de localização. */}
            {suggestionStatus === 'available' && sugestoes.length > 0 ? (
              <div className="suggestion-list">
                {sugestoes.map((sugestao) => {
                  const selecionada =
                    formData.destino_uf === sugestao.uf &&
                    normalizar(formData.destino_cidade) === normalizar(sugestao.nome);
                  return (
                    <button
                      key={`${sugestao.uf}-${sugestao.nome}`}
                      type="button"
                      className={`suggestion-chip${selecionada ? ' is-selected' : ''}`}
                      aria-pressed={selecionada}
                      onClick={() => selecionarSugestao(sugestao)}
                    >
                      <span>
                        📍 {sugestao.nome} ({sugestao.uf})
                      </span>
                      <strong>≈ {sugestao.distanciaKm} km em linha reta</strong>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="suggestions-empty" role="status">
                {suggestionStatus === 'loading'
                  ? 'Buscando sua localização GPS e calculando destinos pelo Haversine…'
                  : suggestionStatus === 'idle'
                    ? 'Ative quando quiser receber recomendações a partir do seu GPS.'
                    : 'Sugestões: Inacessível. O preenchimento manual continua disponível.'}
              </p>
            )}
          </section>

          <fieldset className="choice-group propulsion-group">
            <legend>Tipo de veículo</legend>
            <div className="propulsion-options">
              <button
                type="button"
                className={`propulsion-option${formData.propulsao === 'combustao' ? ' is-selected' : ''}`}
                aria-pressed={formData.propulsao === 'combustao'}
                onClick={() => selecionarPropulsao('combustao')}
              >
                <span className="propulsion-icon" aria-hidden="true">
                  ⛽
                </span>
                <span>
                  <strong>Combustão</strong>
                  <small>Gasolina, etanol ou diesel</small>
                </span>
              </button>
              <button
                type="button"
                className={`propulsion-option${formData.propulsao === 'eletrico' ? ' is-selected' : ''}`}
                aria-pressed={formData.propulsao === 'eletrico'}
                onClick={() => selecionarPropulsao('eletrico')}
              >
                <span className="propulsion-icon" aria-hidden="true">
                  ⚡
                </span>
                <span>
                  <strong>100% Elétrico</strong>
                  <small>Eletropostos e recarga</small>
                </span>
              </button>
            </div>
          </fieldset>

          <details className="advanced-parameters" ref={advancedParametersRef}>
            <summary>⚙️ Personalizar parâmetros de consumo e preço</summary>
            <div className="parameter-grid">
              {formData.propulsao === 'combustao' ? (
                <>
                  <NumericField
                    id="consumo_km_l"
                    error={erros.consumo_km_l}
                    label="Consumo médio"
                    unit="km/l"
                    value={formData.consumo_km_l}
                    onChange={(valor) => atualizarNumero('consumo_km_l', valor)}
                  />
                  <NumericField
                    id="capacidade_tanque_l"
                    error={erros.capacidade_tanque_l}
                    label="Reservatório"
                    unit="litros"
                    value={formData.capacidade_tanque_l}
                    onChange={(valor) => atualizarNumero('capacidade_tanque_l', valor)}
                  />
                  <NumericField
                    id="preco_combustivel_l"
                    error={erros.preco_combustivel_l}
                    label="Preço por litro"
                    unit="R$/l"
                    value={formData.preco_combustivel_l}
                    onChange={(valor) => atualizarNumero('preco_combustivel_l', valor)}
                    step="0.01"
                  />
                </>
              ) : (
                <>
                  <NumericField
                    id="eficiencia_km_kwh"
                    error={erros.eficiencia_km_kwh}
                    label="Eficiência energética"
                    unit="km/kWh"
                    value={formData.eficiencia_km_kwh}
                    onChange={(valor) => atualizarNumero('eficiencia_km_kwh', valor)}
                    step="0.1"
                  />
                  <NumericField
                    id="capacidade_bateria_kwh"
                    error={erros.capacidade_bateria_kwh}
                    label="Capacidade da bateria"
                    unit="kWh"
                    value={formData.capacidade_bateria_kwh}
                    onChange={(valor) => atualizarNumero('capacidade_bateria_kwh', valor)}
                  />
                  <NumericField
                    id="preco_energia_kwh"
                    error={erros.preco_energia_kwh}
                    label="Preço da energia"
                    unit="R$/kWh"
                    value={formData.preco_energia_kwh}
                    onChange={(valor) => atualizarNumero('preco_energia_kwh', valor)}
                    step="0.01"
                  />
                </>
              )}
            </div>
          </details>

          <div className="trip-preferences">
            <fieldset className="choice-group">
              <legend>Duração da viagem</legend>
              <div className="duration-options">
                {[1, 2, 3, 4, 5].map((dias) => (
                  <button
                    key={dias}
                    type="button"
                    className={formData.duracao_dias === dias ? 'is-selected' : ''}
                    aria-pressed={formData.duracao_dias === dias}
                    onClick={() => setFormData((atual) => ({ ...atual, duracao_dias: dias }))}
                  >
                    {dias} {dias === 1 ? 'dia' : 'dias'}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset
              className="choice-group profile-group"
              aria-describedby={erros.perfis ? 'erro-perfis' : undefined}
            >
              <legend>
                Perfil do viajante <span>(selecione um ou mais)</span>
              </legend>
              <div className="profile-options">
                {PERFIS.map((perfil) => {
                  const selecionado = formData.perfis.includes(perfil.valor);
                  return (
                    <button
                      key={perfil.valor}
                      type="button"
                      className={selecionado ? 'is-selected' : ''}
                      aria-pressed={selecionado}
                      onClick={() => alternarPerfil(perfil.valor)}
                    >
                      <span aria-hidden="true">{perfil.icone}</span> {perfil.rotulo}
                    </button>
                  );
                })}
              </div>
              {erros.perfis ? (
                <p className="field-error" id="erro-perfis">
                  {erros.perfis}
                </p>
              ) : null}
            </fieldset>
          </div>

          <button
            type="submit"
            id="btnGerarGuia"
            className={`btn btn-primary planner-submit${isSubmitting ? ' btn-loading' : ''}`}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="spinner-btn" aria-hidden="true" />
                Planejando viagem…
              </>
            ) : (
              '🚀 Planejar viagem'
            )}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

interface NumericFieldProps {
  id: string;
  error?: string;
  label: string;
  unit: string;
  value: number;
  step?: string;
  onChange: (value: string) => void;
}

function NumericField({ id, error, label, unit, value, step = '1', onChange }: NumericFieldProps) {
  return (
    <label className="numeric-field" htmlFor={id}>
      <span>{label}</span>
      <span className="numeric-control">
        <input
          id={id}
          name={id}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `erro-${id}` : undefined}
          type="number"
          min="0.01"
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => onChange(event.currentTarget.value)}
          required
        />
        <small>{unit}</small>
      </span>
      {error && (
        <span className="field-error" id={`erro-${id}`}>
          {error}
        </span>
      )}
    </label>
  );
}
