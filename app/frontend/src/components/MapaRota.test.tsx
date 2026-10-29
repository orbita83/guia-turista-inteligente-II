import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { RotaAlternativa, Viagem } from '../types/domain';
import { MapaRota } from './MapaRota';

const trip: Viagem = {
  id: 'trip-1',
  origem: 'Recife - PE',
  destino: 'Olinda - PE',
  clima: { temperatura: '28 °C', umidade: '70%', vento: '12 km/h' },
  percurso: { distancia: '8 km', tempo: '20 min' },
  dicas_destino: '',
};

const principal: RotaAlternativa = {
  id: 'principal',
  titulo: 'Rota principal',
  tipoRotulo: 'Principal',
  descricao: 'Via principal',
  resumoDestaque: 'Rota recebida',
  distanciaKm: 8,
  tempoFormatado: '20 min',
  pedagios: 0,
  autonomiaKm: 300,
  coordenadas: [
    [-8.05, -34.88],
    [-8.02, -34.85],
  ],
  paradas: [],
  topografia: {
    altitudeMaximaM: 10,
    desnivelSubidaM: 2,
    desnivelDescidaM: 1,
    desnivelLiquidoM: 1,
    cotaMinimaM: 2,
    cotaMaximaM: 10,
    penalizacaoConsumoPct: 0,
  },
  custos: { combustivelOuEnergia: 5, pedagios: 0, total: 5, passageiros: 1, valorPorPassageiro: 5 },
};

