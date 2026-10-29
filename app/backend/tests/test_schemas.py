"""Testes de validação defensiva e contrato dos schemas Pydantic v2 (Aluno 3).

Cobertura:
- Validação e normalização das 27 UFs brasileiras e de cidades (vazias, espaços,
  limite de tamanho e acentuação).
- Parâmetros de veículos a combustão e elétricos: limites, não finitos, tipos
  incorretos e incompatibilidades entre propulsão e campos.
- Limites de passageiros entre 1 e 8.
- Altimetria disponível/indisponível, paradas projetadas/verificadas e custos
  completos, parciais e indisponíveis.
- Serialização JSON e compatibilidade com o formato legado de viagem.
"""

from __future__ import annotations

import json
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.roteiros import (
    AltimetriaInfo,
    ConfiabilidadePedagio,
    Coordenada,
    CotaPassageiro,
    CustosRequest,
    DadosConsumoRelevo,
    DetalhesEstabelecimento,
    OrigemParada,
    ParadaProjetada,
    ParametrosVeiculo,
    Pedagio,
    PerfilTopografico,
    PontoTopografico,
    ResultadoCustosViagem,
    StatusAltimetria,
    StatusCustosViagem,
    TipoParada,
    TipoPropulsao,
    VeiculoCombustao,
    VeiculoEletrico,
)
from app.schemas.trips import (
    LIMITE_CIDADE,
    UFS_BRASIL,
    TripCreateRequest,
    TripCreateResponse,
    TripListResponse,
    ViagemLegada,
)

NAO_FINITOS = [float("nan"), float("inf"), float("-inf")]


def _erro_no_campo(exc: ValidationError, campo: str) -> bool:
    """Indica se algum erro de validação aponta para o campo informado."""
    return any(campo in erro["loc"] for erro in exc.errors())


# ---------------------------------------------------------------------------
# A. Cidades e UFs
# ---------------------------------------------------------------------------


class TestCidadesEUfs:
    def test_ufs_brasileiras_sao_exatamente_27(self) -> None:
        assert len(UFS_BRASIL) == 27

    @pytest.mark.parametrize("uf", sorted(UFS_BRASIL))
    def test_uf_valida_e_preservada(self, uf: str) -> None:
        payload = TripCreateRequest(
            origem_cidade="Recife",
            origem_uf=uf,
            destino_cidade="Salvador",
            destino_uf=uf,
        )
        assert payload.origem_uf == uf
        assert payload.destino_uf == uf

    @pytest.mark.parametrize("uf", sorted(UFS_BRASIL))
    def test_uf_minuscula_e_com_espacos_e_normalizada(self, uf: str) -> None:
        payload = TripCreateRequest(
            origem_cidade="Recife",
            origem_uf=uf.lower(),
            destino_cidade="Salvador",
            destino_uf=f"  {uf.lower()}  ",
        )
        assert payload.origem_uf == uf
        assert payload.destino_uf == uf

    @pytest.mark.parametrize("uf", ["XX", "ZZ", "BR", "SAO", "P", "  xx  "])
    def test_uf_inexistente_e_rejeitada(self, uf: str) -> None:
        with pytest.raises(ValidationError) as exc:
            TripCreateRequest(
                origem_cidade="Recife",
                origem_uf=uf,
                destino_cidade="Salvador",
                destino_uf="BA",
            )
        assert _erro_no_campo(exc.value, "origem_uf")

    def test_uf_ausente_preserva_compatibilidade_legada(self) -> None:
        payload = TripCreateRequest(origem_cidade="Recife", destino_cidade="Salvador")
        assert payload.origem_uf == ""
        assert payload.destino_uf == ""

    @pytest.mark.parametrize("uf", ["", "   ", "\t\n"])
    def test_uf_vazia_ou_so_espacos_e_aceita_como_vazia(self, uf: str) -> None:
        payload = TripCreateRequest(
            origem_cidade="Recife",
            origem_uf=uf,
            destino_cidade="Salvador",
            destino_uf=uf,
        )
        assert payload.origem_uf == ""
        assert payload.destino_uf == ""

    def test_uf_com_tipo_invalido_e_rejeitada(self) -> None:
        with pytest.raises(ValidationError):
            TripCreateRequest(
                origem_cidade="Recife",
                origem_uf=123,  # type: ignore[arg-type]
                destino_cidade="Salvador",
                destino_uf="BA",
            )

    @pytest.mark.parametrize("cidade", ["", " ", "   ", "\t\n"])
    def test_cidade_vazia_ou_so_espacos_e_rejeitada(self, cidade: str) -> None:
        with pytest.raises(ValidationError) as exc:
            TripCreateRequest(origem_cidade=cidade, destino_cidade="Salvador")
        assert _erro_no_campo(exc.value, "origem_cidade")

    def test_cidade_excessivamente_longa_e_rejeitada(self) -> None:
        with pytest.raises(ValidationError) as exc:
            TripCreateRequest(
                origem_cidade="A" * (LIMITE_CIDADE + 1), destino_cidade="Salvador"
            )
        assert _erro_no_campo(exc.value, "origem_cidade")

    def test_cidade_no_limite_de_tamanho_e_aceita(self) -> None:
        cidade = "A" * LIMITE_CIDADE
        payload = TripCreateRequest(origem_cidade=cidade, destino_cidade="Salvador")
        assert payload.origem_cidade == cidade

    @pytest.mark.parametrize(
        "cidade", ["São Paulo", "Maceió", "Florianópolis", "Belém", "Açailândia"]
    )
    def test_cidade_preserva_acentos(self, cidade: str) -> None:
        payload = TripCreateRequest(origem_cidade=cidade, destino_cidade="Salvador")
        assert payload.origem_cidade == cidade

    def test_cidade_remove_espacos_externos(self) -> None:
        payload = TripCreateRequest(origem_cidade="  Recife  ", destino_cidade="Salvador")
        assert payload.origem_cidade == "Recife"

    def test_cidade_com_tipo_invalido_e_rejeitada(self) -> None:
        with pytest.raises(ValidationError):
            TripCreateRequest(
                origem_cidade=42,  # type: ignore[arg-type]
                destino_cidade="Salvador",
            )


