import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import { HistoricoViagens, ViagemCard } from './HistoricoViagens';

const viagem = {
  id: 'viagem-1',
  origem: 'São Paulo - SP',
  destino: 'Rio de Janeiro - RJ',
  clima: { temperatura: '25 °C', umidade: '70%', vento: '12 km/h' },
  percurso: { distancia: '430 km', tempo: '6 h' },
  dicas_destino: 'Praias, museus e culinária local.',
};

describe('ViagemCard', () => {
  it('apresenta o resumo compacto do wireframe e uma exclusão acessível', () => {
    render(<ViagemCard viagem={viagem} onDelete={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: /São Paulo - SP.*Rio de Janeiro - RJ/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('6 h')).toBeInTheDocument();
    expect(screen.getByText('25 °C')).toBeInTheDocument();
    expect(screen.getByText('430 km')).toBeInTheDocument();
    expect(screen.queryByText('Praias, museus e culinária local.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Maps/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Excluir viagem de São Paulo - SP para Rio de Janeiro - RJ',
      }),
    ).toBeEnabled();
  });

  it('explica por campo que os dados ainda não chegaram e preserva os demais', () => {
    render(
      <ViagemCard
        viagem={{
          ...viagem,
          clima: { ...viagem.clima, temperatura: 'Aguardando dados' },
          percurso: { distancia: 'Aguardando dados', tempo: '2 h' },
        }}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('2 h')).toBeInTheDocument();
    expect(screen.getAllByText('Aguardando dados')).toHaveLength(2);
  });

  it('bloqueia repetição somente no card em exclusão', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<ViagemCard viagem={viagem} deleting onDelete={onDelete} />);

    const button = screen.getByRole('button', { name: /Excluindo viagem/ });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('HistoricoViagens', () => {
  it('apresenta orientação no estado vazio', () => {
    render(<HistoricoViagens viagens={[]} status="ready" onDelete={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Viagens Salvas' })).toBeInTheDocument();
    expect(screen.getByText(/Planeje sua primeira viagem/)).toBeInTheDocument();
  });

  it('distingue carregamento de histórico vazio', () => {
    render(<HistoricoViagens viagens={[]} status="loading" onDelete={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Carregando viagens salvas');
    expect(screen.queryByText(/Planeje sua primeira viagem/)).not.toBeInTheDocument();
  });

  it('mantém cards confirmados ao comunicar erro recuperável', () => {
    render(
      <HistoricoViagens
        viagens={[viagem]}
        status="error"
        errorMessage="Não foi possível atualizar o histórico."
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível atualizar o histórico.');
    expect(screen.getByText('430 km')).toBeInTheDocument();
  });

  it('comunica persistência pendente e confirmação indisponível sem duplicar cards', () => {
    const { rerender } = render(
      <HistoricoViagens
        viagens={[viagem]}
        status="ready"
        persistenceById={{ 'viagem-1': 'pending' }}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('Salvando viagem…')).toBeInTheDocument();

    rerender(
      <HistoricoViagens
        viagens={[viagem]}
        status="ready"
        persistenceById={{ 'viagem-1': 'unavailable' }}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('Ainda não foi possível confirmar')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });
});
