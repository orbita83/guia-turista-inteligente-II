# Serviço de Autonomia e Paradas Estratégicas (Postos e Eletropostos)

## 1. Visão Geral e Responsabilidade

O serviço de autonomia e postos (`app/backend/app/services/postos_service.py`) é de responsabilidade do **Aluno 3 (Data & Altimetry Engineer)**. Sua finalidade é calcular o consumo de combustível e energia de veículos a combustão e elétricos ao longo da geometria rodoviária real e projetar matematicamente as paradas estratégicas necessárias para reabastecimento ou recarga, respeitando a reserva crítica de segurança de aproximadamente **18%**.

O serviço opera de forma desacoplada, síncrona e assíncrona (`calcular_paradas_async`), preparado para ser integrado pelo **Aluno 2 (Backend Core Engineer)** via concorrência com `asyncio.gather()` no endpoint `/planejar` (Issue #23).

---

## 2. Unidades e Fórmulas de Autonomia

O serviço opera com unidades de medida explícitas e consistentes no Sistema Internacional e convenções automotivas brasileiras:

| Grandeza | Unidade | Símbolo / Notação |
| --- | --- | --- |
| Capacidade do Tanque (Combustão) | Litros | $L$ |
| Consumo Médio (Combustão) | Quilômetros por litro | $km/L$ |
| Capacidade da Bateria (Elétrico) | Quilowatt-hora | $kWh$ |
| Eficiência Energética (Elétrico) | Quilômetros por quilowatt-hora | $km/kWh$ |
| Distância Rodoviária | Quilômetros e Metros | $km$ e $m$ |
| Nível do Tanque / Bateria | Percentual | $\%$ ($0{,}0$ a $100{,}0\%$) |
| Penalização Altimétrica de Relevo | Percentual | $\%$ ($\ge 0{,}0\%$) |

### 2.1. Fórmulas de Veículos a Combustão

$$\text{autonomia\_maxima\_km} = \text{capacidade\_tanque\_litros} \times \text{consumo\_km\_por\_litro}$$

$$\text{autonomia\_efetiva\_km} = \text{autonomia\_maxima\_km} \times \left(\frac{\text{nivel\_inicial\_percent}}{100{,}0}\right)$$

### 2.2. Fórmulas de Veículos Elétricos (BEV)

$$\text{autonomia\_maxima\_km} = \text{capacidade\_bateria\_kwh} \times \text{eficiencia\_km\_por\_kwh}$$

$$\text{autonomia\_efetiva\_km} = \text{autonomia\_maxima\_km} \times \left(\frac{\text{nivel\_inicial\_percent}}{100{,}0}\right)$$

### 2.3. Ajuste Opcional por Topografia e Relevo

Quando fornecido o índice de penalização topográfica ($\text{penalizacao\_relevo\_percent} \ge 0{,}0\%$), calculado a partir do desnível pelo serviço de altimetria (`DadosConsumoRelevo`):

$$\text{fator\_relevo} = 1{,}0 + \frac{\text{penalizacao\_relevo\_percent}}{100{,}0}$$

$$\text{autonomia\_ajustada\_km} = \frac{\text{autonomia\_nominal\_km}}{\text{fator\_relevo}}$$

---

## 3. Reserva Crítica e Estratégia de Projeção de Paradas

### 3.1. Reserva Crítica de Segurança (~18%)

O serviço adota uma **reserva crítica referencial de 18%** (`reserva_critica_percent = 18.0`).
- Nenhum trecho planejado permite que o veículo opere ou chegue a um destino ou parada com nível residual inferior a 18%.
- Se o veículo iniciar a viagem com nível $\le 18{,}0\%$, a solução é imediatamente marcada como insegura (`solucao_segura = False`, status `RESERVA_CRITICA_VIOLADA`).

### 3.2. Margem Operacional de Parada (~22%)

Para que a parada seja realizada **antes** de violar a reserva crítica de 18% (garantindo margem contra tráfego, ventos e ar condicionado), o algoritmo adota por padrão uma margem de planejamento de **22%** (`margem_seguranca_percent = 22.0`):

$$\Delta N_{\text{trecho}} = N_{\text{atual}} - \text{margem\_seguranca\_percent}$$

$$D_{\text{alcance\_trecho\_km}} = \text{autonomia\_maxima\_km} \times \left(\frac{\Delta N_{\text{trecho}}}{100{,}0}\right)$$

### 3.3. Política de Reabastecimento e Recarga (`PoliticaReabastecimento`)

- **Veículos a Combustão:** Tanque completo até **100%** (`nivel_reabastecimento_combustao_percent = 100.0`).
- **Veículos Elétricos (BEV):** Meta padrão de recarga rápida DC até **80%** (`nivel_recarga_eletrico_percent = 80.0`), otimizando a curva de carga e evitando o estrangulamento de potência acima de 80%, ou até **100%** configurável.

---

## 4. Geometria Rodoviária e Posicionamento sobre a Rota

1. **Recepção da Geometria:** Aceita séries de coordenadas reais do trajeto:
   - Formato de tuplas/listas: `[(latitude, longitude), ...]`.
   - Formato de objetos: `[{"latitude": -8.05, "longitude": -34.88}, ...]`.
   - Formato OSRM / GeoJSON: `[[longitude, latitude], ...]`.
2. **Normalização do Formato (`formato_geometria`):** O parâmetro aceita `"auto"` (padrão), `"latlon"` ou `"lonlat"`.
   - `"latlon"` força a leitura nativa `(latitude, longitude)`.
   - `"lonlat"` força a conversão de OSRM/GeoJSON `[longitude, latitude]`.
   - `"auto"` converte automaticamente quando a rota é inequivocamente brasileira em formato OSRM, isto é, a leitura como `(lon, lat)` cabe nos limites do Brasil e a leitura como `(lat, lon)` não cabe. Para rotas fora desse recorte ou casos ambíguos, informe o formato explicitamente.
   - Formato desconhecido retorna `GEOMETRIA_INVALIDA` e não gera coordenadas fictícias.
3. **Cálculo de Distâncias Acumuladas:** Utiliza a fórmula geodésica de **Haversine** ($R_{Terra} = 6.371.000\text{ m}$) sobre a sequência de segmentos da rodovia.
4. **Interpolação Linear de Precisão:** Cada parada em distância acumulada $D_p$ é localizada no segmento rodoviário $[P_i, P_{i+1}]$ onde $d_i \le D_p \le d_{i+1}$:
   $$t = \frac{D_p - d_i}{d_{i+1} - d_i}$$
   $$\text{latitude}_p = \text{lat}_i + t \cdot (\text{lat}_{i+1} - \text{lat}_i)$$
   $$\text{longitude}_p = \text{lon}_i + t \cdot (\text{lon}_{i+1} - \text{lon}_i)$$
5. **Garantias Geométricas:**
   - As coordenadas das paradas residem estritamente sobre a linha rodoviária fornecida.
   - A ordem física da viagem é preservada ($0 < D_1 < D_2 < \dots < D_{\text{total}}$).
   - Não são traçadas linhas retas artificiais entre origem e destino.
   - Em caso de geometria inválida ou ausente, **não são inventadas coordenadas fictícias**.

---

## 5. Distinção entre Ponto Projetado e Estabelecimento Verificado

Uma exigência arquitetural central da Issue #28 é a distinção clara entre projeção teórica e correspondência física:

| Atributo | Ponto Projetado (Issue #28) | Estabelecimento Verificado (Provedor Externo) |
| --- | --- | --- |
| **Conceito** | Ponto calculado matematicamente sobre a rota onde o nível do veículo atinge a margem de parada. | Estabelecimento físico comercial (posto de bandeira ou estação de recarga) identificado em base de dados externa. |
| `eh_ponto_projetado` | `True` | `False` |
| `estabelecimento_verificado` | `False` (garantido) | `True` |
| `detalhes_estabelecimento` | `None` | Metadados (bandeira, conectores, disponibilidade). |
| `origem` | `OrigemParada.PROJETADO` | `OrigemParada.VERIFICADO` |
| `nome` | Ex.: `"Ponto Projetado 1 (Posto de Combustível - km 390.0)"` | Ex.: `"Posto Ipiranga Rota 101 km 390"` |

> **Nota de Integridade:** Sob nenhuma hipótese os pontos calculados são divulgados como postos confirmados. A integração com APIs externas de estabelecimentos permanece fora do escopo desta issue.

---

## 6. Contratos de Dados (Pydantic v2)

Definidos em `app/backend/app/schemas/roteiros.py`:

### 6.1. Entrada: Veículos e Políticas

```python
class VeiculoCombustao(BaseModel):
    capacidade_tanque_litros: float = Field(..., gt=0.0)
    consumo_km_por_litro: float = Field(..., gt=0.0)
    nivel_inicial_percent: float = Field(default=100.0, ge=0.0, le=100.0)

class VeiculoEletrico(BaseModel):
    capacidade_bateria_kwh: float = Field(..., gt=0.0)
    eficiencia_km_por_kwh: float = Field(..., gt=0.0)
    nivel_inicial_percent: float = Field(default=100.0, ge=0.0, le=100.0)

class ParametrosVeiculo(BaseModel):
    propulsao: TipoPropulsao = TipoPropulsao.COMBUSTAO
    capacidade_tanque_l: float | None = None
    consumo_km_l: float | None = None
    capacidade_bateria_kwh: float | None = None
    eficiencia_km_kwh: float | None = None
    nivel_inicial_percent: float = 100.0

class PoliticaReabastecimento(BaseModel):
    reserva_critica_percent: float = 18.0
    margem_seguranca_percent: float = 22.0
    nivel_reabastecimento_combustao_percent: float = 100.0
    nivel_recarga_eletrico_percent: float = 80.0
```

### 6.2. Saída: `ParadaProjetada` e `ResultadoAutonomia`

```python
class ParadaProjetada(BaseModel):
    id: str
    ordem: int
    nome: str
    tipo: TipoParada  # combustivel | recarga
    distancia_km: float
    distancia_m: float
    coordenadas: Coordenada  # latitude, longitude
    reserva_estimada_percent: float
    autonomia_restante_km: float
    nivel_pos_parada_percent: float
    origem: OrigemParada = OrigemParada.PROJETADO
    eh_ponto_projetado: bool = True
    estabelecimento_verificado: bool = False
    detalhes_estabelecimento: dict[str, Any] | None = None
    descricao: str | None = None

class ResultadoAutonomia(BaseModel):
    sucesso: bool
    solucao_segura: bool
    status: StatusAutonomia  # SUCESSO, SEM_PARADAS_NECESSARIAS, PARADAS_NECESSARIAS, RESERVA_CRITICA_VIOLADA, AUTONOMIA_INSUFICIENTE, PARAMETROS_INVALIDOS, GEOMETRIA_INVALIDA
    mensagem: str | None
    propulsao: TipoPropulsao | None
    autonomia_maxima_km: float | None
    autonomia_efetiva_km: float | None
    distancia_total_km: float | None
    distancia_total_m: float | None
    reserva_critica_percent: float = 18.0
    total_paradas: int
    paradas: list[ParadaProjetada]
    reserva_final_percent: float | None
    autonomia_final_km: float | None
    politica_reabastecimento: PoliticaReabastecimento
    estabelecimentos_confirmados: bool = False
    observacao: str | None
```

---

## 7. Tratamento de Erros e Casos Limite

| Cenário de Entrada / Falha | Status Retornado | Solução Segura | Comportamento |
| --- | --- | --- | --- |
| Parâmetros inválidos (capacidade $\le 0$, consumo $\le 0$, NaN) | `PARAMETROS_INVALIDOS` | `False` | Rejeição imediata sem cálculo. |
| Nível inicial fora de $[0, 100]$ | `PARAMETROS_INVALIDOS` | `False` | Rejeição sem produzir estimativas ilusórias. |
| Geometria vazia ou $< 2$ pontos | `GEOMETRIA_INVALIDA` | `False` | Não inventa rota em linha reta. |
| Coordenadas fora de limites geográficos | `GEOMETRIA_INVALIDA` | `False` | Rejeição estrita de latitudes/longitudes corrompidas. |
| Nível inicial $\le$ reserva crítica ($18\%$) | `RESERVA_CRITICA_VIOLADA` | `False` | Alerta que não é seguro iniciar na rodovia em reserva. |
| Viagem curta (alcance suficiente) | `SEM_PARADAS_NECESSARIAS` | `True` | 0 paradas; calcula nível de chegada exato. |
| Chegada no limite exato ($18{,}0\%$) | `SEM_PARADAS_NECESSARIAS` | `True` | Viagem completada no limiar de segurança. |
| Chegada violando reserva ($< 18{,}0\%$) | `PARADAS_NECESSARIAS` | `True` | Posiciona parada na margem segura antes do limite. |
| Viagem longa interestadual ($> 1000\text{ km}$) | `PARADAS_NECESSARIAS` | `True` | Múltiplas paradas ordenadas e crescentes. |
| Autonomia ínfima / percurso inviável | `AUTONOMIA_INSUFICIENTE` | `False` | Detecta inviabilidade operacional e sinaliza motivo. |

---

## 8. Orientações para Integração pelo Aluno 2 (Endpoint `/planejar`)

No endpoint `/planejar` (`app/backend/app/routers/roteiros.py`), o **Aluno 2** deve orquestrar a rota rodoviária (Issue #19), o perfil altimétrico (Issue #27) e as paradas por autonomia (Issue #28).

### Exemplo de Consumo no Backend:

```python
from app.services.postos_service import PostosService
from app.schemas.roteiros import PoliticaReabastecimento

postos_service = PostosService(
    politica_padrao=PoliticaReabastecimento(
        reserva_critica_percent=18.0,
        margem_seguranca_percent=22.0,
    )
)

# Chamada assíncrona concorrente:
resultado_postos = await postos_service.calcular_paradas_async(
    geometria=geometria_osrm,  # Lista de coordenadas obtidas do OSRM
    veiculo=payload.veiculo,   # Dados do veículo enviados pelo frontend
    penalizacao_relevo_percent=perfil_altimetrico.dados_consumo.penalizacao_consumo_estimada_percent if perfil_altimetrico.dados_consumo else 0.0,
)

if not resultado_postos.solucao_segura:
    logger.warning("Alerta de autonomia: %s", resultado_postos.mensagem)
```

---

## 9. Execução dos Testes Automatizados e Qualidade

Execução da suíte de 49 testes automatizados do serviço de autonomia com `uv`:

```powershell
uv run --with-requirements requirements.lock python -m pytest tests/test_postos_service.py -v
```

Verificação estática de tipos com `mypy`:

```powershell
uv run --with-requirements requirements.lock python -m mypy app/schemas/roteiros.py app/services/postos_service.py tests/test_postos_service.py
```

Validação de formatação e conformidade com `ruff`:

```powershell
python -m ruff check app/backend/app/schemas/roteiros.py app/backend/app/services/postos_service.py app/backend/tests/test_postos_service.py
```