# ---------------------------------------------------------------------------
# B. Veículos e parâmetros numéricos
# ---------------------------------------------------------------------------


class TestVeiculos:
    def test_combustao_calcula_autonomia(self) -> None:
        veiculo = VeiculoCombustao(
            capacidade_tanque_litros=50.0,
            consumo_km_por_litro=12.0,
            nivel_inicial_percent=50.0,
        )
        assert veiculo.autonomia_maxima_km == pytest.approx(600.0)
        assert veiculo.autonomia_efetiva_km == pytest.approx(300.0)

    def test_eletrico_calcula_autonomia(self) -> None:
        veiculo = VeiculoEletrico(capacidade_bateria_kwh=60.0, eficiencia_km_por_kwh=6.0)
        assert veiculo.autonomia_maxima_km == pytest.approx(360.0)

    @pytest.mark.parametrize("valor", [0.0, -1.0, -50.0])
    def test_capacidade_tanque_zero_ou_negativa(self, valor: float) -> None:
        with pytest.raises(ValidationError):
            VeiculoCombustao(capacidade_tanque_litros=valor, consumo_km_por_litro=10.0)

    @pytest.mark.parametrize("valor", [0.0, -3.0])
    def test_consumo_zero_ou_negativo(self, valor: float) -> None:
        with pytest.raises(ValidationError):
            VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=valor)

    @pytest.mark.parametrize("valor", NAO_FINITOS)
    def test_combustao_rejeita_nao_finitos(self, valor: float) -> None:
        with pytest.raises(ValidationError):
            VeiculoCombustao(capacidade_tanque_litros=valor, consumo_km_por_litro=10.0)

    def test_combustao_rejeita_tipo_incorreto(self) -> None:
        with pytest.raises(ValidationError):
            VeiculoCombustao(
                capacidade_tanque_litros="muito",  # type: ignore[arg-type]
                consumo_km_por_litro=10.0,
            )

    @pytest.mark.parametrize("nivel", [-1.0, 101.0, *NAO_FINITOS])
    def test_combustao_nivel_inicial_fora_do_intervalo(self, nivel: float) -> None:
        with pytest.raises(ValidationError):
            VeiculoCombustao(
                capacidade_tanque_litros=50.0,
                consumo_km_por_litro=10.0,
                nivel_inicial_percent=nivel,
            )

    @pytest.mark.parametrize("valor", [0.0, -5.0, *NAO_FINITOS])
    def test_eletrico_rejeita_capacidade_invalida(self, valor: float) -> None:
        with pytest.raises(ValidationError):
            VeiculoEletrico(capacidade_bateria_kwh=valor, eficiencia_km_por_kwh=6.0)

    def test_eletrico_rejeita_tipo_incorreto(self) -> None:
        with pytest.raises(ValidationError):
            VeiculoEletrico(
                capacidade_bateria_kwh=None,  # type: ignore[arg-type]
                eficiencia_km_por_kwh=6.0,
            )

    def test_parametros_combustao_validos(self) -> None:
        parametros = ParametrosVeiculo(
            propulsao=TipoPropulsao.COMBUSTAO, capacidade_tanque_l=55.0, consumo_km_l=11.0
        )
        assert isinstance(parametros.obter_veiculo_especifico(), VeiculoCombustao)

    def test_parametros_eletricos_validos(self) -> None:
        parametros = ParametrosVeiculo(
            propulsao=TipoPropulsao.ELETRICO,
            capacidade_bateria_kwh=75.0,
            eficiencia_km_kwh=5.5,
        )
        veiculo = parametros.obter_veiculo_especifico()
        assert isinstance(veiculo, VeiculoEletrico)
        assert veiculo.capacidade_bateria_kwh == 75.0

    def test_combustao_exige_campos_obrigatorios(self) -> None:
        with pytest.raises(ValidationError, match="capacidade_tanque_l"):
            ParametrosVeiculo(propulsao=TipoPropulsao.COMBUSTAO)

    def test_combustao_rejeita_campos_eletricos(self) -> None:
        with pytest.raises(ValidationError, match="incompat"):
            ParametrosVeiculo(
                propulsao=TipoPropulsao.COMBUSTAO,
                capacidade_tanque_l=50.0,
                consumo_km_l=10.0,
                capacidade_bateria_kwh=60.0,
            )

    def test_eletrico_exige_campos_obrigatorios(self) -> None:
        with pytest.raises(ValidationError, match="capacidade_bateria_kwh"):
            ParametrosVeiculo(propulsao=TipoPropulsao.ELETRICO)

    def test_eletrico_rejeita_campos_de_combustao(self) -> None:
        with pytest.raises(ValidationError, match="incompat"):
            ParametrosVeiculo(
                propulsao=TipoPropulsao.ELETRICO,
                capacidade_bateria_kwh=60.0,
                eficiencia_km_kwh=5.0,
                consumo_km_l=10.0,
            )

    @pytest.mark.parametrize("preco", [-0.1, 0.0])
    def test_preco_combustivel_deve_ser_positivo(self, preco: float) -> None:
        with pytest.raises(ValidationError):
            ParametrosVeiculo(
                propulsao=TipoPropulsao.COMBUSTAO,
                capacidade_tanque_l=50.0,
                consumo_km_l=10.0,
                preco_combustivel_l=preco,
            )

    @pytest.mark.parametrize("valor", NAO_FINITOS)
    def test_parametros_rejeitam_nao_finitos(self, valor: float) -> None:
        with pytest.raises(ValidationError):
            ParametrosVeiculo(
                propulsao=TipoPropulsao.COMBUSTAO,
                capacidade_tanque_l=50.0,
                consumo_km_l=10.0,
                nivel_inicial_percent=valor,
            )


