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

## Run it

Needs Node 24+ with pnpm, Python 3.12+ with [uv](https://docs.astral.sh/uv/), and
[just](https://just.systems).

```sh
cp agent/.env.example agent/.env   # add a model API key (OpenAI, Gemini or OpenRouter)
just dev                           # installs everything, starts the agent and the dashboard
```

Open the URL the dashboard prints. Without a key in `agent/.env`, `just dev` starts only the
dashboard and the Inbox uses pre-written drafts. Reloading the page resets the demo.

In the Inbox, open a chat, press the sparkle button and choose **New draft**.

Other recipes (`just` lists them all):

| Recipe | What it does |
|---|---|
| `just web` | The dashboard alone, with pre-written drafts |
| `just agent` | The agent's HTTP API alone (`POST /draft`) |
| `just draft` | One draft from `agent/examples/stock_question.json`, printed as JSON |
| `just test` | The agent's tests and the dashboard's type-check |
| `just build` | A production build of the dashboard |

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
