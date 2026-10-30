from xml.etree import ElementTree as ET

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_storage
from app.core.storage import TripStorage
from app.main import app
from app.services.gpx import GPX_NAMESPACE, generate_gpx


def sample_trip() -> dict:
    return {
        "id": "trip-1",
        "origem": "Recife & Olinda",
        "destino": "Praia <Norte>",
        "percurso": {
            "geometria": [[-8.05, -34.88], [-8.06, -34.89]],
            "altimetria": {
                "sucesso": True,
                "pontos": [
                    {"latitude": -8.05, "longitude": -34.88, "elevacao_m": 12.5},
                    {"latitude": -8.06, "longitude": -34.89, "elevacao_m": 8.0},
                ],
            },
            "autonomia": {
                "paradas": [
                    {"nome": "Parada & apoio", "coordenadas": {"latitude": -8.055, "longitude": -34.885}}
                ]
            },
            "alternativas": [
                {"titulo": "Alternativa", "geometria": [[-8.1, -35.0], [-8.2, -35.1]]}
            ],
        },
    }


def test_generate_gpx_11_uses_real_geometry_waypoints_elevation_and_escapes_text() -> None:
    document = ET.fromstring(generate_gpx(sample_trip()))
    assert document.attrib["version"] == "1.1"
    assert document.tag == f"{{{GPX_NAMESPACE}}}gpx"
    assert len(document.findall(f".//{{{GPX_NAMESPACE}}}trkpt")) == 2
    elevation = document.find(f".//{{{GPX_NAMESPACE}}}trkpt/{{{GPX_NAMESPACE}}}ele")
    assert elevation is not None and elevation.text == "12.5"
    names = [node.text for node in document.findall(f".//{{{GPX_NAMESPACE}}}wpt/{{{GPX_NAMESPACE}}}name")]
    assert names == ["Origem: Recife & Olinda", "Destino: Praia <Norte>", "Parada & apoio"]


def test_generate_gpx_selects_real_alternative() -> None:
    document = ET.fromstring(generate_gpx(sample_trip(), 0))
    points = document.findall(f".//{{{GPX_NAMESPACE}}}trkpt")
    assert points[0].attrib == {"lat": "-8.1", "lon": "-35.0"}


@pytest.mark.parametrize("geometry", [None, [], [[0, 0]], [[91, 0], [0, 0]], [[0, 180], [0, 0]]])
def test_generate_gpx_rejects_missing_or_invalid_geometry(geometry: object) -> None:
    trip = sample_trip()
    trip["percurso"]["geometria"] = geometry
    with pytest.raises((TypeError, ValueError)):
        generate_gpx(trip)


def test_gpx_endpoint_enforces_session_and_user_ownership(tmp_path, monkeypatch) -> None:
    from app.routers import auth

    storage = TripStorage(tmp_path / "trips.json")
    storage.add_for_user("alice", sample_trip(), {"tipo": "google"})
    storage.add_for_user("bob", {**sample_trip(), "id": "bob-trip"}, {"tipo": "google"})

    async def verify(_client, credential, *, google_client_id):
        return {"sub": credential, "name": credential}

    monkeypatch.setattr(auth, "verify_google_token", verify)
    app.dependency_overrides[get_storage] = lambda: storage
    try:
        with TestClient(app) as client:
            app.state.trip_storage = storage
            assert client.get("/api/v1/roteiros/trip-1/exportar/gpx").status_code == 401
            client.post("/api/v1/auth/google", json={"credential": "alice"})
            response = client.get("/api/v1/roteiros/trip-1/exportar/gpx")
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("application/gpx+xml")
            assert response.headers["content-disposition"].endswith('"rota-trip-1.gpx"')
            assert client.get("/api/v1/roteiros/bob-trip/exportar/gpx").status_code == 404
            alternative = client.get("/api/v1/roteiros/trip-1/exportar/gpx?alternative=0")
            assert alternative.status_code == 200
            assert b'lat="-8.1" lon="-35.0"' in alternative.content
    finally:
        app.dependency_overrides.clear()