# ---------------------------------------------------------------------------
# B. Limites de passageiros
# ---------------------------------------------------------------------------


class TestPassageiros:
    @pytest.mark.parametrize("quantidade", [1, 8])
    def test_limites_validos(self, quantidade: int) -> None:
        pedido = CustosRequest(
            propulsao=TipoPropulsao.COMBUSTAO,
            distancia_km=Decimal(100),
            consumo_km_por_litro=Decimal(10),
            preco_combustivel_por_litro=Decimal("5.50"),
            passageiros=quantidade,
        )
        assert pedido.passageiros == quantidade

    @pytest.mark.parametrize("quantidade", [0, -1, 9, 100])
    def test_limites_invalidos(self, quantidade: int) -> None:
        with pytest.raises(ValidationError):
            CustosRequest(
                propulsao=TipoPropulsao.COMBUSTAO,
                distancia_km=Decimal(100),
                consumo_km_por_litro=Decimal(10),
                preco_combustivel_por_litro=Decimal("5.50"),
                passageiros=quantidade,
            )

    @pytest.mark.parametrize("numero", [1, 8])
    def test_cota_passageiro_limites_validos(self, numero: int) -> None:
        cota = CotaPassageiro(passageiro=numero, valor=Decimal("10.00"))
        assert cota.passageiro == numero

    @pytest.mark.parametrize("numero", [0, 9])
    def test_cota_passageiro_fora_do_limite(self, numero: int) -> None:
        with pytest.raises(ValidationError):
            CotaPassageiro(passageiro=numero, valor=Decimal("10.00"))


