"""Run one draft from a JSON file: `uv run karbaar-agent examples/stock_question.json`."""

import argparse
import json
import sys

from karbaar_agent.agent import generate_draft
from karbaar_agent.models import DraftRequest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", help="a DraftRequest as JSON")
    args = parser.parse_args()
    with open(args.request, encoding="utf-8") as handle:
        request = DraftRequest.model_validate(json.load(handle))
    draft = generate_draft(request)
    json.dump(draft.model_dump(), sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == "__main__":
    main()
