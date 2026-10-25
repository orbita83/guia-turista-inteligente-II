import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { ViagemCard } from './HistoricoViagens';

const viagem = {
  id: 'viagem-1',
  origem: 'São Paulo - SP',
  destino: 'Rio de Janeiro - RJ',
  clima: { temperatura: '25 °C', umidade: '70%', vento: '12 km/h' },
  percurso: { distancia: '430 km', tempo: '6 h' },
  dicas_destino: 'Praias, museus e culinária local.',
};

describe('ViagemCard', () => {
  it('expande o guia ao clicar no cartão e mantém o accordion acessível', () => {
    const { container } = render(<ViagemCard viagem={viagem} onDelete={vi.fn()} />);

    const details = document.getElementById('detalhes-viagem-1');
    expect(details).toHaveClass('hidden');

    fireEvent.click(container.querySelector('.tele-badge')!);
    expect(details).not.toHaveClass('hidden');
    expect(screen.getByRole('button', { name: /São Paulo - SP/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('não alterna o accordion ao clicar em ações ou no texto do guia', () => {
    const onDelete = vi.fn();
    render(<ViagemCard viagem={viagem} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /São Paulo - SP/ }));
    fireEvent.click(screen.getByText('Praias, museus e culinária local.'));
    expect(screen.getByRole('button', { name: /São Paulo - SP/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(onDelete).toHaveBeenCalledWith('viagem-1');
    expect(screen.getByRole('button', { name: /São Paulo - SP/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
