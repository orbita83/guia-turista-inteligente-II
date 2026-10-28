import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { Viagem } from '../types/domain';
import { TripNavigationTabs } from './TripNavigationTabs';

const MOCK_VIAGEM: Viagem = {
  id: 'viagem-1',
  origem: 'Recife - PE',
  destino: 'Salvador - BA',
  clima: {
    temperatura: '28 °C',
    umidade: '75%',
    vento: '12 km/h',
  },
  percurso: {
    distancia: '800 km',
    tempo: '11h 20min',
  },
  dicas_destino: 'Dicas sobre Salvador',
};

describe('TripNavigationTabs (Issue #11: Abas e Ações da Viagem)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza as 3 abas de navegação com destaque na aba ativa', () => {
    const onAbaChange = vi.fn();
    render(
      <TripNavigationTabs viagem={MOCK_VIAGEM} abaAtiva="visao-geral" onAbaChange={onAbaChange} />,
    );

    const tabVisaoGeral = screen.getByRole('tab', { name: /Visão Geral/i });
    const tabMapa = screen.getByRole('tab', { name: /Mapa & Paradas/i });
    const tabGuia = screen.getByRole('tab', { name: /Guia & Clima/i });

    expect(tabVisaoGeral).toBeInTheDocument();
    expect(tabMapa).toBeInTheDocument();
    expect(tabGuia).toBeInTheDocument();

    expect(tabVisaoGeral).toHaveAttribute('aria-selected', 'true');
    expect(tabMapa).toHaveAttribute('aria-selected', 'false');
    expect(tabGuia).toHaveAttribute('aria-selected', 'false');
  });

  it('permite alternar de aba disparando onAbaChange', async () => {
    const user = userEvent.setup();
    const onAbaChange = vi.fn();
    render(
      <TripNavigationTabs viagem={MOCK_VIAGEM} abaAtiva="visao-geral" onAbaChange={onAbaChange} />,
    );

    const tabMapa = screen.getByRole('tab', { name: /Mapa & Paradas/i });
    await user.click(tabMapa);

    expect(onAbaChange).toHaveBeenCalledWith('mapa');
  });

  it('apresenta a linha de ações com links externos corretos e botões funcionais', async () => {
    const user = userEvent.setup();
    const onExcluir = vi.fn();
    const onGpxDownload = vi.fn();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <TripNavigationTabs
        viagem={MOCK_VIAGEM}
        abaAtiva="mapa"
        onAbaChange={vi.fn()}
        onExcluir={onExcluir}
        onGpxDownload={onGpxDownload}
      />,
    );

    // Link para Google Maps
    const linkMaps = screen.getByRole('link', { name: /Abrir no Maps/i });
    expect(linkMaps).toHaveAttribute(
      'href',
      expect.stringContaining('https://www.google.com/maps/dir/'),
    );
    expect(linkMaps).toHaveAttribute('target', '_blank');

    // Link para WhatsApp
    const linkWpp = screen.getByRole('link', { name: /WhatsApp/i });
    expect(linkWpp).toHaveAttribute(
      'href',
      expect.stringContaining('https://api.whatsapp.com/send?text='),
    );
    expect(linkWpp).toHaveAttribute('target', '_blank');

    // Ação Imprimir
    const btnPrint = screen.getByRole('button', { name: /Imprimir/i });
    await user.click(btnPrint);
    expect(printSpy).toHaveBeenCalled();

    // Ação Excluir
    const btnDelete = screen.getByRole('button', { name: /Excluir/i });
    await user.click(btnDelete);
    expect(onExcluir).toHaveBeenCalled();

    // Ação Baixar GPX
    const btnGpx = screen.getByRole('button', { name: /Baixar GPX/i });
    await user.click(btnGpx);
    expect(onGpxDownload).toHaveBeenCalled();
  });
});
