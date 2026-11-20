"""The agent's tools. Deterministic code over the shop snapshot: the model asks, code answers.

Prices, stock, delivery fees and totals only ever come from here. The model may phrase them, but
it never computes them, and `guards.py` flags any number in the reply that no tool returned.
"""

import json
import re
from dataclasses import dataclass, field
from typing import Any

from karbaar_agent.models import DraftRequest, OrderProposal, Product, QuoteLine, Variant

MAX_QUANTITY = 20


class ToolError(Exception):
    """A tool refused (unknown id, not enough stock). The model sees the message and can recover."""


def taka(minor: int) -> str:
    """180000 -> '৳1,800' (whole taka when there are no poisha)."""
    whole, poisha = divmod(minor, 100)
    return f"৳{whole:,}" if not poisha else f"৳{whole:,}.{poisha:02d}"


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


@dataclass
class Tools:
    request: DraftRequest
    # Everything the tools returned in this run, for the guards and for the response.
    seen_product_ids: set[str] = field(default_factory=set)
    numbers_returned: set[int] = field(default_factory=set)
    last_quote: OrderProposal | None = None
    handoff: str | None = None

    # -- lookup helpers -------------------------------------------------------------------------

    def _product(self, product_id: str) -> Product:
        for product in self.request.catalog:
            if product.id == product_id:
                self.seen_product_ids.add(product.id)
                return product
        raise ToolError(f"No product with id {product_id}. Use search_products to find one.")

    def _variant(self, variant_id: str) -> tuple[Product, Variant]:
        for product in self.request.catalog:
            for variant in product.variants:
                if variant.id == variant_id:
                    self.seen_product_ids.add(product.id)
                    return product, variant
        raise ToolError(f"No variant with id {variant_id}. Use get_product to list variants.")

    def _price(self, product: Product, variant: Variant) -> int:
        return variant.price_minor if variant.price_minor is not None else product.price_minor

    def _remember_money(self, minor: int) -> None:
        self.numbers_returned.add(minor // 100)

    def _variant_view(self, product: Product, variant: Variant) -> dict[str, Any]:
        price = self._price(product, variant)
        self._remember_money(price)
        self.numbers_returned.add(variant.stock)
        return {
            "variant_id": variant.id,
            "options": variant.options,
            "price": taka(price),
            "in_stock": variant.stock > 0,
            "stock": variant.stock,
        }

    # -- tools ----------------------------------------------------------------------------------

    def search_products(self, query: str) -> dict[str, Any]:
        # Split on spaces and punctuation, not `\w`: Bangla vowel signs are not word characters.
        words = [w for w in re.split(r"[\s,.!?।;:()/\-]+", _norm(query)) if len(w) > 1]
        scored = []
        for product in self.request.catalog:
            haystack = _norm(" ".join([product.name, product.description, *product.aliases,
                                       *(v for var in product.variants for v in var.options.values())]))
            score = sum(1 for w in words if w in haystack)
            if _norm(product.name) in _norm(query):
                score += 3
            if score:
                scored.append((score, product))
        scored.sort(key=lambda item: -item[0])
        results = []
        for _, product in scored[:5]:
            self.seen_product_ids.add(product.id)
            self._remember_money(product.price_minor)
            results.append({
                "product_id": product.id,
                "name": product.name,
                "from_price": taka(min(self._price(product, v) for v in product.variants)),
                "options": sorted({k for v in product.variants for k in v.options}),
                "any_in_stock": any(v.stock > 0 for v in product.variants),
            })
        return {"products": results} if results else {"products": [], "note": "Nothing matched."}

    def get_product(self, product_id: str) -> dict[str, Any]:
        product = self._product(product_id)
        return {
            "product_id": product.id,
            "name": product.name,
            "description": product.description,
            "variants": [self._variant_view(product, v) for v in product.variants],
        }

    def check_stock(self, product_id: str, options: dict[str, str] | None = None) -> dict[str, Any]:
        product = self._product(product_id)
        wanted = {_norm(k): _norm(v) for k, v in (options or {}).items()}
        matches = [
            v for v in product.variants
            if all(_norm(v.options.get(k, "")) == val or
                   any(_norm(ok) == k and _norm(ov) == val for ok, ov in v.options.items())
                   for k, val in wanted.items())
        ]
        if not matches:
            return {"name": product.name, "matches": [], "note": "No variant has those options.",
                    "all_variants": [self._variant_view(product, v) for v in product.variants]}
        return {"name": product.name, "matches": [self._variant_view(product, v) for v in matches]}

    def delivery_options(self, district: str | None = None) -> dict[str, Any]:
        options = []
        for option in self.request.delivery_options:
            self._remember_money(option.fee_minor)
            self.numbers_returned.update(int(d) for d in re.findall(r"\d+", option.days))
            options.append({"delivery_option_id": option.id, "name": option.name,
                            "fee": taka(option.fee_minor), "days": option.days})
        result: dict[str, Any] = {"options": options}
        if district:
            applies = self._option_for(district)
            result["applies_to_" + _norm(district).replace(" ", "_")] = applies.id
        else:
            result["note"] = "The fee depends on the district: ask where to deliver before quoting a total."
        return result

    def _option_for(self, district: str):
        inside = _norm(district) in {"dhaka", "ঢাকা", "dhaka city"}
        for option in self.request.delivery_options:
            if option.inside_dhaka == inside:
                return option
        raise ToolError("The shop has no delivery option for that district.")

    def quote_order(self, lines: list[dict[str, Any]], district: str) -> dict[str, Any]:
        if not lines:
            raise ToolError("An order needs at least one line.")
        quote_lines = []
        for line in lines:
            product, variant = self._variant(str(line.get("variant_id", "")))
            quantity = int(line.get("quantity", 1))
            if not 1 <= quantity <= MAX_QUANTITY:
                raise ToolError(f"Quantity must be between 1 and {MAX_QUANTITY}.")
            if variant.stock < quantity:
                raise ToolError(f"Only {variant.stock} left of {product.name} {variant.options}.")
            price = self._price(product, variant)
            label = " / ".join(variant.options.values())
            quote_lines.append(QuoteLine(
                product_id=product.id, variant_id=variant.id,
                name=f"{product.name} ({label})" if label else product.name,
                quantity=quantity, unit_price_minor=price, line_total_minor=price * quantity,
            ))
        option = self._option_for(district)
        subtotal = sum(q.line_total_minor for q in quote_lines)
        self.last_quote = OrderProposal(
            lines=quote_lines, subtotal_minor=subtotal, delivery_option_id=option.id,
            delivery_fee_minor=option.fee_minor, total_minor=subtotal + option.fee_minor,
        )
        for amount in (subtotal, option.fee_minor, self.last_quote.total_minor,
                       *(q.unit_price_minor for q in quote_lines), *(q.line_total_minor for q in quote_lines)):
            self._remember_money(amount)
        self.numbers_returned.update(q.quantity for q in quote_lines)
        return {
            "lines": [{"name": q.name, "quantity": q.quantity, "unit_price": taka(q.unit_price_minor),
                       "line_total": taka(q.line_total_minor)} for q in quote_lines],
            "subtotal": taka(subtotal),
            "delivery": f"{option.name}, {taka(option.fee_minor)}",
            "total": taka(self.last_quote.total_minor),
            "payment": "Cash on delivery. bKash advance is optional.",
        }

    def request_human(self, reason: str) -> dict[str, Any]:
        if reason not in {"complaint", "negotiation", "human_request", "unsure"}:
            reason = "unsure"
        self.handoff = reason
        return {"ok": True, "note": "The shop owner will take over. Tell the customer politely that "
                                    "someone from the shop will reply shortly; promise nothing else."}

    # -- dispatch -------------------------------------------------------------------------------

    def call(self, name: str, arguments_json: str) -> tuple[str, dict[str, Any], bool]:
        try:
            arguments = json.loads(arguments_json or "{}")
        except json.JSONDecodeError:
            return json.dumps({"error": "Arguments were not valid JSON."}), {}, False
        handler = getattr(self, name, None) if name in SPECS_BY_NAME else None
        if handler is None:
            return json.dumps({"error": f"Unknown tool {name}."}), arguments, False
        try:
            result = handler(**arguments)
        except ToolError as error:
            return json.dumps({"error": str(error)}, ensure_ascii=False), arguments, False
        except (TypeError, ValueError):
            return json.dumps({"error": "Wrong arguments for this tool."}), arguments, False
        return json.dumps(result, ensure_ascii=False), arguments, True


def _fn(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object", "properties": properties, "required": required},
    }}


SPECS = [
    _fn("search_products", "Find products by what the customer called them (any language).",
        {"query": {"type": "string"}}, ["query"]),
    _fn("get_product", "A product's description, variants, prices and stock.",
        {"product_id": {"type": "string"}}, ["product_id"]),
    _fn("check_stock", "Stock for a product, optionally for specific options like {\"Size\": \"L\"}.",
        {"product_id": {"type": "string"},
         "options": {"type": "object", "additionalProperties": {"type": "string"}}}, ["product_id"]),
    _fn("delivery_options", "Delivery options and fees; pass the customer's district to learn which applies.",
        {"district": {"type": "string"}}, []),
    _fn("quote_order", "Price an order the customer wants. Call it before stating any total.",
        {"lines": {"type": "array", "items": {"type": "object", "properties": {
            "variant_id": {"type": "string"}, "quantity": {"type": "integer"}},
            "required": ["variant_id", "quantity"]}},
         "district": {"type": "string"}}, ["lines", "district"]),
    _fn("request_human", "Hand the conversation to the shop owner.",
        {"reason": {"type": "string", "enum": ["complaint", "negotiation", "human_request", "unsure"]}},
        ["reason"]),
]
SPECS_BY_NAME = {spec["function"]["name"] for spec in SPECS}
