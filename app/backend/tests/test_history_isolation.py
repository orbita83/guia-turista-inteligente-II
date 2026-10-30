import subprocess
import sys

from fastapi.testclient import TestClient

from app.core.dependencies import get_storage
from app.core.storage import TripStorage
from app.main import app


def test_persistent_transactions_do_not_lose_updates_across_processes(tmp_path) -> None:
    path = tmp_path / "viagens.json"
    assert TripStorage(path).list_for_user("google-user") == []
    assert not path.exists()
    code = (
        "import sys\n"
        "from app.core.storage import TripStorage\n"
        "storage = TripStorage(sys.argv[1])\n"
        "for index in range(20):\n"
        "    storage.add_for_user('google-user', {'id': f'{sys.argv[2]}-{index}'}, {'tipo': 'google'})\n"
    )
    processes = [
        subprocess.Popen(
            [sys.executable, "-c", code, str(path), prefix],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for prefix in ("a", "b")
    ]
    for process in processes:
        _, errors = process.communicate(timeout=15)
        assert process.returncode == 0, errors
    ids = {trip["id"] for trip in TripStorage(path).list_for_user("google-user")}
    assert len(ids) == 40


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
            assert len(history.json()["viagens"]) == 1
            assert history.json()["viagens"][0]["id"] == "trip-a"
            assert history.json()["viagens"][0]["destino"] == "Recife"
            assert history.json()["viagens"][0]["atrativos_fonte"] == "catalogo_local"
            assert "trip-private" not in history.text
            assert client.delete("/api/v1/roteiros/trip-private").status_code == 204
            assert storage.list_for_user("bob") == [{"id": "trip-private", "destino": "Olinda"}]
            assert client.post("/api/v1/auth/google", json={"credential": "bob"}).status_code == 200
            bob_history = client.get("/api/v1/roteiros/minhas-viagens").json()["viagens"]
            assert len(bob_history) == 1
            assert bob_history[0]["id"] == "trip-private"
            assert bob_history[0]["destino"] == "Olinda"
            assert bob_history[0]["atrativos_fonte"] == "catalogo_local"
    finally:
        app.dependency_overrides.clear()
