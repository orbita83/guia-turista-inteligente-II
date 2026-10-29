import httpx
import pytest

from app.services.integrations import get_route


@pytest.mark.asyncio
async def test_osrm_geometry_is_requested_and_converted_to_frontend_lat_lon() -> None:
    def response(request: httpx.Request) -> httpx.Response:
        assert request.url.params["overview"] == "full"
        assert request.url.params["geometries"] == "geojson"
        return httpx.Response(200, json={"code": "Ok", "routes": [{
            "distance": 1000, "duration": 120,
            "geometry": {"type": "LineString", "coordinates": [[-34.9, -8.0], [-34.8, -8.1]]},
        }]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
        route = await get_route(client, -8, -34.9, -8.1, -34.8)
    assert route["geometria"] == [[-8.0, -34.9], [-8.1, -34.8]]
    assert route["distancia"] == "1.0 km"
    assert route["tempo"] == "0h 2min de carro"


@pytest.mark.parametrize("geometry", [
    None, {"type": "Point", "coordinates": [-34, -8]},
    {"type": "LineString", "coordinates": [[-34, -8]]},
    {"type": "LineString", "coordinates": [[-34, -8], [180, -8]]},
    {"type": "LineString", "coordinates": [[-34, -8], [-34, 91]]},
    {"type": "LineString", "coordinates": [[-34, -8], [True, -8]]},
    {"type": "LineString", "coordinates": [[-34, -8], ["-34", -8]]},
])
@pytest.mark.asyncio
async def test_invalid_geometry_never_becomes_exportable(geometry) -> None:
    payload = {"code": "Ok", "routes": [{"distance": 1000, "duration": 120, "geometry": geometry}]}
    async with httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json=payload)
    )) as client:
        route = await get_route(client, -8, -34.9, -8.1, -34.8)
    assert "geometria" not in route
    assert route["distancia"] == "1.0 km"
