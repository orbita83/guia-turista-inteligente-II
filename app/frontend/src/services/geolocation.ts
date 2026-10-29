import type { MunicipioOption, SugestaoDestino } from '../types/domain';

export interface DestinoTuristicoCoordenada extends MunicipioOption {
  latitude: number;
  longitude: number;
}

export interface CoordenadasGps {
  latitude: number;
  longitude: number;
}

/** Raio médio da Terra em quilômetros */
const RAIO_TERRA_KM = 6371;

/** Limiar geográfico de Haversine previsto na apostila (>400 km em linha reta). */
export const DISTANCIA_MINIMA_GEOGRAFICA_KM = 400;

/**
 * Catálogo de polos turísticos brasileiros com coordenadas geográficas aproximadas.
 */
export const DESTINOS_TURISTICOS: readonly DestinoTuristicoCoordenada[] = [
  // Nordeste
  { nome: 'Lençóis', uf: 'BA', latitude: -12.5619, longitude: -41.3892 },
  { nome: 'Porto Seguro', uf: 'BA', latitude: -16.4497, longitude: -39.0647 },
  { nome: 'Salvador', uf: 'BA', latitude: -12.9777, longitude: -38.5016 },
  { nome: 'Ilhéus', uf: 'BA', latitude: -14.7936, longitude: -39.0463 },
  { nome: 'Jijoca de Jericoacoara', uf: 'CE', latitude: -2.7937, longitude: -40.5147 },
  { nome: 'Fortaleza', uf: 'CE', latitude: -3.7319, longitude: -38.5267 },
  { nome: 'Tibau do Sul', uf: 'RN', latitude: -6.2294, longitude: -35.0906 },
  { nome: 'Natal', uf: 'RN', latitude: -5.7945, longitude: -35.211 },
  { nome: 'Maragogi', uf: 'AL', latitude: -9.0122, longitude: -35.2225 },
  { nome: 'Maceió', uf: 'AL', latitude: -9.6658, longitude: -35.735 },
  { nome: 'Ipojuca', uf: 'PE', latitude: -8.3997, longitude: -35.0639 },
  { nome: 'Recife', uf: 'PE', latitude: -8.0476, longitude: -34.877 },
  { nome: 'João Pessoa', uf: 'PB', latitude: -7.1195, longitude: -34.845 },
  { nome: 'Aracaju', uf: 'SE', latitude: -10.9472, longitude: -37.0731 },
  { nome: 'Barreirinhas', uf: 'MA', latitude: -2.7486, longitude: -42.8258 },
  { nome: 'São Luís', uf: 'MA', latitude: -2.5307, longitude: -44.3068 },

  // Sudeste
  { nome: 'Ouro Preto', uf: 'MG', latitude: -20.3856, longitude: -43.5036 },
  { nome: 'Tiradentes', uf: 'MG', latitude: -21.1106, longitude: -44.1786 },
  { nome: 'Diamantina', uf: 'MG', latitude: -18.2439, longitude: -43.6003 },
  { nome: 'Capitólio', uf: 'MG', latitude: -20.6144, longitude: -46.0508 },
  { nome: 'Belo Horizonte', uf: 'MG', latitude: -19.9167, longitude: -43.9345 },
  { nome: 'Paraty', uf: 'RJ', latitude: -23.2178, longitude: -44.7131 },
  { nome: 'Petrópolis', uf: 'RJ', latitude: -22.505, longitude: -43.1789 },
  { nome: 'Armação dos Búzios', uf: 'RJ', latitude: -22.7539, longitude: -41.8869 },
  { nome: 'Rio de Janeiro', uf: 'RJ', latitude: -22.9068, longitude: -43.1729 },
  { nome: 'Campos do Jordão', uf: 'SP', latitude: -22.7394, longitude: -45.5914 },
  { nome: 'Ilhabela', uf: 'SP', latitude: -23.7781, longitude: -45.3581 },
  { nome: 'Ubatuba', uf: 'SP', latitude: -23.4339, longitude: -45.0834 },
  { nome: 'São Paulo', uf: 'SP', latitude: -23.5505, longitude: -46.6333 },
  { nome: 'Guarapari', uf: 'ES', latitude: -20.6706, longitude: -40.4981 },
  { nome: 'Vitória', uf: 'ES', latitude: -20.3155, longitude: -40.3128 },

  // Sul
  { nome: 'Foz do Iguaçu', uf: 'PR', latitude: -25.5478, longitude: -54.5882 },
  { nome: 'Curitiba', uf: 'PR', latitude: -25.4284, longitude: -49.2733 },
  { nome: 'Florianópolis', uf: 'SC', latitude: -27.5954, longitude: -48.548 },
  { nome: 'Balneário Camboriú', uf: 'SC', latitude: -26.9926, longitude: -48.6347 },
  { nome: 'Blumenau', uf: 'SC', latitude: -26.9194, longitude: -49.0661 },
  { nome: 'Gramado', uf: 'RS', latitude: -29.3788, longitude: -50.8734 },
  { nome: 'Canela', uf: 'RS', latitude: -29.3653, longitude: -50.8122 },
  { nome: 'Bento Gonçalves', uf: 'RS', latitude: -29.1714, longitude: -51.5186 },

  // Centro-Oeste
  { nome: 'Bonito', uf: 'MS', latitude: -21.1215, longitude: -56.4819 },
  { nome: 'Corumbá', uf: 'MS', latitude: -19.0097, longitude: -57.6533 },
  { nome: 'Caldas Novas', uf: 'GO', latitude: -17.7444, longitude: -48.6253 },
  { nome: 'Pirenópolis', uf: 'GO', latitude: -15.8524, longitude: -48.9592 },
  { nome: 'Alto Paraíso de Goiás', uf: 'GO', latitude: -14.1332, longitude: -47.5137 },
  { nome: 'Chapada dos Guimarães', uf: 'MT', latitude: -15.4606, longitude: -55.7497 },
  { nome: 'Brasília', uf: 'DF', latitude: -15.7975, longitude: -47.8919 },

  // Norte
  { nome: 'Mateiros', uf: 'TO', latitude: -10.5397, longitude: -46.4194 },
  { nome: 'Palmas', uf: 'TO', latitude: -10.2491, longitude: -48.3243 },
  { nome: 'Santarém', uf: 'PA', latitude: -2.4431, longitude: -54.7083 },
  { nome: 'Belém', uf: 'PA', latitude: -1.4558, longitude: -48.4902 },
  { nome: 'Manaus', uf: 'AM', latitude: -3.119, longitude: -60.0217 },
];

