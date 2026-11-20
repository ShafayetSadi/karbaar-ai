"""HTTP API for the dashboard demo: `POST /draft` takes a shop snapshot and returns a draft."""

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from karbaar_agent.agent import generate_draft
from karbaar_agent.models import Draft, DraftRequest

app = FastAPI(title="Karbaar sales assistant (demo)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get(
        "KARBAAR_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:4173").split(",") if o.strip()],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/draft")
def draft(request: DraftRequest) -> Draft:
    try:
        return generate_draft(request)
    except RuntimeError as error:  # missing configuration
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:  # the model provider failed: no stack trace to the browser
        raise HTTPException(status_code=502, detail="The model provider did not answer.") from error
