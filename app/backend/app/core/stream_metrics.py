"""Métricas do corpo SSE; duração HTTP até cabeçalhos é medida separadamente."""

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram


class StreamMetrics:
    def __init__(self, registry: CollectorRegistry) -> None:
        self.active = Gauge(
            "guia_stream_active", "Streams SSE ativos.", registry=registry
        )
        self.finished = Counter(
            "guia_stream_finished_total",
            "Streams SSE encerrados por resultado.",
            ["outcome"],
            registry=registry,
        )
        self.first = Histogram(
            "guia_stream_first_content_seconds",
            "Tempo até primeiro fragmento real do provedor.",
            registry=registry,
        )
        self.duration = Histogram(
            "guia_stream_duration_seconds",
            "Duração integral do stream.",
            ["outcome"],
            registry=registry,
        )
        self.conflicts = Counter(
            "guia_stream_conflicts_total", "Pedidos SSE simultâneos rejeitados.",
            registry=registry,
        )
        self.fallbacks = Counter(
            "guia_stream_fallback_total", "Streams que usaram contingência.",
            registry=registry,
        )

    def __call__(self, event: str, elapsed: float) -> None:
        if event == "started":
            self.active.inc()
        elif event == "first_chunk":
            self.first.observe(elapsed)
        elif event == "conflict":
            self.conflicts.inc()
        elif event == "fallback":
            self.fallbacks.inc()
        elif event in {"completed", "error", "cancelled"}:
            self.active.dec()
            self.finished.labels(event).inc()
            self.duration.labels(event).observe(elapsed)