describe('F02 — geometria confirmada', () => {
  it('mostra indisponibilidade e preserva distância e duração textuais sem geometria', () => {
    render(<MapaRota viagem={trip} />);
    expect(
      screen.getByText('Traçado rodoviário indisponível para esta viagem.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Distância informada: 8 km.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Traçado de/i })).not.toBeInTheDocument();
  });

  it('desenha a geometria recebida sem inventar alternativa', () => {
    render(
      <MapaRota
        viagem={{ ...trip, percurso: { ...trip.percurso, geometria: principal.coordenadas } }}
      />,
    );
    expect(screen.getByRole('img', { name: /Traçado de Recife/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Rotas disponíveis' })).not.toBeInTheDocument();
  });

  it('seleciona apenas alternativas recebidas', async () => {
    const user = userEvent.setup();
    const economica: RotaAlternativa = {
      ...principal,
      id: 'economica',
      titulo: 'Rota econômica',
      distanciaKm: 9,
      tempoFormatado: '25 min',
      custos: { ...principal.custos, total: 7 },
      coordenadas: [
        [-8.05, -34.88],
        [-8.01, -34.85],
      ],
    };
    const onRotaChange = vi.fn();
    const { rerender } = render(
      <MapaRota viagem={{ ...trip, rotas: [principal, economica] }} onRotaChange={onRotaChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Rota econômica' }));
    expect(onRotaChange).toHaveBeenLastCalledWith(economica);
    rerender(
      <MapaRota
        viagem={{ ...trip, rotas: [principal, economica] }}
        rotaAtivaId="economica"
        onRotaChange={onRotaChange}
      />,
    );
    expect(screen.getByRole('region', { name: 'Descrição textual da rota' })).toHaveTextContent(
      '9 km',
    );
    expect(screen.getByText('Custo total: R$ 7.00')).toBeInTheDocument();
  });

  it('mostra alternativa OSRM sem inventar custos ou relevo', async () => {
    const user = userEvent.setup();
    const alternativa = {
      distancia: '9 km',
      tempo: '25 min',
      geometria: [
        [-8.05, -34.88],
        [-8.01, -34.85],
      ] as [number, number][],
    };
    const onChange = vi.fn();
    const viagem = {
      ...trip,
      percurso: { ...trip.percurso, geometria: principal.coordenadas, alternativas: [alternativa] },
    };
    const { rerender } = render(<MapaRota viagem={viagem} onAlternativaChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Alternativa 1 (9 km)' }));
    expect(onChange).toHaveBeenCalledWith(0);
    rerender(<MapaRota viagem={viagem} alternativaAtiva={0} onAlternativaChange={onChange} />);
    expect(screen.getByRole('region', { name: 'Descrição textual da rota' })).toHaveTextContent(
      '9 km',
    );
    expect(screen.queryByText(/Custo total:/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Perfil de elevação indisponível para esta viagem.'),
    ).toBeInTheDocument();
  });

  it('identifica pontos projetados e não os atribui a outra alternativa', () => {
    const parada = {
      id: 'p1',
      nome: 'Ponto projetado',
      km: 90,
      tipo: 'combustivel' as const,
      nivelBateriaOuTanquePct: 22,
      coordenadas: [-8.03, -34.86] as [number, number],
      origem: 'projetado' as const,
    };
    const viagem = {
      ...trip,
      percurso: {
        ...trip.percurso,
        geometria: principal.coordenadas,
        autonomia: {
          sucesso: true,
          solucaoSegura: true,
          autonomiaMaximaKm: 120,
          paradas: [parada],
        },
        alternativas: [{ distancia: '9 km', tempo: '25 min', geometria: principal.coordenadas }],
      },
    };
    const { rerender } = render(<MapaRota viagem={viagem} />);
    expect(screen.getByText(/ponto projetado, não confirmado/)).toBeInTheDocument();
    rerender(<MapaRota viagem={viagem} alternativaAtiva={0} />);
    expect(screen.queryByText(/ponto projetado, não confirmado/)).not.toBeInTheDocument();
  });

  it('mostra o perfil da rota selecionada sem misturar alternativas', () => {
    const viagem = {
      ...trip,
      percurso: {
        ...trip.percurso,
        geometria: principal.coordenadas,
        perfilElevacao: [
          { distanciaKm: 0, altitudeM: 1 },
          { distanciaKm: 8, altitudeM: 5 },
        ],
        alternativas: [
          {
            distancia: '9 km',
            tempo: '25 min',
            geometria: principal.coordenadas,
            perfilElevacao: [
              { distanciaKm: 0, altitudeM: 42 },
              { distanciaKm: 9, altitudeM: 84 },
            ],
          },
        ],
      },
    };
    const { rerender } = render(<MapaRota viagem={viagem} />);
    expect(
      screen.getByRole('img', { name: /Perfil de elevação de 1 a 5 metros/ }),
    ).toBeInTheDocument();
    rerender(<MapaRota viagem={viagem} alternativaAtiva={0} />);
    expect(
      screen.getByRole('img', { name: /Perfil de elevação de 42 a 84 metros/ }),
    ).toBeInTheDocument();
  });

  it('apresenta custos e rateio parciais sem declarar pedágio zero', () => {
    const custos = {
      custoPropulsao: '100.00',
      custoTotal: '100.00',
      totalCompleto: false,
      cotas: [
        { passageiro: 1, valor: '33.34' },
        { passageiro: 2, valor: '33.33' },
        { passageiro: 3, valor: '33.33' },
      ],
    };
    render(
      <MapaRota
        viagem={{
          ...trip,
          percurso: { ...trip.percurso, geometria: principal.coordenadas, custos },
        }}
      />,
    );
    expect(
      screen.getByText(/Total parcial, pedágios incompletos ou indisponíveis/),
    ).toHaveTextContent('100,00');
    expect(screen.getByText(/Passageiro 1:/)).toHaveTextContent('33,34');
    expect(screen.getByText(/Passageiro 2:/)).toHaveTextContent('33,33');
    expect(screen.getByText(/não é o custo final/)).toBeInTheDocument();
  });

  it('desenha somente séries altimétricas recebidas e mantém estado vazio sem dados', () => {
    const withElevation: Viagem = {
      ...trip,
      percurso: {
        ...trip.percurso,
        perfilElevacao: [
          { distanciaKm: 0, altitudeM: 2 },
          { distanciaKm: 8, altitudeM: 20 },
        ],
      },
    };
    const { rerender } = render(<MapaRota viagem={withElevation} />);
    expect(
      screen.getByRole('img', { name: /Perfil de elevação de 2 a 20 metros/ }),
    ).toBeInTheDocument();
    rerender(<MapaRota viagem={trip} />);
    expect(
      screen.getByText('Perfil de elevação indisponível para esta viagem.'),
    ).toBeInTheDocument();
  });
});
