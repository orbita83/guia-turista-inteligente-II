import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Viagem } from '../types/domain';
import { RoteiroResult } from './RoteiroResult';

const mockViagem: Viagem = {
  id: 'viagem-recife-salvador',
  origem: 'Recife - PE',
  destino: 'Salvador - BA',
  clima: {
    temperatura: '29 °C',
    umidade: '75%',
    vento: '18 km/h',
    sensacao: '31 °C',
    condicao: 'Ensolarado',
  },
  percurso: {
    distancia: '800 km',
    tempo: '11h 30min',
  },
  dicas_destino:
    '📍 Pontos turísticos\nPelourinho e Farol da Barra com pôr do sol clássico.\n\n' +
    '🍽️ Culinária\nAcarajé tradicional no Rio Vermelho e moqueca de peixe.\n\n' +
    '💡 Dica de ouro\nUse roupas leves, protetor solar e hidrate-se com água de coco.',
};

describe('RoteiroResult (Tópico 3.5: Clima, Guia em Streaming e Atrativos)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 }), // Dispara fallback com mockViagem.dicas_destino
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza o banner meteorológico com métricas do destino e selo Open-Meteo', async () => {
    render(<RoteiroResult viagem={mockViagem} />);

    expect(await screen.findByText(/Clima em Salvador - BA/i)).toBeInTheDocument();
    expect(screen.getByText('Open-Meteo API')).toBeInTheDocument();
    expect(screen.getByText('29 °C')).toBeInTheDocument();
    expect(screen.getByText('18 km/h')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('31 °C')).toBeInTheDocument();
    expect(await screen.findByText(/✓ Guia completo/i)).toBeInTheDocument();
  });

  it('não inventa temperaturas nem condição para clima parcial', () => {
    render(
      <RoteiroResult
        viagem={{
          ...mockViagem,
          clima: {
            temperatura: 'Aguardando dados',
            umidade: 'N/D',
            vento: '',
            sensacao: '30 °C',
          },
        }}
      />,
    );
    expect(screen.getByText('Temperatura indisponível')).toBeInTheDocument();
    expect(screen.getByText('Condição indisponível')).toBeInTheDocument();
    expect(screen.getByText('30 °C')).toBeInTheDocument();
    expect(screen.queryByText('Céu Limpo')).not.toBeInTheDocument();
    expect(screen.queryByText('27.1°C')).not.toBeInTheDocument();
    expect(screen.queryByText('28.8°C')).not.toBeInTheDocument();
  });

  it('exibe o Guia do Viajante com selo Gemini AI e seções estruturadas', async () => {
    render(<RoteiroResult viagem={mockViagem} />);

    expect(screen.getByText('Guia do Viajante')).toBeInTheDocument();
    expect(screen.getByText('Gemini AI')).toBeInTheDocument();

    // Aguarda o término do streaming
    expect(await screen.findByText(/✓ Guia completo/i, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/Pelourinho e Farol da Barra/i)).toBeInTheDocument();
    expect(screen.getByText(/Acarajé tradicional/i)).toBeInTheDocument();
    expect(screen.getByText(/Use roupas leves/i)).toBeInTheDocument();
  });

  it('apresenta catálogo de atrativos e permite marcar visitas e atualizar progresso', async () => {
    const user = userEvent.setup();
    const onToggleVisita = vi.fn();

    const { rerender } = render(
      <RoteiroResult viagem={mockViagem} visitadosIds={[]} onToggleVisita={onToggleVisita} />,
    );

    expect(screen.getByText(/Atrativos & Gastronomia/i)).toBeInTheDocument();
    expect(screen.getByText(/0 de \d+ visitados \(0%\)/i)).toBeInTheDocument();

    // Identifica e clica no botão do primeiro atrativo
    const toggleButtons = screen.getAllByRole('button', { name: /Marcar como visitado/i });
    expect(toggleButtons.length).toBeGreaterThan(0);

    await user.click(toggleButtons[0]);
    expect(onToggleVisita).toHaveBeenCalledTimes(1);

    // Rerender com o atrativo marcado como visitado
    rerender(
      <RoteiroResult
        viagem={mockViagem}
        visitadosIds={['atrativo-1']}
        onToggleVisita={onToggleVisita}
      />,
    );

    expect(screen.getByText(/1 de \d+ visitados/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visitado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('mostra estado vazio para destino sem atrativos confirmados', () => {
    render(<RoteiroResult viagem={{ ...mockViagem, destino: 'Piripiri - PI' }} />);
    expect(
      screen.getByText('Ainda não há atrativos confirmados para este destino.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Filtrar atrativos' })).not.toBeInTheDocument();
  });

  it('filtra atrativos por categoria ao clicar nas abas', async () => {
    const user = userEvent.setup();
    render(<RoteiroResult viagem={mockViagem} visitadosIds={['atrativo-1']} />);

    // Clica na aba Gastronomia
    const abaGastronomia = screen.getByRole('tab', { name: /Gastronomia/i });
    await user.click(abaGastronomia);
    expect(abaGastronomia).toHaveClass('is-active');

    // Pratos típicos de Salvador devem ser visíveis
    expect(screen.getByText(/Acarajé Completo com Vatapá/i)).toBeInTheDocument();

    // Clica na aba Visitados
    const abaVisitados = screen.getByRole('tab', { name: /Visitados/i });
    await user.click(abaVisitados);
    expect(abaVisitados).toHaveClass('is-active');
  });

  it('permite copiar o texto do guia para a área de transferência', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    render(<RoteiroResult viagem={mockViagem} />);
    const copyButton = await screen.findByRole('button', { name: /Copiar guia/i });

    await user.click(copyButton);
    expect(writeTextMock).toHaveBeenCalled();
  });
});
