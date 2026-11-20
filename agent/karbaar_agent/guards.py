"""Checks code runs on the model's reply before the merchant sees it.

The model only phrases facts; these catch it inventing one. A flag does not block the draft: the
merchant sees it next to the reply and decides.
"""

import re

from karbaar_agent.tools import Tools

_BANGLA_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
_DISCOUNT = re.compile(r"discount|ছাড়(?!া)|chhar|char dibo|kom\s*(?:dibo|kore|rakh)|কম\s*(?:দিব|করে|রাখ)", re.I)


def numbers_in(text: str) -> set[int]:
    found = set()
    for raw in _NUMBER.findall(text.translate(_BANGLA_DIGITS)):
        try:
            found.add(int(float(raw.replace(",", ""))))
        except ValueError:
            continue
    return found


def check(reply: str, tools: Tools, conversation_text: str) -> list[str]:
    flags = []
    allowed = tools.numbers_returned | numbers_in(conversation_text)
    unbacked = sorted(n for n in numbers_in(reply) if n not in allowed and n > 1)
    if unbacked:
        flags.append("unbacked_number:" + ",".join(str(n) for n in unbacked))
    if _DISCOUNT.search(reply) and tools.handoff != "negotiation":
        flags.append("discount_mentioned")
    if len(reply) > 2000:
        flags.append("too_long_for_messenger")
    return flags
