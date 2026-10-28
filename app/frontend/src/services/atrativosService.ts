import type { AtrativoTuristico, PerfilViajante } from '../types/domain';

// TODO(backend): receber a coleção estruturada de atrativos e gastronomia diretamente da resposta JSON de /planejar ou /minhas-viagens.

interface DestinoAtrativosMap {
  pontos: Array<{
    nome: string;
    categoria: AtrativoTuristico['categoria'];
    descricao: string;
    destaque?: string;
    icone: string;
  }>;
  gastronomia: Array<{
    nome: string;
    categoria?: AtrativoTuristico['categoria'];
    descricao: string;
    destaque?: string;
    icone: string;
  }>;
}

const CATALOGO_DESTINOS: Record<string, DestinoAtrativosMap> = {
  recife: {
    pontos: [
      {
        nome: 'Marco Zero e Recife Antigo',
        categoria: 'historico',
        descricao: 'Praça histórica à beira-mar com esculturas de Brennand e casarios coloniais.',
        icone: '🏛️',
      },
      {
        nome: 'Instituto Ricardo Brennand',
        categoria: 'cultura',
        descricao: 'Complexo cultural com réplicas de castelos e maior acervo de Frans Post.',
        icone: '🏰',
      },
      {
        nome: 'Praia de Boa Viagem',
        categoria: 'natureza',
        descricao: 'Famosa orla urbana protegida por arrecifes naturais e quiosques tradicionais.',
        icone: '🏖️',
      },
      {
        nome: 'Embaixada dos Bonecos Gigantes',
        categoria: 'cultura',
        descricao: 'Exposição das figuras tradicionais do carnaval olindense e pernambucano.',
        icone: '🎭',
      },
    ],
    gastronomia: [
      {
        nome: 'Bolo de Rolo Tradicional',
        descricao: 'Patrimônio cultural com finas camadas de massa amanteigada e goiabada.',
        icone: '🍰',
      },
      {
        nome: 'Caldinho de Sururu e Feijão',
        descricao: 'Petisco clássico das praias e botecos, servido bem quente.',
        icone: '🍲',
      },
      {
        nome: 'Carne de Sol com Macaxeira',
        descricao: 'Prato sertanejo servido com queijo coalho e manteiga de garrafa.',
        icone: '🥩',
      },
    ],
  },
  salvador: {
    pontos: [
      {
        nome: 'Pelourinho e Igreja de São Francisco',
        categoria: 'historico',
        descricao: 'Centro histórico colonial com ladeiras coloridas e arte barroca dourada.',
        destaque: 'Arte barroca e ladeiras históricas',
        icone: '⛪',
      },
      {
        nome: 'Elevador Lacerda e Mercado Modelo',
        categoria: 'mirante',
        descricao: 'Vista panorâmica da Baía de Todos-os-Santos e feira artesanal.',
        destaque: 'Vista da Baía de Todos-os-Santos',
        icone: '🛗',
      },
      {
        nome: 'Farol da Barra',
        categoria: 'historico',
        descricao: 'Fortificação do século XVII e ponto clássico para contemplar o pôr do sol.',
        destaque: 'Pôr do sol clássico na praia',
        icone: '🗼',
      },
      {
        nome: 'Igreja de Nosso Senhor do Bonfim',
        categoria: 'cultura',
        descricao: 'Santuário de fé e devoção famoso pelas fitinhas coloridas dos pedidos.',
        destaque: 'Fitinhas coloridas tradicionais',
        icone: '✨',
      },
    ],
    gastronomia: [
      {
        nome: 'Acarajé Completo com Vatapá',
        categoria: 'gastronomia',
        descricao: 'Bolinho de feijão fradinho frito no dendê com camarão seco e caruru.',
        destaque: 'Acarajé no Rio Vermelho',
        icone: '🧆',
      },
      {
        nome: 'Moqueca Baiana com Pirão',
        categoria: 'gastronomia',
        descricao: 'Peixe fresco cozido em leite de coco artesanal, azeite de dendê e coentro.',
        destaque: 'Frutos do mar e dendê',
        icone: '🥘',
      },
      {
        nome: 'Cocada Puxa de Fita',
        categoria: 'gastronomia',
        descricao: 'Doce tradicional de coco fresco encontrado em tabuleiros típicos.',
        destaque: 'Doces de tabuleiro',
        icone: '🥥',
      },
    ],
  },
  natal: {
    pontos: [
      {
        nome: 'Praia de Ponta Negra',
        categoria: 'natureza',
        descricao: 'Famosa orla urbana com calçadão movimentado e vista para o Morro do Careca.',
        destaque: 'Morro do Careca',
        icone: '🏖️',
      },
      {
        nome: 'Forte dos Reis Magos',
        categoria: 'natureza',
        descricao:
          'Fortaleza histórica de 1598 localizada no encontro do Rio Potengi com o oceano.',
        destaque: 'Foz do Rio Potengi',
        icone: '🏖️',
      },
      {
        nome: 'Maior Cajueiro do Mundo em Pirangi',
        categoria: 'outro',
        descricao: 'Fenômeno botânico monumental com copa gigante cobrindo cerca de 8.500 m².',
        destaque: 'Maior Cajueiro do Mundo em Pirangi',
        icone: '📍',
      },
      {
        nome: 'Dunas de Genipabu',
        categoria: 'natureza',
        descricao:
          'Complexo de dunas móveis, lagoas de águas mornas e passeios de buggy ecológico.',
        destaque: 'Lagoa de Pitangui',
        icone: '🏖️',
      },
      {
        nome: 'Parque das Dunas',
        categoria: 'mirante',
        descricao:
          'Segunda maior reserva ambiental urbana do Brasil com trilhas na Mata Atlântica.',
        destaque: 'Bosque dos Namorados',
        icone: '🌿',
      },
    ],
    gastronomia: [
      {
        nome: 'Restaurante Camarões Potiguar Ponta Negra',
        categoria: 'gastronomia',
        descricao: 'Consagrado polo gastronômico focado em frutos do mar e receitas exclusivas.',
        destaque: 'Camarão Potiguar',
        icone: '🍽️',
      },
      {
        nome: 'Restaurante Mangai Natal',
        categoria: 'gastronomia',
        descricao: 'Tradição nordestina com farto buffet sertanejo, baião e queijos típicos.',
        destaque: 'Comida Nordestina',
        icone: '🍽️',
      },
      {
        nome: 'Tábua de Carne Via Costeira',
        categoria: 'gastronomia',
        descricao: 'Carnes nobres grelhadas na brasa com vista privilegiada para o mar de Natal.',
        destaque: 'Carne de Sol na Nata',
        icone: '🍽️',
      },
      {
        nome: 'Bar do Caranguejo Ponta Negra',
        categoria: 'gastronomia',
        descricao: 'Ambiente descontraído à beira-mar com caranguejos e cervejas artesanais.',
        destaque: 'Caranguejo Fresco',
        icone: '🍸',
      },
      {
        nome: 'Casa de Taipa Tapiocaria',
        categoria: 'gastronomia',
        descricao: 'Espaço cultural e gastronômico com tapiocas crocantes e cuscuz sertanejo.',
        destaque: 'Cuscuz',
        icone: '🍽️',
      },
    ],
  },
  gramado: {
    pontos: [
      {
        nome: 'Lago Negro',
        categoria: 'natureza',
        descricao: 'Espelho d’água rodeado de pinheiros trazidos da Floresta Negra alemã.',
        icone: '🌲',
      },
      {
        nome: 'Rua Coberta e Palácio dos Festivais',
        categoria: 'historico',
        descricao: 'Coração gastronômico e cultural que abriga o Festival de Cinema.',
        icone: '🎬',
      },
      {
        nome: 'Mini Mundo',
        categoria: 'cultura',
        descricao: 'Parque ao ar livre com réplicas fiéis de edifícios do mundo em miniatura.',
        icone: '🏡',
      },
      {
        nome: 'Snowland',
        categoria: 'outro',
        descricao: 'Primeiro parque de neve coberto das Américas com pista de patinação.',
        icone: '❄️',
      },
    ],
    gastronomia: [
      {
        nome: 'Sequência de Fondue Tradicional',
        descricao: 'Queijos suíços, carnes na pedra e chocolate de Gramado com frutas.',
        icone: '🫕',
      },
      {
        nome: 'Café Colonial Serrano',
        descricao: 'Farto banquete colonial com pães caseiros, cucas, queijos e vinhos.',
        icone: '🥐',
      },
      {
        nome: 'Galeto Al Primo Canto',
        descricao: 'Franguinho marinado em ervas e assado na brasa, servido com polenta.',
        icone: '🍗',
      },
    ],
  },
  'rio de janeiro': {
    pontos: [
      {
        nome: 'Cristo Redentor no Corcovado',
        categoria: 'mirante',
        descricao: 'Monumento icônico no topo da Floresta da Tijuca com vista panorâmica.',
        icone: '⛰️',
      },
      {
        nome: 'Pão de Açúcar e Bondinho',
        categoria: 'mirante',
        descricao: 'Passeio aéreo entre a Praia Vermelha e os morros da Baía de Guanabara.',
        icone: '🚠',
      },
      {
        nome: 'Jardim Botânico do Rio',
        categoria: 'natureza',
        descricao: 'Reserva histórica criada em 1808 com alamedas de palmeiras imperiais.',
        icone: '🌴',
      },
      {
        nome: 'Orla de Ipanema e Arpoador',
        categoria: 'natureza',
        descricao: 'Calçadão célebre da Zona Sul e pedra do Arpoador para aplaudir o sol.',
        icone: '🏖️',
      },
    ],
    gastronomia: [
      {
        nome: 'Feijoada Completa Carioca',
        descricao: 'Feijão preto com carnes nobres, couve mineira, farofa e laranja.',
        icone: '🍲',
      },
      {
        nome: 'Biscoito Globo e Mate Gelado',
        descricao: 'Parceiros inseparáveis na areia da praia, tradição do cotidiano carioca.',
        icone: '🥯',
      },
      {
        nome: 'Filé à Osvaldo Aranha',
        descricao: 'Filé mignon alto coberto por alho frito, batatas portuguesas e farofa.',
        icone: '🥩',
      },
    ],
  },
  'são paulo': {
    pontos: [
      {
        nome: 'Parque Ibirapuera',
        categoria: 'natureza',
        descricao: 'Maior refúgio verde urbano da capital paulista com marquise de Niemeyer.',
        icone: '🌳',
      },
      {
        nome: 'Avenida Paulista e MASP',
        categoria: 'cultura',
        descricao: 'Museu com vão livre de Lina Bo Bardi e coração pulsante da cidade.',
        icone: '🎨',
      },
      {
        nome: 'Beco do Batman na Vila Madalena',
        categoria: 'cultura',
        descricao: 'Galeria aberta de arte urbana e grafite com atmosfera boêmia.',
        icone: '🖌️',
      },
      {
        nome: 'Mercado Municipal Paulistano',
        categoria: 'gastronomia',
        descricao: 'Prédio histórico de vitrais coloridos com frutas raras e iguarias.',
        icone: '🏬',
      },
    ],
    gastronomia: [
      {
        nome: 'Sanduíche de Mortadela do Mercadão',
        descricao: 'Mais de 300g de fatias generosas servidas quentinhas em pão francês.',
        icone: '🥪',
      },
      {
        nome: 'Pizza Paulistana de Longa Fermentação',
        descricao: 'Herança italiana das cantinas tradicionais do Bixiga e Mooca.',
        icone: '🍕',
      },
      {
        nome: 'Virado à Paulista Tradicional',
        descricao: 'Prato colonial tombado com tutu de feijão, bisteca, couve e ovo frito.',
        icone: '🍛',
      },
    ],
  },
  'ouro preto': {
    pontos: [
      {
        nome: 'Igreja de São Francisco de Assis',
        categoria: 'historico',
        descricao: 'Obra-prima de Aleijadinho e pintura no teto pelo mestre Ataíde.',
        icone: '⛪',
      },
      {
        nome: 'Praça Tiradentes e Museu da Inconfidência',
        categoria: 'historico',
        descricao: 'Palco principal da história colonial brasileira no topo da colina.',
        icone: '🏛️',
      },
      {
        nome: 'Mina da Passagem',
        categoria: 'natureza',
        descricao: 'Maior mina de ouro aberta a visitação com descida em carrinho sobre trilhos.',
        icone: '⛏️',
      },
      {
        nome: 'Mirante do Morro São Sebastião',
        categoria: 'mirante',
        descricao: 'Vista deslumbrante de todo o vale de montanhas e telhados coloniais.',
        icone: '🌄',
      },
    ],
    gastronomia: [
      {
        nome: 'Tutu de Feijão com Torresmo Pururuca',
        descricao: 'Clássico mineiro batido com farinha de mandioca e temperos da roça.',
        icone: '🍲',
      },
      {
        nome: 'Frango com Quiabo e Angu',
        descricao: 'Prato afetivo servido em panela de pedra-sabão bem fumegante.',
        icone: '🍗',
      },
      {
        nome: 'Doce de Leite com Queijo Minas',
        descricao: 'Sobremesa de fazenda com doce cozido lentamente em tacho de cobre.',
        icone: '🧀',
      },
    ],
  },
};

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Resolve e monta a lista de atrativos turísticos e gastronomia do destino.
 * Utiliza o catálogo pré-cadastrado ou compõe uma lista dinâmica contextual
 * caso a cidade não possua cadastro fixo.
 */
