# Serviço de Custos, Pedágios, Relevo e Rateio

## 1. Visão geral e responsabilidade

O serviço de custos (`app/backend/app/services/custos_service.py`) é de responsabilidade do **Aluno 3 (Data & Altimetry Engineer)**. Ele calcula o custo de uma viagem rodoviária para veículos a combustão e elétricos, consolida pedágios com procedência explícita, aplica ajuste de relevo somente quando houver um ajuste quantitativo validado e rateia o total entre 1 e 8 passageiros.

O serviço é de domínio e não implementa:

- a orquestração do endpoint `/api/v1/roteiros/planejar` (Issue #23);
- a geometria ou a distância da rota (OSRM/Issue #19);
- a consulta altimétrica ao Open-Elevation (Issue #27);
- a consulta externa de postos, eletropostos ou praças de pedágio;
- o redesenho do painel de custos no frontend (Issue #16);
- o cálculo de emissões ESG, que permanece fora deste escopo por falta de fator documentado.

O endpoint `/api/v1/roteiros/custos` continua **futuro**. A integração deve consumir a fachada `CustosService` sem alterar `trips.py` nesta issue.

## 2. Unidades e fórmulas

| Grandeza | Unidade | Observação |
| --- | --- | --- |
| Distância rodoviária | km | Fornecida pelo integrador; não é recalculada aqui |
| Consumo a combustão | km/L | Deve ser estritamente positivo |
| Preço do combustível | R$/L | Deve ser estritamente positivo |
| Eficiência elétrica | km/kWh | Deve ser estritamente positiva |
| Preço da energia | R$/kWh | Deve ser estritamente positivo |
| Consumo estimado | L ou kWh | Calculado com 6 casas decimais |
| Valores monetários | BRL | `Decimal` com 2 casas decimais |

### 2.1 Combustão

```text
consumo_base_l = distancia_km / consumo_km_por_litro
consumo_estimado_l = consumo_base_l * fator_relevo
custo_combustivel = consumo_estimado_l * preco_por_litro
```

### 2.2 Energia elétrica

```text
consumo_base_kwh = distancia_km / eficiencia_km_por_kwh
consumo_estimado_kwh = consumo_base_kwh * fator_relevo
custo_energia = consumo_estimado_kwh * preco_por_kwh
```

Não são adicionadas perdas de carregamento sem fonte explícita. Se o integrador quiser representá-las, deve incluí-las no preço informado ou em um ajuste documentado.

### 2.3 Distância zero

Distância igual a zero é válida e produz consumo e custo iguais a zero. Distância negativa é rejeitada. Consumo, eficiência e preço iguais a zero, negativos, `NaN` ou infinitos são rejeitados.

## 3. Precisão monetária e arredondamento

- Os cálculos internos usam `Decimal`, nunca `float` para dinheiro.
- Componentes monetários são arredondados para centavos com `ROUND_HALF_UP`.
- O total é a soma dos componentes monetários já arredondados.
- O consumo é arredondado para 6 casas decimais apenas para apresentação; o custo é calculado a partir do valor não truncado.
- Na serialização JSON do Pydantic v2, campos `Decimal` aparecem como strings, por exemplo `"50.00"`. O integrador pode converter para número no contrato HTTP, preservando o valor decimal.

### 3.1 Rateio

O total é convertido para centavos inteiros. A base é dividida igualmente e os centavos residuais são distribuídos um por passageiro, começando pelo passageiro 1:

```text
total_centavos = round(total * 100)
base, residuo = divmod(total_centavos, passageiros)
cota_i = base + 1 centavo, se i <= residuo
```

Assim, `sum(cotas) == total_rateado` sempre. Quantidades fora do intervalo de 1 a 8 são rejeitadas. Para `R$ 100,00` e 3 passageiros, as cotas são `R$ 33,34`, `R$ 33,33` e `R$ 33,33`.

## 4. Pedágios

### 4.1 Contrato

Cada praça é representada por `Pedagio`:

```json
{
  "id_praca": "BR-101:N:km-10",
  "valor": "10.00",
  "confiabilidade": "verificado",
  "fonte": "Tabela oficial da concessionária",
  "metodo_estimativa": null,
  "nome": "Praça exemplo",
  "rodovia": "BR-101",
  "km": 10.0,
  "atualizado_em": "2026-01-01",
  "limitacoes": null
}
```

Estados de confiabilidade:

| Estado | Significado | Exigências |
| --- | --- | --- |
| `verificado` | Valor confirmado em fonte identificável | `valor` e `fonte` obrigatórios |
| `estimado` | Estimativa fundamentada, não tarifa confirmada | `valor`, `fonte` e `metodo_estimativa` obrigatórios |
| `indisponivel` | Praça conhecida, mas sem valor determinável | `valor` deve ser `null` |

O serviço não inventa tarifas, nomes de praças, concessionárias ou datas. A fonte e o método são responsabilidade de quem fornece os dados.

### 4.2 Identificação e deduplicação

`id_praca` é a identificação estável da praça. A convenção recomendada é `rodovia:sentido:km`, por exemplo `BR-101:N:km-10`. O serviço normaliza a chave com `strip().casefold()`.

- Entradas com a mesma chave e conteúdo idêntico são contadas uma única vez.
- Entradas com a mesma chave e conteúdo divergente geram `PedagioDuplicadoConflitanteError`; o serviço não escolhe silenciosamente um dos valores.

### 4.3 Total e indisponibilidade

O resultado consolidado é `ResumoPedagios`:

- `total`: total determinável em BRL, ou `null` quando não é possível concluir o total;
- `total_conhecido`: soma dos valores conhecidos, mesmo em um conjunto parcial;
- `total_completo`: indica se todas as praças informadas têm valor conhecido;
- `status`: `verificado`, `estimado`, `sem_pedagio_confirmado` ou `indisponivel`;
- `pracas_unicas`: quantidade após deduplicação;
- `fontes` e `limitacoes`: procedência e ressalvas.

Regras:

1. Rota com praças verificadas: total completo e confiabilidade `verificado`.
2. Rota com pelo menos uma praça estimada e nenhuma indisponível: total completo, mas confiabilidade `estimado`.
3. Rota com praça indisponível: `total = null`, `total_completo = false`; valores conhecidos permanecem em `total_conhecido`.
4. Lista vazia ou ausente sem confirmação: `status = indisponivel`, `total = null`. Ausência de dados **não** significa custo zero.
5. Lista vazia com `rota_sem_pedagios_confirmada = true`: `total = "0.00"`, `status = sem_pedagio_confirmado`, total completo. A confirmação é declarada pelo solicitante e não verificada em provedor externo.

## 5. Ajuste por relevo

### 5.1 Modelo adotado

O serviço recebe `AjusteRelevo`:

```json
{
  "variacao_consumo_percent": "12.5",
  "metodo": "Modelo documentado de consumo em subida",
  "fonte": "Estudo interno versionado",
  "limitacoes": "Válido apenas para o perfil altimétrico analisado."
}
```

O multiplicador é:

```text
fator_relevo = 1 + (variacao_consumo_percent / 100)
consumo_estimado = consumo_base * fator_relevo
```

- Variação positiva aumenta o consumo.
- Variação negativa representa ganho de consumo.
- A variação deve ser finita e maior que `-100%`, garantindo fator positivo.
- O ajuste é aplicado somente quando `metodo` e `fonte` são informados.

### 5.2 Limitação deliberada

O contrato da Issue #27 (`DadosConsumoRelevo`) contém indicadores topográficos e um campo preliminar `penalizacao_consumo_estimada_percent`. Esse campo não é usado automaticamente como se fosse uma medição validada de consumo, porque o modelo atual não relaciona massa, velocidade, eficiência, resistência ao rolamento e perfil de subida/descida de forma quantitativamente fundamentada.

Também não são usados os percentuais fixos de frontend (por exemplo, 6,9% ou 4,0%) como se fossem resultados altimétricos reais.

Quando nenhum `AjusteRelevo` validado é fornecido:

- `ajuste_relevo.status = indisponivel`;
- o consumo base é mantido, sem penalização fictícia;
- a ausência é registrada em `hipoteses` e `limitacoes`.

Se uma versão futura da altimetria produzir um modelo validado, ela deve preencher `AjusteRelevo` com método e fonte. A interface já está pronta para receber esse ajuste.

## 6. Contrato de saída

`ResultadoCustosViagem` contém:

| Campo | Descrição |
| --- | --- |
| `sucesso` | Indica se o cálculo foi concluído |
| `status` | `completo`, `parcial` ou `invalido` |
| `distancia_km`, `unidade_distancia` | Distância usada no cálculo |
| `propulsao` | `combustao` ou `eletrico` |
| `consumo_estimado`, `unidade_consumo` | Consumo em L ou kWh |
| `custo_combustivel` / `custo_energia` | Componente de propulsão em BRL |
| `custo_propulsao` | O componente de propulsão efetivamente usado |
| `custo_pedagios` | Total de pedágios em BRL, ou `null` se indeterminável |
| `custo_pedagios_conhecido` | Soma conhecida de pedágios, inclusive em resultado parcial |
| `pedagios` | `ResumoPedagios` com praças, status, fontes e limitações |
| `ajuste_relevo` | Ajuste aplicado ou motivo da indisponibilidade |
| `custo_total` | Soma dos componentes disponíveis em BRL |
| `total_completo` | `false` quando algum componente obrigatório está indisponível |
| `passageiros` | Quantidade de 1 a 8 |
| `rateio` | Cotas individuais e total rateado |
| `hipoteses`, `fontes`, `limitacoes` | Rastreabilidade do resultado |

### 6.1 Total completo e total parcial

`custo_total` é sempre a soma dos componentes disponíveis. Quando pedágios não podem ser determinados:

- `custo_pedagios = null`;
- `custo_total = custo_propulsao + custo_pedagios_conhecido`;
- `total_completo = false`;
- `status = parcial`.

O valor parcial não deve ser apresentado como custo final. Pedágios conhecidos entram no total conhecido, mas o componente desconhecido não é convertido em zero.

### 6.2 Compatibilidade com o frontend

No contrato `CalculoCustosViagem` usado na `development`:

| Frontend | Serviço de custos |
| --- | --- |
| `combustivelOuEnergia` | `custo_propulsao` |
| `pedagios` | `custo_pedagios` (pode ser `null`) |
| `total` | `custo_total` (pode ser parcial) |
| `passageiros` | `passageiros` |
| `valorPorPassageiro` | `rateio.cotas` (cotas exatas) |

O frontend possui um único `valorPorPassageiro`, enquanto o serviço distribui centavos residuais entre passageiros. Por isso, a representação correta é a lista `rateio.cotas`; um único valor não consegue representar `R$ 33,34` e `R$ 33,33` ao mesmo tempo. Os campos monetários do backend são `Decimal` e aparecem como strings no JSON do Pydantic; o adaptador HTTP pode convertê-los para número.

O arquivo `app/frontend/src/services/routeCalculator.ts` citado na issue não existe no branch atual de implementação. A compatibilidade acima é conceitual, baseada no contrato de `origin/development`.

## 7. Exemplo de entrada

```json
{
  "distancia_km": 300,
  "propulsao": "combustao",
  "consumo_km_por_litro": 10,
  "preco_combustivel_por_litro": 5,
  "ajuste_relevo": {
    "variacao_consumo_percent": 20,
    "metodo": "Modelo documentado de consumo em subida",
    "fonte": "Estudo interno versionado",
    "limitacoes": "Aplicável apenas ao trecho analisado."
  },
  "pedagios": [
    {
      "id_praca": "BR-101:N:km-10",
      "valor": 10,
      "confiabilidade": "verificado",
      "fonte": "Tabela oficial da concessionária"
    }
  ],
  "passageiros": 3
}
```

## 8. Exemplo de saída completa (campos principais)

```json
{
  "sucesso": true,
  "status": "completo",
  "mensagem": null,
  "distancia_km": "300",
  "unidade_distancia": "km",
  "propulsao": "combustao",
  "consumo_estimado": "36.000000",
  "unidade_consumo": "L",
  "custo_combustivel": "180.00",
  "custo_energia": null,
  "custo_propulsao": "180.00",
  "custo_pedagios": "10.00",
  "custo_pedagios_conhecido": "10.00",
  "pedagios": {
    "status": "verificado",
    "total": "10.00",
    "total_conhecido": "10.00",
    "total_completo": true,
    "pracas_unicas": 1
  },
  "ajuste_relevo": {
    "status": "aplicado",
    "variacao_consumo_percent": "20",
    "fator_consumo": "1.2",
    "metodo": "Modelo documentado de consumo em subida",
    "fonte": "Estudo interno versionado"
  },
  "custo_total": "190.00",
  "total_completo": true,
  "passageiros": 3,
  "rateio": {
    "quantidade": 3,
    "total_rateado": "190.00",
    "cotas": [
      {"passageiro": 1, "valor": "63.34"},
      {"passageiro": 2, "valor": "63.33"},
      {"passageiro": 3, "valor": "63.33"}
    ]
  }
}
```

## 9. Exemplo de saída parcial (campos principais)

```json
{
  "sucesso": true,
  "status": "parcial",
  "mensagem": "Custo parcial: o total de pedágios não pôde ser determinado.",
  "custo_propulsao": "150.00",
  "custo_pedagios": null,
  "custo_pedagios_conhecido": "10.00",
  "custo_total": "160.00",
  "total_completo": false,
  "pedagios": {
    "status": "indisponivel",
    "total": null,
    "total_conhecido": "10.00",
    "total_completo": false
  }
}
```

## 10. Erros e cenários sem solução completa

| Cenário | Comportamento |
| --- | --- |
| Distância negativa | `ParametrosCustoInvalidosError` |
| Consumo, eficiência ou preço ausente, zero, negativo ou não finito | `ParametrosCustoInvalidosError` |
| Propulsão desconhecida | `ParametrosCustoInvalidosError` |
| Parâmetro obrigatório ausente para a propulsão | `ParametrosCustoInvalidosError` |
| Passageiros fora de 1 a 8 | `RateioInvalidoError` |
| Praça duplicada com conteúdo divergente | `PedagioDuplicadoConflitanteError` |
| Lista de pedágios com a rota declarada sem pedágio | `ParametrosCustoInvalidosError` |
| Pedágios sem dados suficientes | Resultado parcial, `custo_pedagios = null` |
| Relevo sem ajuste validado | Resultado com `ajuste_relevo.status = indisponivel`, sem penalização |
| Entrada inválida com `modo_estrito = false` | `sucesso = false`, `status = invalido`, sem substituir valores |
| Entrada inválida com `modo_estrito = true` | Exceção de domínio correspondente |

## 11. Integração futura com `/planejar`

A Issue #23 deve chamar `CustosService.calcular_async` após obter a distância rodoviária, os parâmetros do veículo, o ajuste de relevo validado (se existir) e os pedágios com procedência. O serviço não consulta provedores externos.

Fluxo recomendado:

1. Obter distância e geometria da rota.
2. Obter perfil altimétrico da Issue #27.
3. Fornecer `AjusteRelevo` somente se houver modelo, método e fonte validados.
4. Fornecer pedágios verificados/estimados ou declarar explicitamente a ausência de praças.
5. Chamar `CustosService.calcular_async`.
6. Se `total_completo = false`, apresentar o valor como parcial e informar a limitação.

Não existe provedor obrigatório de pedágios definido na documentação. A escolha de fonte externa, atualização tarifária e cobertura regional permanece uma integração futura.

## 12. Testes

```powershell
uv run --with-requirements requirements.lock python -m pytest tests/test_custos_service.py -v
```

Verificação estática:

```powershell
uv run --with-requirements requirements.lock python -m ruff check app/schemas/roteiros.py app/services/custos_service.py tests/test_custos_service.py
uv run --with-requirements requirements.lock python -m mypy app/schemas/roteiros.py app/services/custos_service.py tests/test_custos_service.py
```
