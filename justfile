# Karbaar demo. `just` lists the recipes; `just dev` runs everything.

# The agent's model settings (KARBAAR_LLM_*) are read from agent/.env when it exists.
set dotenv-path := "agent/.env"

agent_port := env("AGENT_PORT", "8000")

# List the recipes
default:
    @just --list

# Install the dashboard's and the agent's dependencies
install:
    cd web && pnpm install
    cd agent && uv sync

# Run the dashboard and the AI agent together (dashboard only if no model key is set)
dev: install
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "${KARBAAR_LLM_API_KEY:-}" ]; then
        echo "KARBAAR_LLM_API_KEY is not set (see agent/.env.example): starting the dashboard with scripted drafts."
        cd web && exec pnpm dev
    fi
    uv run --directory agent uvicorn karbaar_agent.server:app --port {{ agent_port }} &
    agent_pid=$!
    trap 'kill "$agent_pid" 2>/dev/null || true' EXIT INT TERM
    cd web && VITE_AGENT_URL=http://localhost:{{ agent_port }} pnpm dev

# Run only the dashboard, with scripted drafts
web:
    cd web && pnpm dev

# Run only the AI agent's HTTP API
agent:
    cd agent && uv run uvicorn karbaar_agent.server:app --port {{ agent_port }}

# Draft one reply from a JSON request with the real model, e.g. `just draft examples/stock_question.json`
draft request="examples/stock_question.json":
    cd agent && uv run karbaar-agent {{ request }}

# Agent tests and the dashboard's type-check
test:
    cd agent && uv run pytest -q
    cd web && pnpm typecheck

# Production build of the dashboard (set VITE_AGENT_URL to point it at a deployed agent)
build:
    cd web && pnpm build
