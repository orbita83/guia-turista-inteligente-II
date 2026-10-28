import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calcularHaversineKm,
  identificarCidadeMaisProxima,
  obterCoordenadasNavegador,
  obterSugestoesDestino,
} from './geolocation';

describe('geolocation service', () => {
  describe('calcularHaversineKm', () => {
    it('retorna 0 km para a mesma coordenada', () => {
      const lat = -23.5505;
      const lon = -46.6333;
      expect(calcularHaversineKm(lat, lon, lat, lon)).toBe(0);
    });

    it('calcula corretamente a distância entre São Paulo e Rio de Janeiro (~357 km)', () => {
      // São Paulo: -23.5505, -46.6333
      // Rio de Janeiro: -22.9068, -43.1729
      const distancia = calcularHaversineKm(-23.5505, -46.6333, -22.9068, -43.1729);
      expect(distancia).toBeGreaterThanOrEqual(350);
      expect(distancia).toBeLessThanOrEqual(370);
    });

    it('calcula corretamente a distância entre Recife e Salvador (~675 km)', () => {
      // Recife: -8.0476, -34.8770
      // Salvador: -12.9777, -38.5016
      const distancia = calcularHaversineKm(-8.0476, -34.877, -12.9777, -38.5016);
      expect(distancia).toBeGreaterThanOrEqual(660);
      expect(distancia).toBeLessThanOrEqual(690);
    });
  });

  describe('obterSugestoesDestino', () => {
    it('retorna os 4 destinos turísticos mais próximos por padrão sem corte rígido (conforme jornadas.md)', () => {
      // A partir de São Paulo (-23.5505, -46.6333), sem corte de distância
      const sugestoes = obterSugestoesDestino(-23.5505, -46.6333);

      expect(sugestoes).toHaveLength(4);

      for (const sugestao of sugestoes) {
        expect(sugestaoValida(sugestao)).toBe(true);
      }

      // Os mais próximos de SP (ex.: Campos do Jordão, Ilhabela, Ubatuba, Paraty) estão presentes
      const nomes = sugestoes.map((s) => s.nome);
      expect(nomes).toContain('Campos do Jordão');
      expect(nomes).toContain('Ilhabela');
      expect(nomes).toContain('Ubatuba');
      expect(nomes).toContain('Paraty');
    });

    it('aplica o filtro de distância mínima quando especificado via opções (ex.: >= 400 km)', () => {
      // A partir de São Paulo (-23.5505, -46.6333) com filtro de 400 km
      const sugestoes = obterSugestoesDestino(-23.5505, -46.6333, { distanciaMinimaKm: 400 });

      expect(sugestoes).toHaveLength(4);

      for (const sugestao of sugestoes) {
        expect(sugestaoValida(sugestao)).toBe(true);
        expect(sugestao.distanciaKm).toBeGreaterThanOrEqual(400);
      }

      // Destinos próximos a SP (< 400 km) NÃO devem estar inclusos
      const nomes = sugestoes.map((s) => s.nome);
      expect(nomes).not.toContain('Campos do Jordão');
      expect(nomes).not.toContain('Paraty');
      expect(nomes).not.toContain('Rio de Janeiro');
      expect(nomes).not.toContain('São Paulo');
    });

    it('filtra destinos com menos de 400 km a partir de Recife quando o filtro é solicitado', () => {
      // Recife: -8.0476, -34.8770
      const sugestoes = obterSugestoesDestino(-8.0476, -34.877, { distanciaMinimaKm: 400 });

      expect(sugestoes).toHaveLength(4);

      const nomes = sugestoes.map((s) => s.nome);
      // Destinos próximos de Recife como João Pessoa (~100km), Ipojuca (~50km) e Maragogi (~120km) são filtrados
      expect(nomes).not.toContain('João Pessoa');
      expect(nomes).not.toContain('Ipojuca');
      expect(nomes).not.toContain('Maragogi');

      for (const sugestao of sugestoes) {
        expect(sugestao.distanciaKm).toBeGreaterThanOrEqual(400);
      }
    });

    it('aciona fallback seguro quando não há polos suficientes acima da distância mínima extrema', () => {
      // Distância extrema de 4000 km a partir de SP
      const sugestoes = obterSugestoesDestino(-23.5505, -46.6333, {
        limite: 4,
        distanciaMinimaKm: 4000,
      });

      // Nunca deixa o usuário sem recomendações (retorna até 4 destinos)
      expect(sugestoes).toHaveLength(4);
    });

    function sugestaoValida(sugestao: { nome: string; uf: string; distanciaKm: number }) {
      return (
        typeof sugestao.nome === 'string' &&
        sugestao.nome.length > 0 &&
        typeof sugestao.uf === 'string' &&
        sugestao.uf.length === 2 &&
        typeof sugestao.distanciaKm === 'number'
      );
    }
  });

  describe('identificarCidadeMaisProxima', () => {
    it('identifica Rio de Janeiro quando as coordenadas são próximas a Copacabana', () => {
      const maisProximo = identificarCidadeMaisProxima(-22.9711, -43.1822);
      expect(maisProximo.nome).toBe('Rio de Janeiro');
      expect(maisProximo.uf).toBe('RJ');
      expect(maisProximo.distanciaKm).toBeLessThan(20);
    });

    it('identifica São Paulo quando as coordenadas são próximas à Av. Paulista', () => {
      const maisProximo = identificarCidadeMaisProxima(-23.5615, -46.6559);
      expect(maisProximo.nome).toBe('São Paulo');
      expect(maisProximo.uf).toBe('SP');
      expect(maisProximo.distanciaKm).toBeLessThan(20);
    });
  });

  describe('obterCoordenadasNavegador', () => {
    const originalGeolocation = navigator.geolocation;

    afterEach(() => {
      Object.defineProperty(navigator, 'geolocation', {
        value: originalGeolocation,
        configurable: true,
        writable: true,
      });
      vi.restoreAllMocks();
    });

    it('retorna latitude e longitude quando o GPS responde com sucesso', async () => {
      const mockPosition = {
        coords: {
          latitude: -12.9777,
          longitude: -38.5016,
          accuracy: 10,
        },
      };

      const getCurrentPositionMock = vi.fn((success) => {
        success(mockPosition);
      });

      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: getCurrentPositionMock },
        configurable: true,
        writable: true,
      });

      const coords = await obterCoordenadasNavegador();
      expect(coords).toEqual({
        latitude: -12.9777,
        longitude: -38.5016,
      });
      expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
    });

    it('rejeita com mensagem amigável quando o usuário nega a permissão (PERMISSION_DENIED)', async () => {
      const mockError = {
        code: 1, // PERMISSION_DENIED
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'User denied Geolocation',
      };

      const getCurrentPositionMock = vi.fn((_success, error) => {
        error(mockError);
      });

      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: getCurrentPositionMock },
        configurable: true,
        writable: true,
      });

      await expect(obterCoordenadasNavegador()).rejects.toThrow(/Permissão de localização negada/);
    });

    it('rejeita com mensagem amigável quando ocorre timeout (TIMEOUT)', async () => {
      const mockError = {
        code: 3, // TIMEOUT
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'Timeout expired',
      };

      const getCurrentPositionMock = vi.fn((_success, error) => {
        error(mockError);
      });

      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: getCurrentPositionMock },
        configurable: true,
        writable: true,
      });

      await expect(obterCoordenadasNavegador()).rejects.toThrow(
        /Tempo esgotado ao buscar localização/,
      );
    });

    it('rejeita quando o navegador não possui navigator.geolocation', async () => {
      Object.defineProperty(navigator, 'geolocation', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await expect(obterCoordenadasNavegador()).rejects.toThrow(/Geolocalização não é suportada/);
    });
  });
});
