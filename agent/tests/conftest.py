import copy
import json
import pathlib
from types import SimpleNamespace

import pytest

from karbaar_agent.models import DraftRequest
from karbaar_agent.tools import Tools

EXAMPLE = pathlib.Path(__file__).resolve().parent.parent / "examples" / "stock_question.json"


@pytest.fixture
def payload() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


@pytest.fixture
def request_(payload) -> DraftRequest:
    return DraftRequest.model_validate(copy.deepcopy(payload))


@pytest.fixture
def tools(request_) -> Tools:
    return Tools(request_)


def tool_call(call_id: str, name: str, arguments: dict | str):
    args = arguments if isinstance(arguments, str) else json.dumps(arguments)
    return SimpleNamespace(id=call_id, function=SimpleNamespace(name=name, arguments=args))


def response(content: str | None = None, tool_calls: list | None = None):
    message = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class FakeClient:
    """Scripted stand-in for openai.OpenAI: returns queued responses, records each call's kwargs."""

    def __init__(self, *responses):
        self.queue = list(responses)
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        kwargs["messages"] = list(kwargs["messages"])  # the agent keeps appending to its list
        self.calls.append(kwargs)
        return self.queue.pop(0)