export function obterAtrativosPorDestino(
  destinoNome: string,
  _perfis: PerfilViajante[] = [],
): AtrativoTuristico[] {
  const cidadeNormalizada = normalizar(destinoNome.split('-')[0].split('/')[0]);

  // Busca correspondência direta ou parcial no catálogo
  let correspondencia: DestinoAtrativosMap | undefined = CATALOGO_DESTINOS[cidadeNormalizada];

  if (!correspondencia) {
    for (const [chave, dados] of Object.entries(CATALOGO_DESTINOS)) {
      if (cidadeNormalizada.includes(chave) || chave.includes(cidadeNormalizada)) {
        correspondencia = dados;
        break;
      }
    }
  }

  const atrativos: AtrativoTuristico[] = [];

  if (correspondencia) {
    correspondencia.pontos.forEach((ponto, index) => {
      atrativos.push({
        id: `atrativo-${index + 1}`,
        nome: ponto.nome,
        categoria: ponto.categoria,
        descricao: ponto.descricao,
        destaque: ponto.destaque || ponto.nome,
        linkMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ponto.nome}, ${destinoNome}`)}`,
        icone: ponto.icone,
        visitado: false,
      });
    });

    correspondencia.gastronomia.forEach((gastro, index) => {
      atrativos.push({
        id: `gastro-${index + 1}`,
        nome: gastro.nome,
        categoria: 'gastronomia',
        descricao: gastro.descricao,
        destaque: gastro.destaque || gastro.nome,
        linkMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${gastro.nome}, ${destinoNome}`)}`,
        icone: gastro.icone,
        visitado: false,
      });
    });

    return atrativos;
  }

  // Fallback dinâmico para cidades sem cadastro prévio
  const nomeLimpo = destinoNome.split('-')[0].trim() || 'Destino';

  atrativos.push(
    {
      id: 'atrativo-1',
      nome: `Centro Histórico e Praça Central de ${nomeLimpo}`,
      categoria: 'historico',
      descricao: `Patrimônio cultural e arquitetônico marcante com edifícios preservados de ${nomeLimpo}.`,
      destaque: `Casario Histórico de ${nomeLimpo}`,
      linkMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Centro Histórico, ${destinoNome}`)}`,
      icone: '🏛️',
      visitado: false,
    },
    {
      id: 'atrativo-2',
      nome: `Mirante e Parque Ecológico de ${nomeLimpo}`,
      categoria: 'natureza',
      descricao: `Trilhas arborizadas e vista panorâmica privilegiada da região e seus arredores.`,
      destaque: `Vista Panorâmica da Cidade`,
      linkMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Parque Ecológico, ${destinoNome}`)}`,
      icone: '🌿',
      visitado: false,
    },
    {
      id: 'atrativo-3',
      nome: `Mercado Municipal e Feira de Artesanato`,
      categoria: 'cultura',
      descricao: `Ponto de encontro da comunidade com peças de artistas locais e artigos típicos.`,
      destaque: `Artesanato Regional`,
      linkMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Mercado Municipal, ${destinoNome}`)}`,
      icone: '🎨',
      visitado: false,
    },
    {
      id: 'gastro-1',
      nome: `Sabores e Pratos Regionais de ${nomeLimpo}`,
      categoria: 'gastronomia',
      descricao: `Culinária artesanal autêntica valorizando ingredientes frescos dos produtores locais.`,
      destaque: `Prato do Dia Tradicional`,
      linkMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Restaurante Regional, ${destinoNome}`)}`,
      icone: '🍲',
      visitado: false,
    },
    {
      id: 'gastro-2',
      nome: `Sobremesas e Cafés Tradicionais da Terra`,
      categoria: 'gastronomia',
      descricao: `Doces caseiros e cafeterias acolhedoras recomendados para o fim de tarde.`,
      destaque: `Café com Bolo Caseiro`,
      linkMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Cafeteria, ${destinoNome}`)}`,
      icone: '☕',
      visitado: false,
    },
  );

  return atrativos;
}

export function obterPontosTuristicosPorDestino(
  destinoNome: string,
  perfis: PerfilViajante[] = [],
): AtrativoTuristico[] {
  return obterAtrativosPorDestino(destinoNome, perfis).filter(
    (item) => item.categoria !== 'gastronomia',
  );
}

export function obterGastronomiaPorDestino(
  destinoNome: string,
  perfis: PerfilViajante[] = [],
): AtrativoTuristico[] {
  return obterAtrativosPorDestino(destinoNome, perfis).filter(
    (item) => item.categoria === 'gastronomia',
  );
}
