"""Disjuntor de circuito assíncrono para proteger integrações externas."""

import asyncio
from collections.abc import Awaitable, Callable
from enum import StrEnum
from time import monotonic
from typing import Any, TypeVar

T = TypeVar("T")
_NO_FALLBACK: Any = object()


class CircuitState(StrEnum):
    """Estados possíveis do disjuntor de circuito."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(Exception):
    """Indica que o circuito está aberto e não há alternativa definida."""


class CircuitBreaker:
    """Controla falhas consecutivas e permite testar a recuperação do serviço."""

    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        recovery_timeout: float = 15.0,
    ) -> None:
        if failure_threshold < 1:
            raise ValueError("O limite de falhas deve ser maior que zero.")
        if recovery_timeout <= 0:
            raise ValueError("O tempo de recuperação deve ser maior que zero.")

        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.opened_at: float | None = None
        self.total_calls = 0
        self.total_fallbacks = 0

        self._probe_in_progress = False
        self._lock = asyncio.Lock()

    def _use_fallback(self, fallback: Any) -> Any:
        """Retorna a alternativa ou informa que ela não foi definida."""
        if fallback is _NO_FALLBACK:
            raise CircuitOpenError(
                f"O circuito '{self.name}' está aberto e não possui alternativa."
            )

        self.total_fallbacks += 1
        return fallback() if callable(fallback) else fallback

    async def call(
        self,
        operation: Callable[[], Awaitable[T]],
        *,
        fallback: Any = _NO_FALLBACK,
        is_failure: Callable[[T], bool] | None = None,
    ) -> T:
        """Executa uma operação protegida e contabiliza as falhas.

        - Exceção na operação: conta como falha e devolve o fallback
          (ou relança a exceção original, se não houver fallback).
        - ``is_failure(resultado)`` verdadeiro: conta como falha, mas devolve o
          resultado (para serviços que já devolvem a contingência sem lançar erro).
          Se o próprio ``is_failure`` lançar exceção, ela é tratada como falha.
        - Circuito aberto: devolve o fallback sem chamar a operação.
        """
        self.total_calls += 1
        is_probe = False

        async with self._lock:
            if self.state == CircuitState.OPEN:
                still_waiting = (
                    self.opened_at is not None
                    and monotonic() - self.opened_at < self.recovery_timeout
                )
                if still_waiting:
                    return self._use_fallback(fallback)

                self.state = CircuitState.HALF_OPEN

            if self.state == CircuitState.HALF_OPEN:
                if self._probe_in_progress:  # só uma chamada de teste por vez
                    return self._use_fallback(fallback)

                self._probe_in_progress = True
                is_probe = True

        try:
            result = await operation()
            failed = is_failure(result) if is_failure else False

        except asyncio.CancelledError:
            # Cancelamento do cliente não é falha do provedor.
            raise

        except Exception:
            await self._record_failure(is_probe)

            if fallback is _NO_FALLBACK:
                raise

            return self._use_fallback(fallback)

        else:
            if failed:
                await self._record_failure(is_probe)
            else:
                await self._record_success(is_probe)

            return result

        finally:
            if is_probe:
                async with self._lock:
                    self._probe_in_progress = False

    async def _record_failure(self, is_probe: bool = False) -> None:
        """Registra uma falha e abre o circuito quando necessário."""
        async with self._lock:
            self.failure_count += 1

            if is_probe or self.failure_count >= self.failure_threshold:
                self.state = CircuitState.OPEN
                self.opened_at = monotonic()

    async def _record_success(self, is_probe: bool = False) -> None:
        """Registra o sucesso sem fechar um circuito aberto por outra chamada."""
        async with self._lock:
            if is_probe and self.state == CircuitState.HALF_OPEN:
                self.failure_count = 0
                self.opened_at = None
                self.state = CircuitState.CLOSED
            elif self.state == CircuitState.CLOSED:
                self.failure_count = 0

    def status(self) -> dict[str, str | int | float | None]:
        """Retorna informações do disjuntor para diagnóstico."""
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "total_calls": self.total_calls,
            "total_fallbacks": self.total_fallbacks,
            "opened_at": self.opened_at,
        }