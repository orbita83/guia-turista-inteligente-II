"""Persistência JSON compatível com a estrutura de viagens do monólito."""

import json
import threading
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4


def default_trips_data() -> dict[str, Any]:
    return {
        "versao_schema": "1.0",
        "descricao": "Base consolidada de roteiros turísticos e telemetria por usuário",
        "atualizado_em": datetime.now(UTC).isoformat(),
        "total_usuarios": 0,
        "total_roteiros": 0,
        "provedores": {
            "geocoding": "Open-Meteo Geocoding API",
            "previsao_tempo": "Open-Meteo Forecast API",
            "roteamento": "OSRM Routing Engine",
            "inteligencia_artificial": "Google Gemini (gemini-3.6-flash)",
        },
        "usuarios": {},
    }


class TripStorage:
    """Lê e escreve viagens persistentes e mantém as viagens de visitante em memória."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self._lock = threading.RLock()
        self._visitor_trips: dict[str, list[dict[str, Any]]] = {}
        self._active_sessions: dict[str, tuple[str, str]] = {}

    def register_session(self, session_id: str, user_id: str, kind: str) -> None:
        with self._lock:
            self._active_sessions[session_id] = (user_id, kind)

    def valid_session(self, session_id: str, user_id: str, kind: str) -> bool:
        with self._lock:
            return self._active_sessions.get(session_id) == (user_id, kind)

    def revoke_session(self, session_id: str) -> None:
        with self._lock:
            self._active_sessions.pop(session_id, None)

    def consume_session(self, session_id: str, user_id: str, kind: str) -> bool:
        with self._lock:
            if self._active_sessions.get(session_id) != (user_id, kind):
                return False
            del self._active_sessions[session_id]
            return True

    @staticmethod
    def _is_visitor(user_id: str) -> bool:
        return user_id.startswith("visitante_")

    def _read_unlocked(self) -> dict[str, Any]:
        if not self.path.exists():
            data = default_trips_data()
            self._write_unlocked(data)
            return data
        try:
            with self.path.open("r", encoding="utf-8") as file:
                data = json.load(file)
        except (json.JSONDecodeError, OSError):
            return default_trips_data()
        return data if isinstance(data, dict) else default_trips_data()

    def _write_unlocked(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = self.path.with_name(f".{self.path.name}.{uuid4().hex}.tmp")
        try:
            with temporary_path.open("w", encoding="utf-8") as file:
                json.dump(data, file, indent=2, ensure_ascii=False)
                file.flush()
            temporary_path.replace(self.path)
        finally:
            temporary_path.unlink(missing_ok=True)

    def ensure_visitor(self, user_id: str) -> None:
        with self._lock:
            self._visitor_trips.setdefault(user_id, [])

    def forget_visitor(self, user_id: str) -> None:
        with self._lock:
            self._visitor_trips.pop(user_id, None)

    def all_data(self) -> dict[str, Any]:
        with self._lock:
            return self._read_unlocked()

    def data_for_user(
        self, user_id: str, profile: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Exporta os metadados da base e somente o registro da identidade ativa."""
        with self._lock:
            data = self._read_unlocked()
            users = data.get("usuarios", {})
            stored_user = users.get(user_id) if isinstance(users, dict) else None
            if isinstance(stored_user, dict):
                user_data = deepcopy(stored_user)
            else:
                user_data = {
                    "perfil": deepcopy(profile or {}),
                    "roteiros": self.list_for_user(user_id),
                }
            scoped_data = {
                key: deepcopy(value) for key, value in data.items() if key != "usuarios"
            }
            scoped_data["usuarios"] = {user_id: user_data}
            scoped_data["total_usuarios"] = 1
            scoped_data["total_roteiros"] = len(user_data.get("roteiros", []))
            return scoped_data

    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        with self._lock:
            if user_id in self._visitor_trips or self._is_visitor(user_id):
                return list(self._visitor_trips.get(user_id, []))
            data = self._read_unlocked()
            user = data.get("usuarios", {}).get(user_id)
            if not isinstance(user, dict):
                return []
            trips = user.get("roteiros", [])
            return list(trips) if isinstance(trips, list) else []

    def count_for_user(self, user_id: str) -> int:
        """Contagem somente-leitura de viagens sem criar ou gravar arquivos em disco."""
        with self._lock:
            if user_id in self._visitor_trips or self._is_visitor(user_id):
                return len(self._visitor_trips.get(user_id, []))
            if not self.path.exists():
                return 0
            try:
                with self.path.open("r", encoding="utf-8") as file:
                    data = json.load(file)
            except (json.JSONDecodeError, OSError):
                return 0
            if not isinstance(data, dict):
                return 0
            user = data.get("usuarios", {}).get(user_id)
            if not isinstance(user, dict):
                return 0
            trips = user.get("roteiros", [])
            return len(trips) if isinstance(trips, list) else 0

    def add_for_user(
        self,
        user_id: str,
        item: dict[str, Any],
        profile: dict[str, Any] | None = None,
    ) -> None:
        with self._lock:
            if (
                user_id in self._visitor_trips
                or (profile or {}).get("tipo") == "visitante"
                or self._is_visitor(user_id)
            ):
                self._visitor_trips.setdefault(user_id, []).insert(0, item)
                return
            data = self._read_unlocked()
            users = data.setdefault("usuarios", {})
            if user_id not in users:
                users[user_id] = {"perfil": profile or {}, "roteiros": []}
                data["total_usuarios"] = len(users)
            trips = users[user_id].setdefault("roteiros", [])
            trips.insert(0, item)
            data["total_roteiros"] = sum(
                len(user_data.get("roteiros", [])) for user_data in users.values()
            )
            data["atualizado_em"] = datetime.now(UTC).isoformat()
            self._write_unlocked(data)

    def delete_for_user(self, user_id: str, trip_id: str) -> bool:
        with self._lock:
            if user_id in self._visitor_trips or self._is_visitor(user_id):
                trips = self._visitor_trips.get(user_id, [])
                filtered = [trip for trip in trips if trip.get("id") != trip_id]
                self._visitor_trips[user_id] = filtered
                return len(filtered) != len(trips)
            data = self._read_unlocked()
            users = data.get("usuarios", {})
            user = users.get(user_id)
            if not isinstance(user, dict):
                return False
            trips = user.get("roteiros", [])
            filtered = [trip for trip in trips if trip.get("id") != trip_id]
            if len(filtered) == len(trips):
                return False
            user["roteiros"] = filtered
            data["total_roteiros"] = sum(
                len(user_data.get("roteiros", [])) for user_data in users.values()
            )
            data["atualizado_em"] = datetime.now(UTC).isoformat()
            self._write_unlocked(data)
            return True

    def update_attraction_visit(
        self,
        user_id: str,
        trip_id: str,
        attraction_id: str,
        visited: bool,
    ) -> list[str] | None:
        """Atualiza a marcação de um atrativo somente na viagem do usuário ativo."""
        with self._lock:
            is_visitor = user_id in self._visitor_trips or self._is_visitor(user_id)
            if is_visitor:
                trips = self._visitor_trips.get(user_id, [])
                data = None
            else:
                data = self._read_unlocked()
                users = data.get("usuarios", {})
                user = users.get(user_id) if isinstance(users, dict) else None
                trips = user.get("roteiros", []) if isinstance(user, dict) else []

            if not isinstance(trips, list):
                return None
            trip = next(
                (
                    item
                    for item in trips
                    if isinstance(item, dict) and item.get("id") == trip_id
                ),
                None,
            )
            if trip is None:
                return None

            ids = trip.get("atrativos_visitados_ids")
            visited_ids = (
                list(dict.fromkeys(item for item in ids if isinstance(item, str)))
                if isinstance(ids, list)
                else []
            )
            if visited:
                if attraction_id not in visited_ids:
                    visited_ids.append(attraction_id)
            else:
                visited_ids = [item for item in visited_ids if item != attraction_id]
            trip["atrativos_visitados_ids"] = visited_ids

            if not is_visitor and data is not None:
                data["atualizado_em"] = datetime.now(UTC).isoformat()
                self._write_unlocked(data)
            return visited_ids
