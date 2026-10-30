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
    expect(screen.getByLabelText('Custos da rota selecionada')).toHaveTextContent(/R\$\s*7,00/);
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
    expect(screen.getByLabelText('Custos da rota selecionada')).toHaveTextContent(
      'Custo parcial: pedágios indisponíveis',
    );
    expect(screen.getByLabelText('Custos da rota selecionada')).toHaveTextContent('100,00');
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

  it('renderiza a seção Topografia & Relevo da Rota conforme o wireframe da seção 3.3', async () => {
    const user = userEvent.setup();
    const viagemComAltimetria: Viagem = {
      ...trip,
      percurso: {
        ...trip.percurso,
        geometria: principal.coordenadas,
        topografia: {
          altitudeMaximaM: 675,
          cotaMinimaM: 5,
          cotaMaximaM: 675,
          desnivelSubidaM: 918,
          desnivelDescidaM: 1055,
          desnivelLiquidoM: -137,
          subidasAcumuladasM: 918,
          descidasAcumuladasM: 1055,
          penalizacaoConsumoPct: 6.9,
          fatorTerreno: 'ondulado',
          rendimentoRealKmL: 11.2,
        },
        perfilElevacao: [
          { distanciaKm: 0, altitudeM: 5 },
          { distanciaKm: 4, altitudeM: 675 },
          { distanciaKm: 8, altitudeM: 50 },
        ],
      },
    };

    render(
      <MapaRota
        viagem={viagemComAltimetria}
        formParams={{
          origem_cidade: 'Recife',
          origem_uf: 'PE',
          destino_cidade: 'Olinda',
          destino_uf: 'PE',
          propulsao: 'combustao',
          consumo_km_l: 12.0,
        }}
      />,
    );

    // Cabeçalho e badge da topografia
    expect(screen.getByText('Topografia & Relevo da Rota')).toBeInTheDocument();
    expect(screen.getByText(/Terreno Ondulado \(\+6\.9%\)/)).toBeInTheDocument();

    // Métricas de consumo
    expect(screen.getByText('Consumo nominal:')).toBeInTheDocument();
    expect(screen.getByText('12.0 km/l')).toBeInTheDocument();
    expect(screen.getByText(/Rendimento Real:/)).toBeInTheDocument();

    // Desníveis e inclinações
    expect(screen.getByText(/Subidas acumuladas:/)).toHaveTextContent('+918m');
    expect(screen.getByText(/Descidas acumuladas:/)).toHaveTextContent('-1055m');
    expect(screen.getByText(/Desnível líquido:/)).toHaveTextContent('-137m');

    // Badges do perfil topográfico
    expect(screen.getByText('Cota Mín: 5m')).toBeInTheDocument();
    expect(screen.getByText(/Perfil Topográfico de Elevação/)).toBeInTheDocument();
    expect(screen.getByText('Cota Máx: 675m')).toBeInTheDocument();

    // Toggle de exibição do gráfico
    const toggleButton = screen.getByRole('button', { name: 'Ocultar perfil ▴' });
    expect(toggleButton).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Perfil de elevação de 5 a 675 metros/ }),
    ).toBeInTheDocument();

    // Clica para ocultar
    await user.click(toggleButton);
    expect(screen.getByRole('button', { name: 'Ver perfil ▾' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Perfil de elevação/ })).not.toBeInTheDocument();

    // Clica para expandir novamente
    await user.click(screen.getByRole('button', { name: 'Ver perfil ▾' }));
    expect(
      screen.getByRole('img', { name: /Perfil de elevação de 5 a 675 metros/ }),
    ).toBeInTheDocument();
  });

  it('apresenta controles de propulsão, grade de 6 métricas com ícones e painel de sugestões conforme o wireframe 03-mapa-e-autonomia', async () => {
    const user = userEvent.setup();
    const viagemCompleta: Viagem = {
      ...trip,
      percurso: {
        ...trip.percurso,
        distancia: '932.5 km',
        tempo: '14h 2min de carro',
        geometria: principal.coordenadas,
        autonomia: {
          sucesso: true,
          solucaoSegura: true,
          autonomiaMaximaKm: 562,
          paradas: [
            {
              id: 'p1',
              nome: 'Posto de Teste',
              km: 450,
              nivelBateriaOuTanquePct: 20,
              coordenadas: [-8.03, -34.86],
              tipo: 'combustivel',
              origem: 'verificado',
            },
          ],
        },
        topografia: {
          altitudeMaximaM: 675,
          cotaMinimaM: 5,
          cotaMaximaM: 675,
          desnivelSubidaM: 918,
          desnivelDescidaM: 1055,
          desnivelLiquidoM: -137,
          subidasAcumuladasM: 918,
          descidasAcumuladasM: 1055,
          penalizacaoConsumoPct: 6.9,
          fatorTerreno: 'ondulado',
        },
        alternativas: [
          {
            distancia: '1081.1 km',
            tempo: '16h 1min de carro',
            geometria: principal.coordenadas,
            topografia: {
              altitudeMaximaM: 1200,
              cotaMinimaM: 10,
              cotaMaximaM: 1200,
              desnivelSubidaM: 1180,
              desnivelDescidaM: 950,
              desnivelLiquidoM: 230,
              subidasAcumuladasM: 1180,
              descidasAcumuladasM: 950,
              penalizacaoConsumoPct: 8.5,
              fatorTerreno: 'montanhoso',
            },
          },
        ],
      },
    };

    const onAlternativaChange = vi.fn();
    render(
      <MapaRota
        viagem={viagemCompleta}
        formParams={{
          origem_cidade: 'Recife',
          origem_uf: 'PE',
          destino_cidade: 'Olinda',
          destino_uf: 'PE',
          propulsao: 'combustao',
          consumo_km_l: 12.0,
          eficiencia_km_kwh: 6.0,
        }}
        onAlternativaChange={onAlternativaChange}
      />,
    );

    // Trecho 1: Controles de Propulsão & Sugestões Rápidas
    const btnCombustao = screen.getByRole('button', { name: /Combustão/i });
    const btnEletrico = screen.getByRole('button', { name: /Elétrico \(EV\)/i });
    expect(btnCombustao).toHaveClass('is-active');
    expect(btnEletrico).not.toHaveClass('is-active');

    // Alternar para elétrico
    await user.click(btnEletrico);
    expect(btnEletrico).toHaveClass('is-active');
    expect(btnCombustao).not.toHaveClass('is-active');
    expect(screen.getByText('Consumo nominal:')).toBeInTheDocument();
    expect(screen.getByText('6.0 km/kWh')).toBeInTheDocument();

    // Alternar de volta para combustão
    await user.click(btnCombustao);
    expect(btnCombustao).toHaveClass('is-active');
    expect(screen.getByText('12.0 km/l')).toBeInTheDocument();

    // Trecho 1: Grade de 6 métricas com ícones e valores estilizados
    expect(screen.getByText('DISTÂNCIA')).toBeInTheDocument();
    expect(screen.getByText('932.5 km')).toBeInTheDocument();

    expect(screen.getByText('DURAÇÃO')).toBeInTheDocument();
    expect(screen.getByText('14h 2min')).toBeInTheDocument();

    expect(screen.getByText('PARADAS')).toBeInTheDocument();
    expect(screen.getByText('1 parada(s)')).toBeInTheDocument();

    expect(screen.getByText('AUTONOMIA')).toBeInTheDocument();
    expect(screen.getByText('~562 km')).toBeInTheDocument();

    expect(screen.getByText('SUGESTÃO DE ROTA')).toBeInTheDocument();
    expect(screen.getByText('Mais ágil')).toBeInTheDocument();

    expect(screen.getByText('TOPOGRAFIA')).toBeInTheDocument();
    expect(screen.getByText('Terreno Ondulado')).toBeInTheDocument();

    // Trecho 2: Painel de Sugestões de Trajeto Rodoviário
    expect(screen.getByText(/Sugestões de Trajeto Rodoviário/)).toBeInTheDocument();
    expect(screen.getByText(/trajeto principal mais ágil/)).toBeInTheDocument();

    // Linha 1 (Sugestão 01) e badge "Em exibição"
    expect(screen.getAllByText('Sugestão 01').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Menor tempo e despesas de viagem/)).toBeInTheDocument();
    expect(screen.getByText(/Em exibição/)).toBeInTheDocument();

    // Linha 2 (Sugestão 02)
    expect(screen.getAllByText('Sugestão 02').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1081.1 km · 16h 1min · ⛰️ \+1180m/)).toBeInTheDocument();

    // Clica na Sugestão 02
    await user.click(screen.getByRole('button', { name: /Alternativa 1/i }));
    expect(onAlternativaChange).toHaveBeenCalledWith(0);
  });
});
