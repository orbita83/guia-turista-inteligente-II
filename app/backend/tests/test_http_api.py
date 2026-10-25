from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_storage
from app.core.storage import TripStorage
from app.main import app


@pytest.fixture
def storage(tmp_path) -> TripStorage:
    return TripStorage(tmp_path / "viagens.json")


@pytest.fixture
def client(storage: TripStorage) -> Iterator[TestClient]:
    app.dependency_overrides[get_storage] = lambda: storage
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_session_bootstrap_preserves_existing_frontend_contract(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/auth/session")

    assert response.status_code == 200
    data = response.json()
    assert data["usuario"] is None
    assert data["google_client_id"]
    assert data["ufs"] == sorted(data["ufs"])
    assert len(data["ufs"]) == 27


def test_visitor_session_create_list_delete_and_logout(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    storage: TripStorage,
) -> None:
    import app.routers.trips as trips_router

    login = client.post("/api/v1/auth/visitor")
    assert login.status_code == 200
    user = login.json()["usuario"]
    assert user["tipo"] == "visitante"
    assert client.cookies

    trip: dict[str, Any] = {
        "id": "trip-1",
        "criado_em": "2026-01-01T00:00:00+00:00",
        "origem": "Recife - PE",
        "destino": "Salvador - BA",
        "clima": {"temperatura": "N/D", "umidade": "N/D", "vento": "N/D"},
        "percurso": {"distancia": "N/D", "tempo": "N/D"},
        "dicas_destino": "Guia legado",
        "diagnostico_ia": {"motivo": "chave_ausente"},
    }

    async def fake_plan_trip(form, active_user, **kwargs):
        assert active_user["id"] == user["id"]
        kwargs["storage"].add_for_user(active_user["id"], trip, active_user)
        return trip

    monkeypatch.setattr(trips_router, "plan_trip", fake_plan_trip)
    created = client.post(
        "/api/v1/roteiros/planejar",
        json={
            "origem_cidade": "Recife",
            "origem_uf": "PE",
            "destino_cidade": "Salvador",
            "destino_uf": "BA",
        },
    )
    assert created.status_code == 200
    assert created.json() == {"viagem": trip, "aviso": None}

    listed = client.get("/api/v1/roteiros/minhas-viagens")
    assert listed.status_code == 200
    assert listed.json() == {"viagens": [trip]}

    deleted = client.delete("/api/v1/roteiros/trip-1")
    assert deleted.status_code == 204
    assert client.get("/api/v1/roteiros/minhas-viagens").json() == {"viagens": []}

    logged_out = client.post("/api/v1/auth/logout")
    assert logged_out.status_code == 204
    assert client.get("/api/v1/auth/session").json()["usuario"] is None
    assert storage.list_for_user(user["id"]) == []


def test_trip_endpoints_require_a_backend_session(client: TestClient) -> None:
    assert client.get("/api/v1/roteiros/minhas-viagens").status_code == 401
    assert (
        client.post(
            "/api/v1/roteiros/planejar",
            json={
                "origem_cidade": "Recife",
                "origem_uf": "PE",
                "destino_cidade": "Salvador",
                "destino_uf": "BA",
            },
        ).status_code
        == 401
    )


def test_spoofed_user_header_does_not_authenticate(client: TestClient) -> None:
    response = client.get(
        "/api/v1/roteiros/minhas-viagens", headers={"X-User-Id": "another-user"}
    )
    assert response.status_code == 401


def test_operational_endpoints_and_request_headers(client: TestClient) -> None:
    response = client.get("/healthz", headers={"X-Request-ID": "request-test-1"})
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Request-ID"] == "request-test-1"
    assert response.headers["X-Process-Time"].endswith("ms")

    assert client.get("/readyz").json() == {"status": "ready"}


def test_old_json_file_is_read_without_changing_its_user_shape(tmp_path) -> None:
    import json

    legacy_trip = {"id": "old-trip", "origem": "Recife - PE", "destino": "Natal - RN"}
    path = tmp_path / "viagens.json"
    path.write_text(
        json.dumps(
            {
                "versao_schema": "1.0",
                "total_usuarios": 1,
                "total_roteiros": 1,
                "usuarios": {
                    "google-sub": {
                        "perfil": {"nome": "Ana", "tipo": "google"},
                        "roteiros": [legacy_trip],
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    storage = TripStorage(path)
    assert storage.list_for_user("google-sub") == [legacy_trip]
    assert storage.list_for_user("other-sub") == []


def test_google_auth_maps_verified_profile_to_session(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.routers.auth as auth_router

    async def fake_verify(client, credential, *, google_client_id):
        assert credential == "valid-credential"
        assert google_client_id
        return {
            "sub": "google-user-1",
            "name": "Ana",
            "email": "ana@example.test",
            "picture": "https://example.test/ana.png",
        }

    monkeypatch.setattr(auth_router, "verify_google_token", fake_verify)
    response = client.post(
        "/api/v1/auth/google", json={"credential": "valid-credential"}
    )
    assert response.status_code == 200
    assert response.json()["usuario"] == {
        "id": "google-user-1",
        "nome": "Ana",
        "email": "ana@example.test",
        "foto": "https://example.test/ana.png",
        "tipo": "google",
    }
    assert client.get("/api/v1/auth/session").json()["usuario"]["id"] == (
        "google-user-1"
    )


def test_expired_visitor_session_is_cleared(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    storage: TripStorage,
) -> None:
    import app.routers.auth as auth_router

    monkeypatch.setattr(auth_router, "VISITOR_TTL_SECONDS", 0)
    login = client.post("/api/v1/auth/visitor")
    visitor_id = login.json()["usuario"]["id"]
    assert storage.list_for_user(visitor_id) == []

    session = client.get("/api/v1/auth/session")
    assert session.json()["usuario"] is None
    assert client.get("/api/v1/roteiros/minhas-viagens").status_code == 401


def test_json_export_preserves_metadata_and_only_exposes_active_user(
    client: TestClient,
    storage: TripStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.routers.auth as auth_router

    storage.add_for_user(
        "google-user-1",
        {"id": "trip-a", "origem": "Recife", "destino": "Natal"},
        {"id": "google-user-1", "nome": "Ana", "tipo": "google"},
    )
    storage.add_for_user(
        "google-user-2",
        {"id": "trip-private", "origem": "Privado", "destino": "Privado"},
        {"id": "google-user-2", "nome": "Outra pessoa", "tipo": "google"},
    )

    async def fake_verify(client, credential, *, google_client_id):
        return {
            "sub": "google-user-1",
            "name": "Ana",
            "email": "ana@example.test",
        }

    monkeypatch.setattr(auth_router, "verify_google_token", fake_verify)
    client.post("/api/v1/auth/google", json={"credential": "credential"})
    response = client.get("/api/v1/roteiros/minhas-viagens/json")

    assert response.status_code == 200
    exported = response.json()
    assert exported["versao_schema"] == "1.0"
    assert exported["total_usuarios"] == 1
    assert exported["total_roteiros"] == 1
    assert set(exported["usuarios"]) == {"google-user-1"}
    assert exported["usuarios"]["google-user-1"]["roteiros"][0]["id"] == "trip-a"
    assert "google-user-2" not in response.text


def test_plan_trip_empty_city_returns_validation_error(client: TestClient) -> None:
    client.post("/api/v1/auth/visitor")
    response = client.post(
        "/api/v1/roteiros/planejar",
        json={
            "origem_cidade": " ",
            "origem_uf": "PE",
            "destino_cidade": "Salvador",
            "destino_uf": "BA",
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "origem_e_destino_obrigatorios"


def test_duplicate_trip_planning_returns_conflict(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.routers.trips as trips_router

    async def fake_plan_trip(form, active_user, **kwargs):
        return {
            "id": "trip-duplicate",
            "origem": form["origem_cidade"],
            "destino": form["destino_cidade"],
        }

    monkeypatch.setattr(trips_router, "plan_trip", fake_plan_trip)
    client.post("/api/v1/auth/visitor")
    payload = {
        "origem_cidade": "Cidade-X",
        "origem_uf": "PE",
        "destino_cidade": "Cidade-Y",
        "destino_uf": "BA",
    }
    assert client.post("/api/v1/roteiros/planejar", json=payload).status_code == 200
    duplicate = client.post("/api/v1/roteiros/planejar", json=payload)
    assert duplicate.status_code == 409
