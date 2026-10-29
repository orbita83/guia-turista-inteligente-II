import logging

from fastapi.testclient import TestClient

from app.main import app


def test_expired_session_is_rejected_even_when_visitor_cleanup_fails(
    monkeypatch, caplog
) -> None:
    from app.routers import auth

    monkeypatch.setattr(auth, "VISITOR_TTL_SECONDS", 0)
    with TestClient(app) as client:
        assert client.post("/api/v1/auth/visitor").status_code == 200

        def fail_cleanup(user_id: str) -> None:
            raise OSError("detalhe interno que não deve ir para resposta")

        monkeypatch.setattr(app.state.trip_storage, "forget_visitor", fail_cleanup)
        with caplog.at_level(logging.WARNING):
            response = client.get("/api/v1/roteiros/minhas-viagens")

        assert response.status_code == 401
        assert response.json()["detail"] == "A sessão de visitante expirou."
        assert "detalhe interno" not in response.text
        assert "OSError" in caplog.text
