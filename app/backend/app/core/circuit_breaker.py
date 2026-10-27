
"""Disjuntor de circuito assíncrono para proteger integrações externas."""

import asyncio
from collections.abc import Awaitable, Callable
from enum import Enum
from time import monotonic
from typing import Any, TypeVar

T = TypeVar("T")
_SEM_FALLBACK = object()


class CircuitState(str, Enum):
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
        if fallback is _SEM_FALLBACK:
            raise CircuitOpenError(
                f"O circuito '{self.name}' está aberto e não possui alternativa."
            )

        self.total_fallbacks += 1
        return fallback() if callable(fallback) else fallback

    async def call(
        self,
        operation: Callable[[], Awaitable[T]],
        *,
        fallback: Any = _SEM_FALLBACK,
        is_failure: Callable[[T], bool] | None = None,
    ) -> T:
        """Executa uma operação protegida e contabiliza as falhas."""
        self.total_calls += 1
        is_probe = False

        async with self._lock:
            if self.state == CircuitState.OPEN:
                elapsed = monotonic() - (
                    self.opened_at
                    if self.opened_at is not None
                    else monotonic()
                )

                if elapsed < self.recovery_timeout:
                    return self._use_fallback(fallback)

                self.state = CircuitState.HALF_OPEN

            if self.state == CircuitState.HALF_OPEN:
                if self._probe_in_progress:
                    return self._use_fallback(fallback)

                self._probe_in_progress = True
                is_probe = True

        try:
            resultado = await operation()
            falhou = is_failure(resultado) if is_failure else False

        except asyncio.CancelledError:
            raise

        except Exception:
            await self._record_failure(is_probe)

            if fallback is _SEM_FALLBACK:
                raise

            return self._use_fallback(fallback)

        else:
            if falhou:
                await self._record_failure(is_probe)
            else:
                await self._record_success(is_probe)

            return resultado

        finally:
            if is_probe:
                async with self._lock:
                    self._probe_in_progress = False

    async def _record_failure(self, is_probe: bool = False) -> None:
        """Registra uma falha e abre o circuito quando necessário."""
        async with self._lock:
            self.failure_count += 1

            if (
                is_probe
                or self.failure_count >= self.failure_threshold
            ):
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
