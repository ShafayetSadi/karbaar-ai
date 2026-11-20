"""Which language to reply in: Bangla script, Banglish (Bangla in Latin letters) or English."""

import re

from karbaar_agent.models import Language

_BANGLA = re.compile(r"[ঀ-৿]")
_LATIN = re.compile(r"[A-Za-z]")
# Common Banglish words. Two or more in a Latin-script message makes it Banglish.
_BANGLISH = frozenset(
    "ache achhe ase koto dam lagbe lagbo nibo nite chai chaitesi dekhte bhai vai bhaiya vaiya apu "
    "apa ki na hobe hoy hbe din den deben dile korbo korte koren kemon jabe jaben pathan pathiye "
    "taka tk ta ti te er ekhon kalke aj ajke ami amar apnar apni tomar valo bhalo thik ase naki "
    "kothay kobe kivabe keno size color colour delivery charge".split()
)
_ENGLISH_ONLY = frozenset("the is are do you have what how much can please price available".split())


def detect(text: str) -> Language:
    bangla = len(_BANGLA.findall(text))
    latin = len(_LATIN.findall(text))
    if bangla and bangla >= latin:
        return "bn"
    words = re.findall(r"[a-z]+", text.lower())
    banglish = sum(1 for w in words if w in _BANGLISH and w not in _ENGLISH_ONLY)
    english = sum(1 for w in words if w in _ENGLISH_ONLY)
    return "banglish" if banglish >= 2 and banglish >= english else "en"


def reply_language(customer_messages: list[str]) -> Language:
    """The latest customer message decides; a very short one ("ok", "?") defers to earlier ones."""
    for text in reversed(customer_messages):
        if len(re.findall(r"\w+", text)) >= 2:
            return detect(text)
    return detect(customer_messages[-1]) if customer_messages else "en"
