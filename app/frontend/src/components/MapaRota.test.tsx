import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { RoteiroFormData, Viagem } from '../types/domain';
import { MapaRota } from './MapaRota';

const VIAGEM_MOCK: Viagem = {
  id: 'viagem-123',
  origem: 'Recife - PE',
  destino: 'Salvador - BA',
  clima: {
    temperatura: '27 °C',
    umidade: '72%',
    vento: '14 km/h',
  },
  percurso: {
    distancia: '800 km',
    tempo: '11h 20min',
  },
  dicas_destino: 'Visite o Pelourinho e o Farol da Barra.',
};

const FORM_COMBUSTAO_MOCK: RoteiroFormData = {
  origem_cidade: 'Recife',
  origem_uf: 'PE',
  destino_cidade: 'Salvador',
  destino_uf: 'BA',
  propulsao: 'combustao',
  consumo_km_l: 10,
  capacidade_tanque_l: 50,
  preco_combustivel_l: 6.0,
};

describe('MapaRota (Tópico 3.3 e Wireframe Oficial - Issues #12, #14, #15 e #16)', () => {
  it('renderiza o cabeçalho e os 6 cards métricos da rota conforme wireframe da seção 3.3', () => {
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    // Cabeçalho oficial do wireframe
    expect(screen.getByRole('heading', { name: /Mapa da Rota & Paradas/i })).toBeInTheDocument();
    expect(
      screen.getByText('Traçado rodoviário e paradas calculadas por autonomia.'),
    ).toBeInTheDocument();

    // 6 Cards Métricos do Wireframe
    expect(screen.getByText('DISTÂNCIA')).toBeInTheDocument();
    expect(screen.getAllByText(/800 km/).length).toBeGreaterThan(0);

    expect(screen.getByText('DURAÇÃO')).toBeInTheDocument();
    expect(screen.getByText('PARADAS')).toBeInTheDocument();
    expect(screen.getByText('AUTONOMIA')).toBeInTheDocument();
    expect(screen.getByText('SUGESTÃO DE ROTA')).toBeInTheDocument();
    expect(screen.getByText('TOPOGRAFIA')).toBeInTheDocument();
  });

  it('permite alternar entre propulsão combustão e elétrica com recálculo instantâneo', async () => {
    const user = userEvent.setup();
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    const btnCombustao = screen.getByRole('button', { name: /Combustão/i });
    const btnEletrico = screen.getByRole('button', { name: /Elétrico \(EV\)/i });

    expect(btnCombustao).toHaveAttribute('aria-pressed', 'true');
    expect(btnEletrico).toHaveAttribute('aria-pressed', 'false');

    // Alterna para EV
    await user.click(btnEletrico);
    expect(btnEletrico).toHaveAttribute('aria-pressed', 'true');
    expect(btnCombustao).toHaveAttribute('aria-pressed', 'false');

    // Card de custo passa a indicar elétrico
    expect(screen.getByText(/CUSTO TOTAL PREVISTO \(ELÉTRICO\)/i)).toBeInTheDocument();
  });

  it('permite alternar entre rota principal e alternativa econômica com recálculo atômico (Issue #14)', async () => {
    const user = userEvent.setup();
    const onRotaChange = vi.fn();
    render(
      <MapaRota
        viagem={VIAGEM_MOCK}
        formParams={FORM_COMBUSTAO_MOCK}
        onRotaChange={onRotaChange}
      />,
    );

    // Inicialmente a Sugestão 01 (Principal) está ativa
    const tabPrincipal = screen.getByRole('tab', { name: /Sugestão 01/i });
    const tabEconomica = screen.getByRole('tab', { name: /Sugestão 02/i });
    expect(tabPrincipal).toHaveAttribute('aria-selected', 'true');
    expect(tabEconomica).toHaveAttribute('aria-selected', 'false');

    // Alterna para a rota econômica
    await user.click(tabEconomica);

    expect(tabEconomica).toHaveAttribute('aria-selected', 'true');
    expect(tabPrincipal).toHaveAttribute('aria-selected', 'false');

    // A rota econômica possui distância diferente (~864 km)
    expect(screen.getByText('864 km')).toBeInTheDocument();
  });

  it('exibe painel de sugestões de trajeto rodoviário detalhado com badge de exibição (Issue #14)', async () => {
    const user = userEvent.setup();
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    expect(
      screen.getByText(/Sugestões de Trajeto Rodoviário \(2 opções disponíveis\)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sugestão 01 selecionada: trajeto principal mais ágil/i),
    ).toBeInTheDocument();

    const badgesExibicao = screen.getAllByText(/Em exibição/i);
    expect(badgesExibicao.length).toBeGreaterThan(0);

    // Clica na linha da Sugestão 02 na lista
    const rowSugestao02 = screen.getByRole('option', { name: /Sugestão 02/i });
    await user.click(rowSugestao02);

    expect(rowSugestao02).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Sugestão 02 selecionada:/i)).toBeInTheDocument();
  });

  it('exibe paradas estratégicas antes do limite crítico de 18% para rotas longas (Issue #15)', () => {
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    // Com 800 km e autonomia de 500 km (10 km/l * 50l), deve haver paradas estratégicas
    expect(screen.getByText(/Paradas estratégicas recomendadas/i)).toBeInTheDocument();
    expect(screen.getByText(/Parada 1/i)).toBeInTheDocument();
  });

  it('renderiza o perfil de topografia e relevo com cota e acréscimo de consumo (Issue #16)', async () => {
    const user = userEvent.setup();
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    expect(screen.getByText(/Topografia & Relevo da Rota/i)).toBeInTheDocument();
    expect(screen.getByText(/Altitude Máxima/i)).toBeInTheDocument();
    expect(screen.getByText(/penalização no consumo nominal/i)).toBeInTheDocument();

    // Toggle ocultar/ver perfil
    const btnTogglePerfil = screen.getByRole('button', { name: /Ocultar perfil ▴/i });
    await user.click(btnTogglePerfil);
    expect(screen.getByRole('button', { name: /Ver perfil ▾/i })).toBeInTheDocument();
  });

  it('recalcula a cota individual na calculadora de rateio entre passageiros (1 a 8) (Issue #16)', async () => {
    const user = userEvent.setup();
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    expect(screen.getByText('Divisão de Custos entre Passageiros')).toBeInTheDocument();

    // Abre o painel de ajuste
    const btnAjustar = screen.getByRole('button', { name: /Ajustar ▾/i });
    await user.click(btnAjustar);

    // Clica no botão de 4 passageiros
    const btn4 = screen.getByRole('radio', { name: '4' });
    await user.click(btn4);
    expect(btn4).toHaveAttribute('aria-checked', 'true');

    // Confirma que a cota individual indica 4 pessoas
    expect(screen.getByText(/Cota individual \(4 pessoas\)/i)).toBeInTheDocument();
  });

  it('não duplica ações no rodapé do mapa após centralização nas abas superiores (Issue #11)', () => {
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    // As ações foram migradas para o TripNavigationTabs logo abaixo de "Planejar Viagem"
    expect(screen.queryByRole('link', { name: /Abrir no Google Maps/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Compartilhar no WhatsApp/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Baixar GPX 1.1/i })).not.toBeInTheDocument();
  });

  it('fornece alternativa textual acessível para leitores de tela', () => {
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    const regiaoAcessivel = screen.getByRole('region', {
      name: /Descrição textual acessível da rota e paradas/i,
    });
    expect(regiaoAcessivel).toBeInTheDocument();
    expect(regiaoAcessivel).toHaveTextContent(/Recife - PE até Salvador - BA/);
  });
});
