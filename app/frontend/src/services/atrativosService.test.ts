import { describe, expect, it } from 'vitest';
import { obterAtrativosPorDestino } from './atrativosService';

describe('atrativosService', () => {
  it('retorna atrativos e gastronomia curados para cidades catalogadas (ex.: Recife)', () => {
    const atrativos = obterAtrativosPorDestino('Recife - PE');
    expect(atrativos.length).toBeGreaterThanOrEqual(5);

    const nomes = atrativos.map((a) => a.nome);
    expect(nomes).toContain('Marco Zero e Recife Antigo');
    expect(nomes).toContain('Bolo de Rolo Tradicional');

    // Categorias presentes
    const categorias = atrativos.map((a) => a.categoria);
    expect(categorias).toContain('historico');
    expect(categorias).toContain('gastronomia');

    // Validação de propriedades
    for (const item of atrativos) {
      expect(item.id).toBeTruthy();
      expect(item.nome).toBeTruthy();
      expect(item.descricao).toBeTruthy();
      expect(item.icone).toBeTruthy();
      expect(item.visitado).toBe(false);
    }
  });

  it('retorna atrativos curados para Salvador', () => {
    const atrativos = obterAtrativosPorDestino('Salvador');
    const nomes = atrativos.map((a) => a.nome);
    expect(nomes).toContain('Pelourinho e Igreja de São Francisco');
    expect(nomes).toContain('Acarajé Completo com Vatapá');
  });

  it('retorna atrativos curados para Gramado', () => {
    const atrativos = obterAtrativosPorDestino('Gramado - RS');
    const nomes = atrativos.map((a) => a.nome);
    expect(nomes).toContain('Lago Negro');
    expect(nomes).toContain('Sequência de Fondue Tradicional');
  });

  it('não inventa atrativos para destinos fora do catálogo', () => {
    const atrativos = obterAtrativosPorDestino('Piripiri - PI', ['ecoturismo-aventura']);
    expect(atrativos).toEqual([]);
  });
});
