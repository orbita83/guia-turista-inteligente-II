# Serviço de Altimetria e Perfil Topográfico (Open-Elevation)

## 1. Visão Geral e Responsabilidade

O serviço de altimetria (`app/backend/app/services/altimetria_service.py`) é de responsabilidade do **Aluno 3 (Data & Altimetry Engineer)**. Sua finalidade é consultar o provedor **Open-Elevation** utilizando a geometria rodoviária real do percurso (fornecida pelo OSRM) e produzir um perfil topográfico confiável e estruturado para o backend e a interface do usuário.

O serviço opera de forma assíncrona, não-bloqueante e desacoplada do framework web, preparando os dados necessários para o cálculo posterior de consumo de combustível, autonomia e custos (Issue #16).

---

## 2. Contratos de Entrada e Saída

### 2.1. Entrada (`geometria`)

O serviço aceita a geometria rodoviária real nos formatos:
- Lista de tuplas: `[(latitude, longitude), ...]`
- Lista de dicionários: `[{"latitude": -8.05, "longitude": -34.90}, ...]` ou `[{"lat": ..., "lon": ...}]`
- Coordenadas OSRM/GeoJSON: `[[longitude, latitude], ...]`, normalizáveis pela função `converter_geometria_osrm`.

**Regras de Validação:**
- Pelo menos 2 coordenadas geográficas válidas são necessárias para definir um percurso.
- Intervalos válidos: Latitude em `[-90.0, +90.0]` e Longitude em `[-180.0, +180.0]`.
- Valores não finitos (`NaN`, `Inf`) ou não numéricos são rejeitados defensivamente com `GeometriaInvalidaError` ou `StatusAltimetria.GEOMETRIA_INVALIDA`.
- Não cria linhas artificiais em linha reta entre origem e destino se a geometria for inválida.

### 2.2. Saída (`PerfilTopografico`)

Modelo Pydantic v2 estruturado (`app/backend/app/schemas/roteiros.py`):

```python
class PerfilTopografico(BaseModel):
    sucesso: bool
    status: StatusAltimetria  # SUCESSO, PARCIAL, INDISPONIVEL, COTA_EXCEDIDA, ERRO_PROVEDOR, GEOMETRIA_INVALIDA
    mensagem: str | None
    altitude_minima_m: float | None
    altitude_maxima_m: float | None
    ganho_elevacao_m: float | None
    perda_elevacao_m: float | None
    desnivel_liquido_m: float | None
    distancia_total_m: float | None
    distancia_total_km: float | None
    total_amostras: int
    pontos: list[PontoTopografico]
    dados_consumo: DadosConsumoRelevo | None
```

Cada `PontoTopografico` contém:
- `latitude`: float
- `longitude`: float
- `distancia_m`: float (distância acumulada na rodovia a partir da origem, em metros)
- `distancia_km`: float (distância acumulada na rodovia a partir da origem, em quilômetros)
- `elevacao_m`: float (elevação em metros acima do nível do mar)

---

## 3. Unidades de Medida e Metodologia de Cálculo

- **Elevação e Desnível:** Metros ($m$).
- **Distâncias:** Metros ($m$) para cálculos de precisão e Quilômetros ($km$) para exibição.
- **Distância Acumulada:** Calculada pelo método geodésico de **Haversine** ($R_{Terra} = 6.371.000\text{ m}$) somando os trechos rodoviários reais ($D_0 = 0.0\text{ m}, D_i = D_{i-1} + d_{haversine}(P_{i-1}, P_i)$).

### Fórmulas Topográficas:
- **Desnível Líquido:**
  $$\Delta h_{liquido} = elevacao_{final} - elevacao_{inicial}$$
- **Ganho de Elevação Acumulado:**
  $$G = \sum \Delta h_i \quad \text{onde } \Delta h_i \ge \text{limiar\_ruido}$$
- **Perda de Elevação Acumulada:**
  $$P = \sum |\Delta h_i| \quad \text{onde } \Delta h_i \le -\text{limiar\_ruido}$$

### Política de Filtragem de Ruído (Deadband):
- Modelos digitais de elevação (SRTM/NED) apresentam oscilações verticais de alta frequência ($\pm 1$ a $3\text{ metros}$).
- O serviço adota um **limiar de ruído padrão de $2{,}0\text{ metros}$** (`limiar_ruido_m = 2.0`). Variações inferiores ao limiar entre amostras adjacentes são desconsideradas para evitar inflação artificial de ganho/perda em trechos planos.
- Se `limiar_ruido_m = 0.0`, a igualdade $G - P = \Delta h_{liquido}$ é satisfeita estritamente.
- O desnível líquido ($\Delta h_{liquido}$) é sempre exato e independe do limiar de ruído.

---

## 4. Estratégia de Amostragem do Percurso

- **Limite Operacional:** `MAX_AMOSTRAS_PADRAO = 100` pontos (configurável via `max_amostras`).
- **Política de Seleção:**
  - Para percursos com até 100 pontos, todos os pontos originais da geometria são mantidos.
  - Para percursos extensos (> 100 pontos): os pontos são amostrados de forma uniforme ao longo da **distância acumulada real da rodovia** ($t_k = k \cdot \frac{D_{total}}{N_{max}-1}$).
  - A origem ($D = 0$) e o destino ($D = D_{total}$) são estritamente preservados.
  - A correspondência métrica da geometria rodoviária original é mantida.

---

## 5. Resiliência e Tratamento de Falhas

O serviço reutiliza o cliente assíncrono compartilhado `httpx.AsyncClient` gerenciado pelo lifespan da aplicação (`app.state.http_client`), evitando abertura/fechamento de conexões a cada ponto.

| Cenário de Falha | Status Retornado | Comportamento e Integridade |
| --- | --- | --- |
| Geometria vazia ou inválida | `GEOMETRIA_INVALIDA` | Rejeição imediata sem requisição de rede |
| Timeout do provedor (> 10s) | `INDISPONIVEL` | Retorna erro sem fabricar perfil plano |
| Falha de conexão / DNS | `INDISPONIVEL` | Retorna erro sem fabricar perfil plano |
| HTTP 429 / limite do provedor | `COTA_EXCEDIDA` | Informa limite sem repassar o corpo da resposta nem fabricar elevações |
| Erro HTTP (500, 502, 503) | `ERRO_PROVEDOR` | Retorna status de erro e detalhe HTTP |
| JSON quebrado / sem campo `results` | `ERRO_PROVEDOR` | Rejeita payload malformado |
| Quantidade divergente de resultados | `ERRO_PROVEDOR` | Impede descompasso entre coordenadas e cotas |
| Elevações nulas (`null`) ou `NaN` | `ERRO_PROVEDOR` | Rejeita dados corrompidos |

> **Garantia de Integridade:** Sob nenhuma hipótese uma falha do provedor externo é substituída por elevações zeradas fictícias ($0\text{ m}$). Falhas são explicitadas pelo status e `sucesso = False`.

### Configuração da franquia do provedor

Configure `OPEN_ELEVATION_API_KEY` somente no ambiente do backend para enviar a chave no cabeçalho `X-API-Key` do POST. Sem chave, a consulta usa a franquia anônima do provedor. O limite é contabilizado por coordenada e pode produzir HTTP 429; uma chave não garante que haja franquia disponível. Consulte a [documentação oficial](https://www.open-elevation.com/index.html) e os [termos de uso](https://www.open-elevation.com/terms.html). A chave não deve ser exposta em `VITE_*`, respostas HTTP ou logs.

O perfil salvo em uma viagem registra o resultado daquela consulta. Uma viagem antiga com falha não ganha elevações após configurar a chave; é preciso fazer novo planejamento com o provedor disponível. O frontend interpreta o HTTP 429 persistido no formato antigo como `cota_excedida`, sem exibir o corpo bruto.

---

## 6. Execução dos Testes Automatizados

Com as ferramentas disponíveis no ambiente (Python 3.13 e `pytest`):

```powershell
python -m pytest app/backend/tests/test_altimetria_service.py -v
```

Verificação estática de conformidade e linting:

```powershell
python -m ruff check app/backend/app/schemas/roteiros.py app/backend/app/services/altimetria_service.py app/backend/tests/test_altimetria_service.py
```