/**
 * Converte graus para radianos.
 */
function paraRadianos(graus: number): number {
  return (graus * Math.PI) / 180;
}

/**
 * Calcula a distância geodésica entre duas coordenadas geográficas
 * utilizando a fórmula de Haversine (em quilômetros).
 *
 * d = 2R · atan2(√a, √(1-a))
 * onde a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)
 */
export function calcularHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = paraRadianos(lat2 - lat1);
  const dLon = paraRadianos(lon2 - lon1);

  const lat1Rad = paraRadianos(lat1);
  const lat2Rad = paraRadianos(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(RAIO_TERRA_KM * c);
}

/**
 * Solicita as coordenadas geográficas do usuário via Geolocation API do navegador.
 * Possui timeout configurado e tratamento amigável de recusa ou indisponibilidade.
 */
export async function obterCoordenadasNavegador(): Promise<CoordenadasGps> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocalização não é suportada pelo seu navegador.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(
              new Error(
                'Permissão de localização negada. O preenchimento manual continua disponível.',
              ),
            );
            break;
          case error.POSITION_UNAVAILABLE:
            reject(
              new Error('Sinal de GPS indisponível. O preenchimento manual continua disponível.'),
            );
            break;
          case error.TIMEOUT:
            reject(
              new Error(
                'Tempo esgotado ao buscar localização. O preenchimento manual continua disponível.',
              ),
            );
            break;
          default:
            reject(
              new Error(
                'Não foi possível obter sua localização. O preenchimento manual continua disponível.',
              ),
            );
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  });
}

/**
 * Filtra e seleciona os destinos turísticos mais próximos da localização do usuário
 * que atendem ao limiar geográfico aproximado (> 400 km em linha reta).
 *
 * @param latitude Latitude da localização do usuário
 * @param longitude Longitude da localização do usuário
 * @param limite Quantidade máxima de sugestões a retornar (padrão: 4)
 * @param distanciaMinimaKm Distância mínima em km (padrão: 400 km)
 */
export function obterSugestoesDestino(
  latitude: number,
  longitude: number,
  limite = 4,
  distanciaMinimaKm = DISTANCIA_MINIMA_GEOGRAFICA_KM,
): SugestaoDestino[] {
  const destinosComDistancia = DESTINOS_TURISTICOS.map((destino) => {
    const distanciaKm = calcularHaversineKm(
      latitude,
      longitude,
      destino.latitude,
      destino.longitude,
    );
    return {
      nome: destino.nome,
      uf: destino.uf,
      distanciaKm,
    };
  });

  return destinosComDistancia
    .filter((d) => d.distanciaKm >= distanciaMinimaKm)
    .sort((a, b) => a.distanciaKm - b.distanciaKm)
    .slice(0, limite);
}

/**
 * Identifica o município/polo mais próximo da coordenada do usuário
 * (sem restrição de distância mínima), útil para detecção de ponto de partida/origem.
 */
export function identificarCidadeMaisProxima(latitude: number, longitude: number): SugestaoDestino {
  let maisProximo: SugestaoDestino | null = null;

  for (const destino of DESTINOS_TURISTICOS) {
    const distanciaKm = calcularHaversineKm(
      latitude,
      longitude,
      destino.latitude,
      destino.longitude,
    );
    if (!maisProximo || distanciaKm < maisProximo.distanciaKm) {
      maisProximo = {
        nome: destino.nome,
        uf: destino.uf,
        distanciaKm,
      };
    }
  }

  if (!maisProximo) {
    throw new Error('Nenhum destino catalogado encontrado.');
  }

  return maisProximo;
}
