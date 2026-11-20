# Karbaar

An AI-first workspace for Bangladesh's social commerce. Shops that sell through a Facebook Page
answer Messenger chats, take orders and keep their catalog in one place. An AI sales assistant
drafts each reply in the customer's language (Bangla, Banglish or English) with real prices and
stock, and the merchant approves it before it is sent.

This repository is a **demo** with two parts:

- `web/`: the merchant dashboard (Home, Inbox, Orders, Products, Settings). It runs entirely in
  the browser on synthetic data, with no backend and no sign-in.
- `agent/`: the AI sales assistant, a small Python service that drafts replies with a real
  language model and tools over the shop's catalog, stock and delivery fees.

## Run the dashboard

Needs Node 24+ and pnpm.

```sh
cd web
pnpm install
pnpm dev
```

Open the URL it prints. Reloading the page resets the demo. Without the agent, the Inbox uses
pre-written drafts.

## Run with the live AI agent

Needs Python 3.12+, [uv](https://docs.astral.sh/uv/) and an API key for any OpenAI-compatible
model with tool calling (OpenAI, Gemini or OpenRouter; see `agent/.env.example`).

```sh
# terminal 1
cd agent
uv sync
export KARBAAR_LLM_API_KEY=...            # e.g. a Gemini key
export KARBAAR_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
export KARBAAR_LLM_MODEL=gemini-3.1-flash-lite
uv run uvicorn karbaar_agent.server:app --port 8000

# terminal 2
cd web
VITE_AGENT_URL=http://localhost:8000 pnpm dev
```

In the Inbox, open a chat, press the sparkle button and choose **New draft**. You can also try
the agent without the dashboard: `uv run karbaar-agent examples/stock_question.json`.

## How the agent works

The model writes the words. Code owns the facts.

1. The dashboard sends a snapshot of the shop (catalog, stock, delivery options) and the
   conversation. Customer messages go to the model as JSON data, never as instructions.
2. The model calls tools: `search_products`, `get_product`, `check_stock`, `delivery_options`,
   `quote_order` and `request_human`. The tools are plain deterministic code. Prices, stock,
   fees and totals come only from them.
3. Code checks the result. The order proposal is the last `quote_order` result, not the
   model's arithmetic. Product references must be products a tool returned. A guard flags any
   number in the reply that no tool or message backs, and any discount the model offers on its own.
4. The draft goes to the merchant, who sends, edits or rejects it. Complaints, discount
   requests and questions the tools can't answer are handed to a person.

It replies in the customer's language: Bangla, Banglish or English.

Tests: `cd agent && uv run pytest`.

## How the demo works

The dashboard calls the same typed API client as the real product. In this build every `/v1/*`
request is answered by mock handlers in `web/src/demo/` from an in-memory shop: "Nakshi Ghor",
its catalog and its customers. The handlers are type-checked against the API schema
(`web/openapi.demo.json`), so the mock data matches what the real API returns.

Things to try:

- **Inbox:** open Nusrat's chat to see an AI draft that checks stock and offers an alternative
  colour. Open Tanvir's chat and press the sparkle button to watch a draft being generated.
- **Orders:** move an order from Pending to Confirmed, Shipped and Delivered.
- **Products:** filter by low or out of stock, and adjust stock on a variant.

All names, phone numbers and emails are synthetic.

## License

Proprietary. You may read and run this code to evaluate it, but not copy, modify or reuse it. See [LICENSE](LICENSE).
