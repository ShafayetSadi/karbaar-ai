"""What the dashboard sends the agent and what it gets back.

The dashboard sends a snapshot of the shop with every request: catalog, stock and delivery options.
The agent keeps no data of its own, so the tools answer from exactly what the merchant sees.
Money is always integer minor units of BDT (poisha): 180000 is ৳1,800.
"""

from typing import Literal

from pydantic import BaseModel, Field

Language = Literal["bn", "banglish", "en"]
Intent = Literal[
    "greeting", "product_qa", "stock_check", "delivery_info", "order_intent", "complaint",
    "human_request", "negotiation", "other",
]
HandoffReason = Literal["complaint", "negotiation", "human_request", "unsure"]


class Variant(BaseModel):
    id: str
    options: dict[str, str] = Field(default_factory=dict)
    stock: int
    price_minor: int | None = None  # None: the product's price


class Product(BaseModel):
    id: str
    name: str
    description: str = ""
    aliases: list[str] = Field(default_factory=list)
    price_minor: int
    variants: list[Variant]


class DeliveryOption(BaseModel):
    id: str
    name: str
    fee_minor: int
    days: str
    inside_dhaka: bool


class Message(BaseModel):
    author: Literal["customer", "shop", "agent"]
    text: str


class Customer(BaseModel):
    name: str | None = None
    phone: str | None = None
    district: str | None = None
    area: str | None = None
    address_line: str | None = None


class DraftRequest(BaseModel):
    shop_name: str
    catalog: list[Product]
    delivery_options: list[DeliveryOption]
    conversation: list[Message] = Field(min_length=1)
    customer: Customer | None = None
    # The merchant's note for this one draft ("offer the navy one instead").
    hint: str | None = Field(default=None, max_length=500)


class QuoteLine(BaseModel):
    product_id: str
    variant_id: str
    name: str
    quantity: int
    unit_price_minor: int
    line_total_minor: int


class OrderProposal(BaseModel):
    lines: list[QuoteLine]
    subtotal_minor: int
    delivery_option_id: str
    delivery_fee_minor: int
    total_minor: int


class ToolCall(BaseModel):
    name: str
    arguments: dict
    ok: bool


class Draft(BaseModel):
    reply_text: str
    language: Language
    intent: Intent
    needs_human: bool
    handoff_reason: HandoffReason | None
    product_refs: list[str]
    order_proposal: OrderProposal | None
    # Problems code found in the reply, e.g. a number no tool returned. The merchant sees them.
    flags: list[str]
    tool_calls: list[ToolCall]
    model: str
