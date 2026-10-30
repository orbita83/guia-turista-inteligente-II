import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

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
    geometria: [
      [-8.05, -34.88],
      [-12.97, -38.5],
    ],
  },
  dicas_destino: 'Dicas sobre Salvador',
};

describe('TripNavigationTabs (Issue #11: Abas e Ações da Viagem)', () => {
  afterEach(() => vi.restoreAllMocks());

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

  it('permite navegar entre abas com setas e mantém associação aos painéis', async () => {
    const user = userEvent.setup();
    const onAbaChange = vi.fn();
    render(
      <TripNavigationTabs viagem={MOCK_VIAGEM} abaAtiva="visao-geral" onAbaChange={onAbaChange} />,
    );
    const overview = screen.getByRole('tab', { name: /Visão Geral/i });
    overview.focus();
    await user.keyboard('{ArrowRight}');
    expect(onAbaChange).toHaveBeenCalledWith('mapa');
    expect(screen.getByRole('tab', { name: /Mapa & Paradas/i })).toHaveFocus();
    expect(overview).toHaveAttribute('aria-controls', 'panel-mapa panel-guia');
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
    expect(screen.getByRole('status')).toHaveTextContent('Arquivo GPX preparado');
  });

  it('informa falha quando o download GPX não conclui', async () => {
    const user = userEvent.setup();
    render(
      <TripNavigationTabs
        viagem={MOCK_VIAGEM}
        abaAtiva="mapa"
        onAbaChange={vi.fn()}
        onGpxDownload={() => {
          throw new Error('falha');
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Baixar GPX/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível exportar');
  });

  it('impede exportar GPX quando a viagem não tem geometria', () => {
    render(
      <TripNavigationTabs
        viagem={{ ...MOCK_VIAGEM, percurso: { distancia: '800 km', tempo: '11h 20min' } }}
        abaAtiva="mapa"
        onAbaChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Baixar GPX/i })).toBeDisabled();
  });
});

describe('TripNavigationTabs: download GPX e falha', () => {
  afterEach(() => vi.restoreAllMocks());

  const viagemComGeometria: Viagem = {
    ...MOCK_VIAGEM,
    percurso: {
      ...MOCK_VIAGEM.percurso,
      geometria: [
        [-8.0476, -34.877],
        [-7.9986, -34.8459],
      ],
    },
  };

  it('aciona o download GPX local pelo botão e remove os recursos temporários', async () => {
    const user = userEvent.setup();
    const criar = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:viagem');
    const revogar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let arquivo = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      arquivo = this.download;
    });
    render(
      <TripNavigationTabs viagem={viagemComGeometria} abaAtiva="mapa" onAbaChange={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: /Baixar GPX/i }));
    expect(criar.mock.calls[0][0]).toBeInstanceOf(Blob);
    const xml = new DOMParser().parseFromString(
      await (criar.mock.calls[0][0] as Blob).text(),
      'application/xml',
    );
    expect(
      Array.from(xml.querySelectorAll('trkpt'), (ponto) => [
        ponto.getAttribute('lat'),
        ponto.getAttribute('lon'),
      ]),
    ).toEqual([
      ['-8.0476', '-34.877'],
      ['-7.9986', '-34.8459'],
    ]);
    expect(arquivo).toBe('rota-recife-pe-para-salvador-ba.gpx');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revogar).toHaveBeenCalledWith('blob:viagem');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('apresenta um erro de download sem derrubar a navegação', async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('Download indisponível');
    });
    render(
      <TripNavigationTabs viagem={viagemComGeometria} abaAtiva="mapa" onAbaChange={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: /Baixar GPX/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível exportar o GPX');
    expect(screen.getByRole('tab', { name: /Mapa & Paradas/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('recusa exportação local sem geometria em vez de baixar o trajeto simulado', async () => {
    const criar = vi.spyOn(URL, 'createObjectURL');
    render(
      <TripNavigationTabs
        viagem={{ ...MOCK_VIAGEM, percurso: { distancia: '800 km', tempo: '11h' } }}
        abaAtiva="mapa"
        onAbaChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Baixar GPX/i })).toBeDisabled();
    expect(criar).not.toHaveBeenCalled();
  });

  it('recusa geometria inválida antes de criar arquivo para download', async () => {
    const criar = vi.spyOn(URL, 'createObjectURL');
    const viagemInvalida: Viagem = {
      ...viagemComGeometria,
      percurso: {
        ...viagemComGeometria.percurso,
        geometria: [
          [NaN, -34],
          [-8, -35],
        ],
      },
    };
    render(<TripNavigationTabs viagem={viagemInvalida} abaAtiva="mapa" onAbaChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Baixar GPX/i })).toBeDisabled();
    expect(criar).not.toHaveBeenCalled();
  });
});