# ---------------------------------------------------------------------------
# C. Altimetria
# ---------------------------------------------------------------------------


class TestAltimetria:
    def test_info_disponivel(self) -> None:
        info = AltimetriaInfo(
            altitude_minima_m=0.0,
            altitude_maxima_m=800.0,
            ganho_elevacao_m=500.0,
            perda_elevacao_m=100.0,
            desnivel_liquido_m=400.0,
            distancia_total_km=120.0,
            total_pontos=50,
        )
        assert info.fator_terreno == "plano"

    def test_min_maior_que_max_e_rejeitado(self) -> None:
        with pytest.raises(ValidationError):
            AltimetriaInfo(
                altitude_minima_m=900.0,
                altitude_maxima_m=800.0,
                ganho_elevacao_m=10.0,
                perda_elevacao_m=10.0,
                desnivel_liquido_m=0.0,
                distancia_total_km=10.0,
                total_pontos=2,
            )

    def test_perfil_indisponivel_nao_gera_info(self) -> None:
        perfil = PerfilTopografico(
            sucesso=False,
            status=StatusAltimetria.INDISPONIVEL,
            mensagem="timeout no provedor",
        )
        assert perfil.to_info() is None

    def test_perfil_disponivel_converte_para_info(self) -> None:
        perfil = PerfilTopografico(
            sucesso=True,
            status=StatusAltimetria.SUCESSO,
            altitude_minima_m=10.0,
            altitude_maxima_m=500.0,
            ganho_elevacao_m=400.0,
            perda_elevacao_m=100.0,
            desnivel_liquido_m=300.0,
            distancia_total_km=80.0,
            total_amostras=3,
            dados_consumo=DadosConsumoRelevo(fator_terreno="ondulado"),
        )
        info = perfil.to_info()
        assert info is not None
        assert info.fator_terreno == "ondulado"
        assert info.total_pontos == 3

    @pytest.mark.parametrize(
        "latitude,longitude",
        [(95.0, 0.0), (-90.1, 0.0), (0.0, 181.0), (0.0, -180.5)],
    )
    def test_coordenada_fora_do_intervalo(self, latitude: float, longitude: float) -> None:
        with pytest.raises(ValidationError):
            Coordenada(latitude=latitude, longitude=longitude)

    def test_ponto_topografico_com_distancia_negativa(self) -> None:
        with pytest.raises(ValidationError):
            PontoTopografico(
                latitude=0.0,
                longitude=0.0,
                distancia_m=-1.0,
                distancia_km=-0.001,
                elevacao_m=0.0,
            )

    def test_fator_terreno_invalido(self) -> None:
        with pytest.raises(ValidationError):
            DadosConsumoRelevo(fator_terreno="muito-montanhoso")  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# C. Paradas estratégicas
# ---------------------------------------------------------------------------


