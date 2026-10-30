"""Indicadores operacionais agregados sem expor informações de usuários."""
from time import monotonic
from typing import Any


def operational_snapshot(
    storage: Any, started_at: float, *, active_http_requests: int | None = None
) -> dict[str, int | float]:
    """Uptime do processo atual e quantidade de roteiros duravelmente persistidos.

    Viagens temporárias de visitantes ficam apenas em memória e não entram
    na contagem. Não usa o campo legado total_roteiros, que pode estar desatualizado.
    """
    total = storage.count_all_persisted()
    snapshot: dict[str, int | float] = {
        "uptime_seconds": round(max(0.0, monotonic() - started_at), 3),
        "total_roteiros_persistidos": total,
    }
    if active_http_requests is not None:
        snapshot["requisicoes_http_ativas"] = active_http_requests
    return snapshot
