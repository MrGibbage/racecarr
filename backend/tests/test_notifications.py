def _login(client):
    resp = client.post("/api/auth/login", json={"password": "admin", "remember_me": False})
    assert resp.status_code == 200


def test_notifications_crud_and_test(client, monkeypatch):
    _login(client)

    resp = client.post(
        "/api/notifications/targets",
        json={"type": "apprise", "url": "discord://token/webhook", "name": "Discord"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert any(t["type"] == "apprise" for t in data.get("targets", []))

    resp = client.post(
        "/api/notifications/targets",
        json={"type": "webhook", "url": "https://example.com/hook", "name": "Hook", "secret": "s"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data.get("targets", [])) == 2
    assert all("secret" not in t for t in data.get("targets", []))

    resp = client.get("/api/notifications/targets")
    assert resp.status_code == 200
    assert len(resp.json().get("targets", [])) == 2

    resp = client.delete("/api/notifications/targets/0")
    assert resp.status_code == 204
    resp = client.get("/api/notifications/targets")
    assert len(resp.json().get("targets", [])) == 1

    called = {}

    def _fake_send(targets, **kwargs):
        called["targets"] = targets
        return True, []

    monkeypatch.setattr("app.api.routes.send_notifications", _fake_send)
    resp = client.post("/api/notifications/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert called.get("targets") is not None
