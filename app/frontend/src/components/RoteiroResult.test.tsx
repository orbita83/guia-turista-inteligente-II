import { act, render, screen, waitFor } from '@testing-library/react';
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
  atrativos: [
    { id: 'atrativo-1', nome: 'Pelourinho', categoria: 'historico', descricao: 'Centro histórico' },
    {
      id: 'gastro-1',
      nome: 'Acarajé Completo com Vatapá',
      categoria: 'gastronomia',
      descricao: 'Prato regional',
    },
  ],
  atrativosFonte: 'catalogo_local',
  dicas_destino:
    '📍 Pontos turísticos\nPelourinho e Farol da Barra com pôr do sol clássico.\n\n' +
    '🍽️ Culinária\nAcarajé tradicional no Rio Vermelho e moqueca de peixe.\n\n' +
    '💡 Dica de ouro\nUse roupas leves, protetor solar e hidrate-se com água de coco.',
  telemetria: { duracoes_etapas_ms: {}, provedores: { gemini: 'disponivel' } },
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
    expect(screen.getByText('Guia recebido no planejamento')).toBeInTheDocument();
  });

  it('não inventa perfil e duração para viagem histórica sem parâmetros', async () => {
    render(<RoteiroResult viagem={mockViagem} formParams={null} />);
    expect(screen.getByText(/Perfil não informado · Duração não informada/)).toBeInTheDocument();
    expect(screen.getByText('Guia recebido no planejamento')).toBeInTheDocument();
  });

  it('não inventa temperaturas nem condição para clima parcial', async () => {
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
    expect(screen.getByText('Guia recebido no planejamento')).toBeInTheDocument();
  });

  it('exibe o Guia do Viajante com selo Gemini AI e seções estruturadas', async () => {
    render(<RoteiroResult viagem={mockViagem} />);

    expect(screen.getByText('Guia do Viajante')).toBeInTheDocument();
    expect(screen.getByText('Gemini AI')).toBeInTheDocument();

    expect(screen.getByText('Guia recebido no planejamento')).toBeInTheDocument();
    expect(screen.getByText(/Pelourinho e Farol da Barra/i)).toBeInTheDocument();
    expect(screen.getByText(/Acarajé tradicional/i)).toBeInTheDocument();
    expect(screen.getByText(/Use roupas leves/i)).toBeInTheDocument();
  });

  it('reusa o guia planejado sem gerar novamente e preserva o texto ao recolher detalhes', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.mocked(globalThis.fetch);
    render(<RoteiroResult viagem={mockViagem} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Recolher detalhes do guia' }));
    expect(screen.getByRole('button', { name: 'Mostrar detalhes do guia' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await user.click(screen.getByRole('button', { name: 'Mostrar detalhes do guia' }));
    expect(screen.getByText(/Pelourinho e Farol da Barra/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('apresenta catálogo de atrativos e permite marcar visitas e atualizar progresso', async () => {
    const user = userEvent.setup();
    const onToggleVisita = vi.fn();

    const { rerender } = render(
      <RoteiroResult viagem={mockViagem} visitadosIds={[]} onToggleVisita={onToggleVisita} />,
    );

    expect(
      screen.getByRole('heading', { name: /Pontos Turísticos & Atrativos/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Restaurantes & Gastronomia/i }),
    ).toBeInTheDocument();
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

  it('mostra estado vazio para destino sem atrativos confirmados', async () => {
    render(<RoteiroResult viagem={{ ...mockViagem, destino: 'Piripiri - PI', atrativos: [] }} />);
    expect(
      screen.getByText('Ainda não há atrativos catalogados para Piripiri - PI.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Sem pontos turísticos catalogados para este destino.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sem restaurantes catalogados para este destino.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filtrar atrativos' })).not.toBeInTheDocument();
    expect(screen.getByText('Guia recebido no planejamento')).toBeInTheDocument();
  });

  it('respeita uma lista vazia explícita do backend mesmo para cidade conhecida', async () => {
    render(
      <RoteiroResult viagem={{ ...mockViagem, atrativos: [], atrativosFonte: 'catalogo_local' }} />,
    );
    expect(
      screen.getByText('Ainda não há atrativos catalogados para Salvador - BA.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Acarajé Completo com Vatapá/i)).not.toBeInTheDocument();
    expect(screen.getByText('Guia recebido no planejamento')).toBeInTheDocument();
  });

  it('filtra atrativos por categoria ao clicar nas abas', async () => {
    const user = userEvent.setup();
    render(<RoteiroResult viagem={mockViagem} visitadosIds={['atrativo-1']} />);

    // Clica na aba Gastronomia
    const abaGastronomia = screen.getByRole('button', { name: /Gastronomia/i });
    await user.click(abaGastronomia);
    expect(abaGastronomia).toHaveClass('is-active');

    // Pratos típicos de Salvador devem ser visíveis
    expect(screen.getByText(/Acarajé Completo com Vatapá/i)).toBeInTheDocument();

    // Clica na aba Visitados
    const abaVisitados = screen.getByRole('button', { name: /Visitados/i });
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

describe('RoteiroResult: estados reais da transmissão', () => {
  afterEach(() => vi.restoreAllMocks());

  function prepararStream() {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        source = controller;
      },
      cancel,
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
      );
    const enviar = async (evento: string, dados: object) => {
      await act(async () => {
        source.enqueue(
          new TextEncoder().encode(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`),
        );
      });
    };
    return { source, cancel, fetchMock, enviar };
  }

  it('mostra fragmentos antes de done e habilita retransmissão após concluir', async () => {
    const user = userEvent.setup();
    const { enviar } = prepararStream();
    render(<RoteiroResult viagem={mockViagem} />);
    await user.click(screen.getByRole('button', { name: /Retransmitir/i }));
    expect(screen.getByRole('button', { name: /Retransmitir/i })).toBeDisabled();
    await screen.findByText(/Transmitindo ao vivo/);
    await enviar('chunk', { chunk: 'Conteúdo que chegou primeiro', done: false });
    expect(screen.getByText('Conteúdo que chegou primeiro')).toBeInTheDocument();
    expect(screen.queryByText(/✓ Guia completo/i)).not.toBeInTheDocument();
    await enviar('done', { done: true });
    expect(await screen.findByText(/✓ Transmissão concluída/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retransmitir/i })).toBeEnabled();
  });

  it('substitui o conteúdo parcial após um evento replace', async () => {
    const user = userEvent.setup();
    const { enviar } = prepararStream();
    render(<RoteiroResult viagem={mockViagem} />);
    await user.click(screen.getByRole('button', { name: /Retransmitir/i }));
    await enviar('chunk', { chunk: 'Resposta interrompida', done: false });
    expect(screen.getByText('Resposta interrompida')).toBeInTheDocument();
    await enviar('replace', { text: 'Conteúdo completo de contingência' });
    expect(screen.getByText('Conteúdo completo de contingência')).toBeInTheDocument();
    expect(screen.queryByText('Resposta interrompida')).not.toBeInTheDocument();
    await enviar('done', { done: true });
    expect(await screen.findByText(/✓ Transmissão concluída/i)).toBeInTheDocument();
  });

  it('retransmite com nova solicitação e substitui o texto da geração anterior', async () => {
    const user = userEvent.setup();
    const first = prepararStream();
    render(<RoteiroResult viagem={mockViagem} />);
    await user.click(screen.getByRole('button', { name: /Retransmitir/i }));
    await first.enviar('chunk', { chunk: 'Primeira geração', done: false });
    await first.enviar('done', { done: true });
    expect(await screen.findByText(/✓ Transmissão concluída/i)).toBeInTheDocument();

    let second!: ReadableStreamDefaultController<Uint8Array>;
    first.fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            second = controller;
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    await user.click(screen.getByRole('button', { name: /Retransmitir/i }));
    expect(first.fetchMock).toHaveBeenCalledTimes(2);
    expect(first.fetchMock.mock.calls[1][1]?.method).toBe('POST');
    expect(screen.queryByText('Primeira geração')).not.toBeInTheDocument();

    await act(async () => {
      second.enqueue(
        new TextEncoder().encode(
          'event: chunk\ndata: {"chunk":"Segunda geração","done":false}\n\n',
        ),
      );
    });
    expect(screen.getByText('Segunda geração')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retransmitir/i })).toBeDisabled();
    await act(async () => {
      second.enqueue(new TextEncoder().encode('event: done\ndata: {"done":true}\n\n'));
    });
    expect(await screen.findByText(/✓ Transmissão concluída/i)).toBeInTheDocument();
  });

  it('apresenta conflito 409 como erro sem declarar sucesso com o guia antigo', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Conflito', { status: 409 }));
    render(<RoteiroResult viagem={mockViagem} />);
    await user.click(screen.getByRole('button', { name: /Retransmitir/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 409');
    expect(screen.queryByText(/✓ Guia completo/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Pelourinho e Farol da Barra/i)).toBeInTheDocument();
    expect(screen.getByText('Exibindo o guia recebido no planejamento.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retransmitir/i })).toBeEnabled();
  });

  it('permite cancelar durante a leitura e remove o texto parcial', async () => {
    const user = userEvent.setup();
    const { enviar, cancel, fetchMock } = prepararStream();
    render(<RoteiroResult viagem={mockViagem} />);
    await user.click(screen.getByRole('button', { name: /Retransmitir/i }));
    await enviar('chunk', { chunk: 'Conteúdo parcial', done: false });
    await user.click(screen.getByRole('button', { name: /Cancelar transmissão/i }));
    expect(screen.queryByText('Conteúdo parcial')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Transmissão cancelada');
    expect(screen.queryByText(/✓ Guia completo/i)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  });

  it('aborta a requisição quando o componente sai da tela', async () => {
    const user = userEvent.setup();
    const { cancel, fetchMock, enviar } = prepararStream();
    const { unmount } = render(<RoteiroResult viagem={mockViagem} />);
    await user.click(screen.getByRole('button', { name: /Retransmitir/i }));
    await enviar('chunk', { chunk: 'Texto', done: false });
    unmount();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  });
});
