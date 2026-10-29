import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('oferece recuperação acessível após falha de renderização', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Content() {
      if (shouldThrow) throw new Error('falha interna');
      return <p>Conteúdo recuperado</p>;
    }
    render(
      <ErrorBoundary>
        <Content />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('falha inesperada');
    shouldThrow = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(screen.getByText('Conteúdo recuperado')).toBeInTheDocument();
  });
});
