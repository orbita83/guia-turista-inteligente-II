import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { RoteiroFormData } from '../types/domain';
import { ApiError } from '../services/api';
import { RoteiroForm } from './RoteiroForm';

describe('RoteiroForm', () => {
  it('sincroniza UF de município inequívoco e mantém escolha para homônimos', () => {
    render(
      <RoteiroForm
        ufs={['PE', 'SP', 'RJ']}
        isSubmitting={false}
        onSubmit={vi.fn()}
        municipios={[
          { nome: 'Recife', uf: 'PE' },
          { nome: 'Bom Jesus', uf: 'SP' },
          { nome: 'Bom Jesus', uf: 'RJ' },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Cidade de origem'), { target: { value: 'Recife' } });
    expect(screen.getByLabelText('UF de origem')).toHaveValue('PE');
    fireEvent.change(screen.getByLabelText('Cidade de origem'), { target: { value: 'Bom Jesus' } });
    expect(screen.getByLabelText('UF de origem')).toHaveValue('PE');
  });
  it('alterna para parâmetros elétricos e envia toda a parametrização', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(data: RoteiroFormData) => void>();
    render(<RoteiroForm ufs={['PE', 'PI']} isSubmitting={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Cidade de origem'), 'Recife');
    await user.selectOptions(screen.getByLabelText('UF de origem'), 'PE');
    await user.type(screen.getByLabelText('Cidade de destino'), 'Olinda');
    await user.selectOptions(screen.getByLabelText('UF de destino'), 'PE');
    await user.click(screen.getByRole('button', { name: /100% Elétrico/i }));
    await user.click(screen.getByText(/Personalizar parâmetros/i));
    await user.clear(screen.getByLabelText('Eficiência energética'));
    await user.type(screen.getByLabelText('Eficiência energética'), '7.2');
    await user.click(screen.getByRole('button', { name: 'Econômico' }));
    await user.click(screen.getByRole('button', { name: /3 dias/i }));
    await user.click(screen.getByRole('button', { name: /Planejar viagem/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        propulsao: 'eletrico',
        eficiencia_km_kwh: 7.2,
        duracao_dias: 3,
        perfis: ['economico'],
      }),
    );
  });

  it('bloqueia imediatamente submissões concorrentes idênticas', async () => {
    const user = userEvent.setup();
    let resolver!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolver = resolve;
    });
    const onSubmit = vi.fn(() => pending);
    render(<RoteiroForm ufs={['PE']} isSubmitting={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Cidade de origem'), 'Recife');
    await user.selectOptions(screen.getByLabelText('UF de origem'), 'PE');
    await user.type(screen.getByLabelText('Cidade de destino'), 'Olinda');
    await user.selectOptions(screen.getByLabelText('UF de destino'), 'PE');
    await user.click(screen.getByRole('button', { name: /Cultural/i }));
    const submit = screen.getByRole('button', { name: /Planejar viagem/i });

    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolver();
  });

  it('associa erro 422 ao campo de origem', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new ApiError('HTTP 422', 422, { origem_cidade: 'Cidade não encontrada' });
    });
    render(<RoteiroForm ufs={['PE']} isSubmitting={false} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Cidade de origem'), 'Recife');
    await user.selectOptions(screen.getByLabelText('UF de origem'), 'PE');
    await user.type(screen.getByLabelText('Cidade de destino'), 'Olinda');
    await user.selectOptions(screen.getByLabelText('UF de destino'), 'PE');
    await user.click(screen.getByRole('button', { name: /Cultural/i }));
    await user.click(screen.getByRole('button', { name: /Planejar viagem/i }));
    expect(await screen.findByText('Cidade não encontrada')).toBeInTheDocument();
    expect(screen.getByLabelText('Cidade de origem')).toHaveAttribute('aria-invalid', 'true');
  });

  it('associa erro 422 a um campo numérico', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {
      throw new ApiError('HTTP 422', 422, { consumo_km_l: 'Consumo inválido' });
    });
    render(<RoteiroForm ufs={['PE']} isSubmitting={false} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Cidade de origem'), 'Recife');
    await user.selectOptions(screen.getByLabelText('UF de origem'), 'PE');
    await user.type(screen.getByLabelText('Cidade de destino'), 'Olinda');
    await user.selectOptions(screen.getByLabelText('UF de destino'), 'PE');
    await user.click(screen.getByRole('button', { name: /Cultural/i }));
    await user.click(screen.getByRole('button', { name: /Planejar viagem/i }));
    expect(await screen.findByText('Consumo inválido')).toBeInTheDocument();
    expect(screen.getByLabelText('Consumo médio')).toHaveAttribute('aria-invalid', 'true');
  });

  it('impede envio com consumo vazio ou preço zero', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RoteiroForm ufs={['PE']} isSubmitting={false} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Cidade de origem'), 'Recife');
    await user.selectOptions(screen.getByLabelText('UF de origem'), 'PE');
    await user.type(screen.getByLabelText('Cidade de destino'), 'Olinda');
    await user.selectOptions(screen.getByLabelText('UF de destino'), 'PE');
    await user.click(screen.getByRole('button', { name: /Cultural/i }));
    await user.click(screen.getByText(/Personalizar parâmetros/i));
    await user.clear(screen.getByLabelText('Consumo médio'));
    await user.clear(screen.getByLabelText('Preço por litro'));
    await user.type(screen.getByLabelText('Preço por litro'), '0');
    await user.click(screen.getByRole('button', { name: /Planejar viagem/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Consumo médio')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Preço por litro')).toHaveAttribute('aria-invalid', 'true');
  });

  it('valida capacidade elétrica e ignora parâmetros de combustão inativos', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RoteiroForm ufs={['PE']} isSubmitting={false} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Cidade de origem'), 'Recife');
    await user.selectOptions(screen.getByLabelText('UF de origem'), 'PE');
    await user.type(screen.getByLabelText('Cidade de destino'), 'Olinda');
    await user.selectOptions(screen.getByLabelText('UF de destino'), 'PE');
    await user.click(screen.getByRole('button', { name: /Cultural/i }));
    await user.click(screen.getByRole('button', { name: /100% Elétrico/i }));
    await user.click(screen.getByText(/Personalizar parâmetros/i));
    await user.clear(screen.getByLabelText('Capacidade da bateria'));
    await user.click(screen.getByRole('button', { name: /Planejar viagem/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Capacidade da bateria')).toHaveAttribute('aria-invalid', 'true');
  });

  it('mantém o planejamento manual e informa integrações indisponíveis por padrão', () => {
    render(<RoteiroForm ufs={['PE']} isSubmitting={false} onSubmit={vi.fn()} />);

    expect(screen.getByText(/Catálogo nacional:.*Inacessível/i)).toBeInTheDocument();
    expect(screen.getByText(/Sugestões: Inacessível/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Usar minha localização/i })).toBeDisabled();
    expect(screen.getByLabelText('Cidade de destino')).toBeEnabled();
  });

  it('consome sugestões e callback fornecidos pela futura integração', async () => {
    const user = userEvent.setup();
    const onRequestSuggestions = vi.fn();
    render(
      <RoteiroForm
        ufs={['CE', 'PI']}
        isSubmitting={false}
        municipios={[
          { nome: 'Piripiri', uf: 'PI' },
          { nome: 'Juazeiro do Norte', uf: 'CE' },
        ]}
        sugestoes={[{ nome: 'Juazeiro do Norte', uf: 'CE', distanciaKm: 425 }]}
        suggestionStatus="available"
        onRequestSuggestions={onRequestSuggestions}
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Usar minha localização/i }));
    expect(onRequestSuggestions).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: /Juazeiro do Norte.*425 km/i }));
    expect(screen.getByText('≈ 425 km em linha reta')).toBeInTheDocument();
    expect(screen.getByLabelText('Cidade de destino')).toHaveValue('Juazeiro do Norte');
    expect(screen.getByLabelText('UF de destino')).toHaveValue('CE');
    expect(screen.getByRole('button', { name: /Juazeiro do Norte.*425 km/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('apresenta estado de carregamento durante a busca por GPS e Haversine', () => {
    render(
      <RoteiroForm
        ufs={['CE']}
        isSubmitting={false}
        suggestionStatus="loading"
        onRequestSuggestions={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Localizando…/i })).toBeDisabled();
    expect(
      screen.getByText(/Buscando sua localização GPS e calculando destinos pelo Haversine…/i),
    ).toBeInTheDocument();
  });

  it('exibe texto informativo e habilita o botão de GPS no estado idle', () => {
    render(
      <RoteiroForm
        ufs={['CE']}
        isSubmitting={false}
        suggestionStatus="idle"
        onRequestSuggestions={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Usar minha localização/i })).toBeEnabled();
    expect(
      screen.getByText(/Ative quando quiser receber recomendações a partir do seu GPS/i),
    ).toBeInTheDocument();
  });
});
