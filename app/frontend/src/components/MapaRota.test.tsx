import { fireEvent, render, screen } from '@testing-library/react';
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

describe('MapaRota', () => {
  it('renderiza o cabeçalho e os 5 badges métricos da rota', () => {
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    expect(screen.getByRole('heading', { name: 'Rota e Autonomia' })).toBeInTheDocument();
    expect(screen.getByText(/Recife - PE ➔ Salvador - BA/)).toBeInTheDocument();

    // Badges métricos
    expect(screen.getByText('Distância')).toBeInTheDocument();
    expect(screen.getByText('800 km')).toBeInTheDocument();

    expect(screen.getByText('Tempo')).toBeInTheDocument();
    expect(screen.getByText('Pedágios')).toBeInTheDocument();
    expect(screen.getByText('Autonomia')).toBeInTheDocument();
    expect(screen.getByText('Desnível')).toBeInTheDocument();
  });

  it('permite alternar entre rota principal e alternativa econômica com recálculo atômico', async () => {
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

  it('exibe paradas estratégicas antes do limite crítico de 18% para rotas longas', () => {
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    // Com 800 km e autonomia de 500 km (10 km/l * 50l), deve haver paradas estratégicas
    expect(screen.getByText(/Paradas estratégicas recomendadas/i)).toBeInTheDocument();
    expect(screen.getByText(/Parada 1/i)).toBeInTheDocument();
  });

  it('renderiza o perfil de topografia e relevo expansível', () => {
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    expect(screen.getByText(/Topografia e Relevo da Rodovia/i)).toBeInTheDocument();
    expect(screen.getByText('Altitude Máxima')).toBeInTheDocument();
    expect(screen.getByText(/penalização no consumo nominal/i)).toBeInTheDocument();
  });

  it('recalcula a cota individual na calculadora de rateio entre passageiros (1 a 8)', async () => {
    const user = userEvent.setup();
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    expect(screen.getByText('💰 Previsão de Custos e Rateio')).toBeInTheDocument();

    // Clica no botão de 4 passageiros
    const btn4 = screen.getByRole('radio', { name: '4' });
    await user.click(btn4);
    expect(btn4).toHaveAttribute('aria-checked', 'true');

    // Confirma que a cota individual indica 4 pessoas
    expect(screen.getByText(/Cota individual \(4 pessoas\)/i)).toBeInTheDocument();
  });

  it('oferece ações rápidas com links externos e gatilho de download GPX', () => {
    render(<MapaRota viagem={VIAGEM_MOCK} formParams={FORM_COMBUSTAO_MOCK} />);

    const linkGmaps = screen.getByRole('link', { name: /Abrir no Google Maps/i });
    expect(linkGmaps).toHaveAttribute(
      'href',
      expect.stringContaining('https://www.google.com/maps/dir/'),
    );

    const linkWhatsapp = screen.getByRole('link', { name: /Compartilhar no WhatsApp/i });
    expect(linkWhatsapp).toHaveAttribute(
      'href',
      expect.stringContaining('https://api.whatsapp.com/send?text='),
    );

    const btnGpx = screen.getByRole('button', { name: /Baixar GPX 1.1/i });
    expect(btnGpx).toBeInTheDocument();

    // Disparo do download sem erro
    fireEvent.click(btnGpx);
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
