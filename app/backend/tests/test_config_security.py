from app.core.config import Settings


def test_session_secret_fallback_is_random_and_not_a_known_default(monkeypatch) -> None:
    monkeypatch.delenv("SECRET_KEY", raising=False)
    first = Settings(_env_file=None).secret_key  # type: ignore[call-arg]
    second = Settings(_env_file=None).secret_key  # type: ignore[call-arg]
    assert len(first) >= 32
    assert first != second
    assert first != "guia-turista-secret-key-2026-python"


def test_session_secret_can_be_configured_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("SECRET_KEY", "configured-test-secret-that-is-long-enough")
    assert Settings(_env_file=None).secret_key == "configured-test-secret-that-is-long-enough"  # type: ignore[call-arg]
