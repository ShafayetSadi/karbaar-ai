"""One draft: a short tool loop over an OpenAI-compatible chat model, then code decides what is true.

The model proposes the wording. Code owns everything else: the order proposal is the last quote
the `quote_order` tool computed, product references must be products a tool returned, the
hand-over comes from `request_human`, and the guards flag numbers no tool backed.
"""

import json
import os
from typing import Any, Protocol

from karbaar_agent import guards, language, prompt
from karbaar_agent.models import Draft, DraftRequest, ToolCall
from karbaar_agent.tools import SPECS, Tools

MAX_STEPS = 6
MAX_HISTORY = 20
TEMPERATURE = 0.2
INTENTS = {"greeting", "product_qa", "stock_check", "delivery_info", "order_intent", "complaint",
           "human_request", "negotiation", "other"}


class ChatClient(Protocol):
    """The slice of `openai.OpenAI` the agent uses, so tests can pass a scripted fake."""

    @property
    def chat(self) -> Any: ...


def default_client() -> tuple[ChatClient, str]:
    from openai import OpenAI

    api_key = os.environ.get("KARBAAR_LLM_API_KEY")
    if not api_key:
        raise RuntimeError("Set KARBAAR_LLM_API_KEY (see agent/.env.example).")
    client = OpenAI(api_key=api_key, base_url=os.environ.get("KARBAAR_LLM_BASE_URL") or None)
    return client, os.environ.get("KARBAAR_LLM_MODEL") or "gpt-4o-mini"


def build_user_message(request: DraftRequest) -> str:
    """The conversation and customer as JSON data: never in an instruction position."""
    return json.dumps({
        "conversation": [m.model_dump() for m in request.conversation[-MAX_HISTORY:]],
        "customer_on_file": request.customer.model_dump(exclude_none=True) if request.customer else None,
        "task": "Draft the shop's reply to the latest customer message.",
    }, ensure_ascii=False)


def _parse_final(content: str | None) -> dict[str, Any]:
    text = (content or "").strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {"reply_text": text}
    except json.JSONDecodeError:
        return {"reply_text": text}


def _as_dict(message: Any) -> dict[str, Any]:
    if hasattr(message, "model_dump"):
        return message.model_dump(exclude_none=True)
    return {
        "role": "assistant", "content": message.content or "",
        "tool_calls": [{"id": c.id, "type": "function",
                        "function": {"name": c.function.name, "arguments": c.function.arguments}}
                       for c in message.tool_calls],
    }


def generate_draft(request: DraftRequest, client: ChatClient | None = None, model: str | None = None) -> Draft:
    if client is None:
        client, model = default_client()
    model = model or "gpt-4o-mini"
    customer_texts = [m.text for m in request.conversation if m.author == "customer"]
    lang = language.reply_language(customer_texts)
    tools = Tools(request)
    calls: list[ToolCall] = []
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": prompt.build(request.shop_name, lang, request.hint)},
        {"role": "user", "content": build_user_message(request)},
    ]
    final: dict[str, Any] = {}
    for step in range(MAX_STEPS):
        last_step = step == MAX_STEPS - 1
        response = client.chat.completions.create(
            model=model, messages=messages, temperature=TEMPERATURE,
            **({} if last_step else {"tools": SPECS}),
        )
        message = response.choices[0].message
        if not getattr(message, "tool_calls", None):
            final = _parse_final(message.content)
            break
        # Echo the assistant turn as the provider sent it: Gemini attaches thought signatures to
        # tool calls (`extra_content`) and rejects the next request without them.
        messages.append(_as_dict(message))
        for call in message.tool_calls:
            result, arguments, ok = tools.call(call.function.name, call.function.arguments)
            calls.append(ToolCall(name=call.function.name, arguments=arguments, ok=ok))
            messages.append({"role": "tool", "tool_call_id": call.id, "content": result})

    reply = str(final.get("reply_text") or "").strip()
    flags = []
    if not reply:
        flags.append("no_reply")
    conversation_text = "\n".join(m.text for m in request.conversation)
    flags += guards.check(reply, tools, conversation_text)
    refs = [r for r in final.get("product_refs") or [] if isinstance(r, str) and r in tools.seen_product_ids]
    intent = final.get("intent") if final.get("intent") in INTENTS else "other"
    return Draft(
        reply_text=reply,
        language=lang,
        intent=intent,
        needs_human=tools.handoff is not None,
        handoff_reason=tools.handoff,  # type: ignore[arg-type]
        product_refs=refs,
        order_proposal=tools.last_quote,
        flags=flags,
        tool_calls=calls,
        model=model,
    )