class TestParadas:
    @staticmethod
    def _parada(**overrides: object) -> ParadaProjetada:
        base: dict[str, object] = {
            "id": "parada-1",
            "ordem": 1,
            "nome": "Ponto Projetado 1",
            "tipo": TipoParada.COMBUSTIVEL,
            "distancia_km": 100.0,
            "distancia_m": 100000.0,
            "coordenadas": Coordenada(latitude=-8.0, longitude=-35.0),
            "reserva_estimada_percent": 20.0,
            "autonomia_restante_km": 120.0,
            "nivel_pos_parada_percent": 100.0,
        }
        base.update(overrides)
        return ParadaProjetada(**base)  # type: ignore[arg-type]

    def test_parada_projetada_valida(self) -> None:
        parada = self._parada()
        assert parada.origem == OrigemParada.PROJETADO
        assert parada.eh_ponto_projetado is True
        assert parada.estabelecimento_verificado is False
        assert parada.detalhes_estabelecimento is None

    def test_projetada_nao_pode_ser_verificada(self) -> None:
        with pytest.raises(ValidationError):
            self._parada(estabelecimento_verificado=True)

    def test_projetada_nao_pode_exibir_detalhes(self) -> None:
        with pytest.raises(ValidationError):
            self._parada(detalhes_estabelecimento=DetalhesEstabelecimento(nome="Posto X"))

    def test_verificada_valida(self) -> None:
        parada = self._parada(
            origem=OrigemParada.VERIFICADO,
            eh_ponto_projetado=False,
            estabelecimento_verificado=True,
            detalhes_estabelecimento=DetalhesEstabelecimento(
                nome="Posto Real", fonte="OpenStreetMap"
            ),
        )
        assert parada.origem == OrigemParada.VERIFICADO
        assert parada.estabelecimento_verificado is True

    def test_verificada_exige_detalhes(self) -> None:
        with pytest.raises(ValidationError):
            self._parada(
                origem=OrigemParada.VERIFICADO,
                eh_ponto_projetado=False,
                estabelecimento_verificado=True,
            )

    @pytest.mark.parametrize("reserva", [-1.0, 101.0])
    def test_reserva_fora_do_intervalo(self, reserva: float) -> None:
        with pytest.raises(ValidationError):
            self._parada(reserva_estimada_percent=reserva)

    def test_tipo_de_parada_invalido(self) -> None:
        with pytest.raises(ValidationError):
            self._parada(tipo="gasolina")


# ---------------------------------------------------------------------------
# C. Custos, pedágios e rateio
# ---------------------------------------------------------------------------


class TestCustos:
    def test_resultado_completo(self) -> None:
        resultado = ResultadoCustosViagem(
            sucesso=True,
            status=StatusCustosViagem.COMPLETO,
            distancia_km=Decimal(100),
            propulsao=TipoPropulsao.COMBUSTAO,
            consumo_estimado=Decimal(10),
            custo_combustivel=Decimal("55.00"),
            custo_propulsao=Decimal("55.00"),
            custo_total=Decimal("55.00"),
            total_completo=True,
        )
        assert resultado.status == StatusCustosViagem.COMPLETO
        assert resultado.custo_total == Decimal("55.00")

    def test_resultado_parcial_sem_total(self) -> None:
        resultado = ResultadoCustosViagem(
            sucesso=True,
            status=StatusCustosViagem.PARCIAL,
            distancia_km=Decimal(100),
            custo_propulsao=Decimal("55.00"),
            custo_pedagios=None,
            total_completo=False,
        )
        assert resultado.custo_total is None
        assert resultado.status == StatusCustosViagem.PARCIAL

    def test_resultado_invalido_indisponivel(self) -> None:
        resultado = ResultadoCustosViagem(
            sucesso=False,
            status=StatusCustosViagem.INVALIDO,
            mensagem="distância inválida",
        )
        assert resultado.custo_total is None
        assert resultado.distancia_km is None

    def test_pedagio_verificado_exige_fonte(self) -> None:
        with pytest.raises(ValidationError):
            Pedagio(
                id_praca="BR-101:km-100",
                valor=Decimal("8.50"),
                confiabilidade=ConfiabilidadePedagio.VERIFICADO,
            )

    def test_pedagio_estimado_exige_metodo(self) -> None:
        with pytest.raises(ValidationError):
            Pedagio(
                id_praca="BR-101:km-100",
                valor=Decimal("8.50"),
                confiabilidade=ConfiabilidadePedagio.ESTIMADO,
                fonte="Base interna de tarifas",
            )

    def test_pedagio_indisponivel_sem_valor(self) -> None:
        pedagio = Pedagio(
            id_praca="BR-101:km-100",
            confiabilidade=ConfiabilidadePedagio.INDISPONIVEL,
        )
        assert pedagio.valor is None

    def test_pedagio_indisponivel_com_valor_e_rejeitado(self) -> None:
        with pytest.raises(ValidationError):
            Pedagio(
                id_praca="BR-101:km-100",
                valor=Decimal("8.50"),
                confiabilidade=ConfiabilidadePedagio.INDISPONIVEL,
            )

    def test_pedagio_valor_negativo_e_rejeitado(self) -> None:
        with pytest.raises(ValidationError):
            Pedagio(
                id_praca="BR-101:km-100",
                valor=Decimal("-1.00"),
                confiabilidade=ConfiabilidadePedagio.VERIFICADO,
                fonte="Tabela oficial",
            )

    def test_custos_request_rejeita_incompatibilidade_de_propulsao(self) -> None:
        with pytest.raises(ValidationError):
            CustosRequest(
                propulsao=TipoPropulsao.COMBUSTAO,
                distancia_km=Decimal(100),
                consumo_km_por_litro=Decimal(10),
                preco_combustivel_por_litro=Decimal("5.50"),
                eficiencia_km_por_kwh=Decimal(6),
            )

    def test_custos_request_exige_campos_da_propulsao(self) -> None:
        with pytest.raises(ValidationError, match="energia"):
            CustosRequest(propulsao=TipoPropulsao.ELETRICO, distancia_km=Decimal(100))

    def test_custos_request_rejeita_distancia_negativa(self) -> None:
        with pytest.raises(ValidationError):
            CustosRequest(
                propulsao=TipoPropulsao.COMBUSTAO,
                distancia_km=Decimal(-1),
                consumo_km_por_litro=Decimal(10),
                preco_combustivel_por_litro=Decimal("5.50"),
            )

    def test_serializacao_json_decimal_como_string(self) -> None:
        resultado = ResultadoCustosViagem(
            sucesso=True,
            status=StatusCustosViagem.COMPLETO,
            custo_total=Decimal("55.00"),
            total_completo=True,
        )
        dados = json.loads(resultado.model_dump_json())
        assert dados["custo_total"] == "55.00"

    def test_serializacao_json_de_custo_indisponivel(self) -> None:
        resultado = ResultadoCustosViagem(
            sucesso=False, status=StatusCustosViagem.INVALIDO
        )
        dados = json.loads(resultado.model_dump_json())
        assert dados["custo_total"] is None


