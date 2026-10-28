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
      coordenadas: [
        [-8.05, -34.88],
        [-8.01, -34.85],
      ],
    };
    const onRotaChange = vi.fn();
    render(
      <MapaRota viagem={{ ...trip, rotas: [principal, economica] }} onRotaChange={onRotaChange} />,
    );
    await user.click(screen.getByRole('button', { name: 'Rota econômica' }));
    expect(onRotaChange).toHaveBeenLastCalledWith(economica);
    expect(screen.getByRole('region', { name: 'Descrição textual da rota' })).toHaveTextContent(
      '9 km',
    );
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
