"""Servidor de demonstração: aplicação real, provedores externos controlados.

Não usa credenciais nem altera o histórico normal. Execute da raiz com:
uv run --python 3.12 --with-requirements app/backend/requirements.lock python scripts/qa_demo_server.py
"""

import argparse
import asyncio
import os
import sys
import tempfile
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18001)
    args = parser.parse_args()
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "backend"))
    with tempfile.TemporaryDirectory(prefix="guia-qa-demo-") as data_dir:
        os.environ["GEMINI_API_KEY"] = "qa-provedor-controlado"
        os.environ["TRIPS_FILE"] = str(Path(data_dir) / "viagens.json")
        os.environ["LEGACY_TRIPS_FILE"] = str(Path(data_dir) / "inexistente.json")
        os.environ["CORS_ORIGINS"] = "http://127.0.0.1:15173,http://localhost:15173"
        from app.services import guide, trips
        from app.main import app
        import uvicorn

        async def provider(destination, api_key, timeout_seconds, context):
            yield "📍 Pontos turísticos\nCentro histórico e praça central.\n\n"
            await asyncio.sleep(0.7)
            if "falha" in destination.casefold():
                raise RuntimeError("falha controlada do provedor")
            if "cancelar" in destination.casefold():
                await asyncio.sleep(20)
            yield "🍽️ Culinária\nExperimente pratos regionais.\n\n"
            await asyncio.sleep(0.7)
            yield "💡 Dica de ouro\nDemonstração com provedor controlado; confirme horários localmente."

        async def geocode(client, city, state, states):
            coords = (-8.0476, -34.877) if "recife" in city.casefold() else (-8.0089, -34.8553)
            return (*coords, f"{city} - {state}")

        async def weather(*args):
            return {"temperatura": "28 °C", "umidade": "70%", "vento": "10 km/h"}

        async def route(*args):
            return {
                "distancia": "10 km", "tempo": "25 min", "modal": "carro",
                "geometria": [[-8.0476, -34.877], [-8.03, -34.86], [-8.0089, -34.8553]],
            }

        guide._request_guide_chunks = provider
        trips.geocode = geocode
        trips.get_weather = weather
        trips.get_route = route
        print("QA: provedores externos controlados; dados temporários; sem chamada ao Gemini.")
        uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