# ---------------------------------------------------------------------------
# D. Serialização e compatibilidade legada
# ---------------------------------------------------------------------------


class TestCompatibilidadeLegada:
    def test_viagem_legada_preserva_campos_extras(self) -> None:
        trip = {
            "id": "trip-legado",
            "criado_em": "2026-01-01T00:00:00+00:00",
            "origem": "Recife - PE",
            "destino": "Salvador - BA",
            "clima": {"temperatura": "N/D", "umidade": "N/D", "vento": "N/D"},
            "percurso": {"distancia": "N/D", "tempo": "N/D"},
            "dicas_destino": "Guia legado",
            "diagnostico_ia": {"motivo": "chave_ausente"},
            "campo_extra_desconhecido": "preservado",
        }
        viagem = ViagemLegada.model_validate(trip)
        assert json.loads(viagem.model_dump_json()) == trip

    def test_viagem_legada_minima_nao_inventa_campos(self) -> None:
        viagem = ViagemLegada(id="trip-min", origem="Recife", destino="Natal")
        assert json.loads(viagem.model_dump_json()) == {
            "id": "trip-min",
            "origem": "Recife",
            "destino": "Natal",
        }

    def test_resposta_de_criacao_preserva_formato(self) -> None:
        trip = {"id": "trip-c", "origem": "Recife", "destino": "Natal", "extra": 1}
        resposta = TripCreateResponse.model_validate({"viagem": trip, "aviso": None})
        assert json.loads(resposta.model_dump_json()) == {"viagem": trip, "aviso": None}

    def test_lista_de_viagens_preserva_formato(self) -> None:
        trips = [{"id": "trip-l", "origem": "Recife", "destino": "Natal"}]
        resposta = TripListResponse.model_validate({"viagens": trips})
        assert json.loads(resposta.model_dump_json()) == {"viagens": trips}

    def test_entrada_legada_sem_uf_usa_vazio(self) -> None:
        payload = TripCreateRequest(origem_cidade="Recife", destino_cidade="Natal")
        assert payload.model_dump() == {
            "origem_cidade": "Recife",
            "origem_uf": "",
            "destino_cidade": "Natal",
            "destino_uf": "",
        }

    def test_viagem_legada_exige_identificadores_minimos(self) -> None:
        with pytest.raises(ValidationError):
            ViagemLegada.model_validate({"origem": "Recife", "destino": "Natal"})
