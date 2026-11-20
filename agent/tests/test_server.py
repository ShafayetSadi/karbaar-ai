import pytest
from fastapi.testclient import TestClient

from karbaar_agent import server
from karbaar_agent.models import Draft

client = TestClient(server.app, raise_server_exceptions=False)


@pytest.fixture
def stub(monkeypatch):
    def install(result):
        def fake(request):
            if isinstance(result, Exception):
                raise result
            return result
        monkeypatch.setattr(server, "generate_draft", fake)
    return install


def test_draft_returns_draft(payload, stub):
    stub(Draft(reply_text="Ji apu.", language="banglish", intent="greeting", needs_human=False,
               handoff_reason=None, product_refs=[], order_proposal=None, flags=[], tool_calls=[], model="m"))
    res = client.post("/draft", json=payload)
    assert res.status_code == 200
    assert res.json()["reply_text"] == "Ji apu."
    assert res.json()["language"] == "banglish"


def test_runtime_error_is_503(payload, stub):
    stub(RuntimeError("Set KARBAAR_LLM_API_KEY"))
    res = client.post("/draft", json=payload)
    assert res.status_code == 503
    assert "KARBAAR_LLM_API_KEY" in res.json()["detail"]


def test_other_error_is_502_without_trace(payload, stub):
    stub(ValueError("secret internal detail sk-123"))
    res = client.post("/draft", json=payload)
    assert res.status_code == 502
    assert "Traceback" not in res.text
    assert "sk-123" not in res.text and "ValueError" not in res.text


def test_empty_conversation_is_422(payload, stub):
    stub(RuntimeError("must not be reached"))
    payload["conversation"] = []
    assert client.post("/draft", json=payload).status_code == 422
