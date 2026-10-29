"""Indicadores operacionais agregados sem expor informações de usuários."""
from time import monotonic
from typing import Any


def operational_snapshot(storage: Any, started_at: float) -> dict[str, int | float]:
    """Uptime do processo atual e quantidade de roteiros duravelmente persistidos.

    Viagens temporárias de visitantes ficam apenas em memória e não entram
    na contagem. Não usa o campo legado total_roteiros, que pode estar desatualizado.
    """
    data = storage.all_data()
    users = data.get("usuarios", {}) if isinstance(data, dict) else {}
    total = sum(
        len(user["roteiros"])
        for user in users.values()
        if isinstance(user, dict) and isinstance(user.get("roteiros"), list)
    ) if isinstance(users, dict) else 0
    return {
        "uptime_seconds": round(max(0.0, monotonic() - started_at), 3),
        "total_roteiros_persistidos": total,
    }
