from prometheus_client import CollectorRegistry

from app.core.stream_metrics import StreamMetrics


def test_http_scrape_exposes_exact_request_deltas_and_excludes_scraping() -> None:
    from fastapi.testclient import TestClient
    from prometheus_client.parser import text_string_to_metric_families

    from app.main import app

    def sample(body: str, name: str, labels: dict[str, str]) -> float:
        for family in text_string_to_metric_families(body):
            for item in family.samples:
                if item.name == name and item.labels == labels:
                    return float(item.value)
        return 0

    with TestClient(app) as client:
        before = client.get("/metrics").text
        assert client.get("/healthz").status_code == 200
        after = client.get("/metrics").text
        again = client.get("/metrics").text
    request_labels = {"method": "GET", "path": "/healthz", "status": "200"}
    duration_labels = {"method": "GET", "path": "/healthz"}
    assert sample(after, "http_requests_total", request_labels) - sample(before, "http_requests_total", request_labels) == 1
    assert sample(after, "http_request_duration_seconds_count", duration_labels) - sample(before, "http_request_duration_seconds_count", duration_labels) == 1
    assert sample(after, "http_request_duration_seconds_sum", duration_labels) >= sample(before, "http_request_duration_seconds_sum", duration_labels)
    assert sample(again, "http_requests_total", request_labels) == sample(after, "http_requests_total", request_labels)
    assert 'path="/metrics"' not in after


def test_stream_metrics_record_lifecycle_without_personal_labels() -> None:
    registry = CollectorRegistry()
    observe = StreamMetrics(registry)
    observe("started", 0)
    assert registry.get_sample_value("guia_stream_active") == 1
    observe("first_chunk", 0.25)
    observe("fallback", 0.5)
    observe("completed", 1.5)
    assert registry.get_sample_value("guia_stream_active") == 0
    assert registry.get_sample_value("guia_stream_first_content_seconds_sum") == 0.25
    assert registry.get_sample_value("guia_stream_fallback_total") == 1
    assert registry.get_sample_value(
        "guia_stream_finished_total", {"outcome": "completed"}
    ) == 1
    assert registry.get_sample_value(
        "guia_stream_duration_seconds_sum", {"outcome": "completed"}
    ) == 1.5
    labels = {key for metric in registry.collect() for sample in metric.samples for key in sample.labels}
    assert labels <= {"outcome", "le"}


def test_conflict_does_not_open_stream_and_cancel_error_balance_active() -> None:
    registry = CollectorRegistry()
    observe = StreamMetrics(registry)
    observe("conflict", 0)
    assert registry.get_sample_value("guia_stream_active") == 0
    assert registry.get_sample_value("guia_stream_conflicts_total") == 1
    for outcome in ("error", "cancelled"):
        observe("started", 0)
        observe(outcome, 2)
        assert registry.get_sample_value("guia_stream_active") == 0
        assert registry.get_sample_value(
            "guia_stream_finished_total", {"outcome": outcome}
        ) == 1
    assert registry.get_sample_value("guia_stream_first_content_seconds_count") == 0
