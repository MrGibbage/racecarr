def test_healthz_returns_ok(client) -> None:
    resp = client.get("/api/healthz")
    assert resp.status_code == 200
    assert resp.json().get("status") == "ok"


def test_readyz_returns_ready(client) -> None:
    resp = client.get("/api/readyz")
    assert resp.status_code == 200
    assert resp.json().get("status") == "ready"
