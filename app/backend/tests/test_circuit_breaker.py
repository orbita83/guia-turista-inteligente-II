from app.core.circuit_breaker import (
    CircuitBreaker,
    CircuitOpenError,
    CircuitState,
)
import asyncio

import pytest


@pytest.mark.asyncio
async def test_circuito_abre_apos_falhas_consecutivas():
    disjuntor = CircuitBreaker("teste", failure_threshold=2)
    alternativa = {"estado": "indisponivel"}

    async def operacao_com_falha():
        return alternativa

    for _ in range(2):
        resultado = await disjuntor.call(
            operacao_com_falha,
            fallback=alternativa,
            is_failure=lambda valor: valor["estado"] == "indisponivel",
        )
        assert resultado == alternativa

    assert disjuntor.state == CircuitState.OPEN


@pytest.mark.asyncio
async def test_circuito_aberto_retorna_alternativa_sem_chamar_servico():
    disjuntor = CircuitBreaker("teste", failure_threshold=1)
    alternativa = {"estado": "indisponivel"}
    chamada = False

    async def operacao_com_falha():
        return alternativa

    await disjuntor.call(
        operacao_com_falha,
        fallback=alternativa,
        is_failure=lambda valor: valor["estado"] == "indisponivel",
    )

    async def operacao():
        nonlocal chamada
        chamada = True
        return {"estado": "ok"}

    resultado = await disjuntor.call(
        operacao,
        fallback=alternativa,
    )

    assert resultado == alternativa
    assert chamada is False


@pytest.mark.asyncio
async def test_sucesso_reinicia_contagem_de_falhas():
    disjuntor = CircuitBreaker("teste", failure_threshold=2)

    async def operacao():
        return "ok"

    await disjuntor.call(operacao, fallback="alternativa")
    await disjuntor.call(operacao, fallback="alternativa")

    assert disjuntor.state == CircuitState.CLOSED
    assert disjuntor.failure_count == 0


@pytest.mark.asyncio
async def test_circuito_se_recupera_apos_tempo_de_espera():
    disjuntor = CircuitBreaker(
        "teste",
        failure_threshold=1,
        recovery_timeout=0.01,
    )

    async def operacao_com_falha():
        return False

    await disjuntor.call(
        operacao_com_falha,
        fallback=False,
        is_failure=lambda valor: valor is False,
    )

    await asyncio.sleep(0.02)

    async def operacao_bem_sucedida():
        return True

    resultado = await disjuntor.call(
        operacao_bem_sucedida,
        fallback=False,
        is_failure=lambda valor: valor is False,
    )

    assert resultado is True
    assert disjuntor.state == CircuitState.CLOSED
    assert disjuntor.failure_count == 0



@pytest.mark.asyncio
async def test_excecao_original_e_preservada_sem_alternativa():
    disjuntor = CircuitBreaker("teste", failure_threshold=1)

    async def operacao_com_falha():
        raise RuntimeError("Erro original do serviço")

    with pytest.raises(RuntimeError, match="Erro original do serviço"):
        await disjuntor.call(operacao_com_falha)

    assert disjuntor.state == CircuitState.OPEN



@pytest.mark.asyncio
async def test_apenas_uma_sonda_e_liberada_na_recuperacao():
    disjuntor = CircuitBreaker(
        "teste",
        failure_threshold=1,
        recovery_timeout=0.01,
    )
    alternativa = "alternativa"

    async def operacao_com_falha():
        return False

    await disjuntor.call(
        operacao_com_falha,
        fallback=False,
        is_failure=lambda valor: valor is False,
    )

    await asyncio.sleep(0.02)

    inicio = asyncio.Event()
    liberar = asyncio.Event()

    async def operacao_de_teste():
        inicio.set()
        await liberar.wait()
        return "recuperado"

    primeira_chamada = asyncio.create_task(
        disjuntor.call(
            operacao_de_teste,
            fallback=alternativa,
        )
    )

    await inicio.wait()

    segunda_resposta = await disjuntor.call(
        operacao_de_teste,
        fallback=alternativa,
    )

    assert segunda_resposta == alternativa

    liberar.set()

    assert await primeira_chamada == "recuperado"
    assert disjuntor.state == CircuitState.CLOSED


def test_rejeita_configuracoes_invalidas():
    with pytest.raises(ValueError):
        CircuitBreaker("teste", failure_threshold=0)

    with pytest.raises(ValueError):
        CircuitBreaker("teste", recovery_timeout=0)



@pytest.mark.asyncio
async def test_circuito_aberto_sem_alternativa_gera_erro_especifico():
    disjuntor = CircuitBreaker("teste", failure_threshold=1)

    async def operacao_com_falha():
        raise RuntimeError("Falha do serviço")

    # A primeira chamada executa o serviço e preserva o erro original.
    with pytest.raises(RuntimeError, match="Falha do serviço"):
        await disjuntor.call(operacao_com_falha)

    # A segunda chamada encontra o circuito aberto e não tem alternativa.
    with pytest.raises(CircuitOpenError, match="está aberto"):
        await disjuntor.call(operacao_com_falha)
