from fastapi.testclient import TestClient

from app.core.dependencies import get_storage
from app.core.storage import TripStorage
from app.main import app


def test_history_and_deletion_remain_scoped_to_active_identity(tmp_path, monkeypatch) -> None:
    from app.routers import auth

    storage = TripStorage(tmp_path / "viagens.json")
    storage.add_for_user("alice", {"id": "trip-a", "destino": "Recife"}, {"tipo": "google"})
    storage.add_for_user("bob", {"id": "trip-private", "destino": "Olinda"}, {"tipo": "google"})

    async def verify(client, credential, *, google_client_id):
        return {"sub": credential, "name": credential}

    monkeypatch.setattr(auth, "verify_google_token", verify)
    app.dependency_overrides[get_storage] = lambda: storage
    try:
        with TestClient(app) as client:
            app.state.trip_storage = storage
            assert client.post("/api/v1/auth/google", json={"credential": "alice"}).status_code == 200
            history = client.get("/api/v1/roteiros/minhas-viagens")
            assert history.status_code == 200
            assert history.json() == {"viagens": [{"id": "trip-a", "destino": "Recife"}]}
            assert "trip-private" not in history.text
            assert client.delete("/api/v1/roteiros/trip-private").status_code == 204
            assert storage.list_for_user("bob") == [{"id": "trip-private", "destino": "Olinda"}]
            assert client.post("/api/v1/auth/google", json={"credential": "bob"}).status_code == 200
            assert client.get("/api/v1/roteiros/minhas-viagens").json() == {
                "viagens": [{"id": "trip-private", "destino": "Olinda"}]
            }
    finally:
        app.dependency_overrides.clear()
