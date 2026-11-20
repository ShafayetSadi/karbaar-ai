import json

import pytest

from karbaar_agent.tools import taka


def quote(tools, lines, district):
    return tools.call("quote_order", json.dumps({"lines": lines, "district": district}))


def test_quote_inside_dhaka_adds_inside_fee(tools):
    out, _, ok = quote(tools, [{"variant_id": "v-m-white", "quantity": 2}], "Dhaka")
    assert ok
    q = tools.last_quote
    assert q.subtotal_minor == 360000
    assert q.delivery_option_id == "d-in" and q.delivery_fee_minor == 7000
    assert q.total_minor == q.subtotal_minor + q.delivery_fee_minor == 367000
    assert json.loads(out)["total"] == "৳3,670"


def test_quote_other_district_uses_outside_fee(tools):
    quote(tools, [{"variant_id": "v-l-navy", "quantity": 1}], "Sylhet")
    q = tools.last_quote
    assert q.delivery_option_id == "d-out"
    assert q.total_minor == 180000 + 13000


@pytest.mark.parametrize("line,fragment", [
    ({"variant_id": "v-m-white", "quantity": 13}, "Only 12 left"),
    ({"variant_id": "v-l-white", "quantity": 1}, "Only 0 left"),
    ({"variant_id": "v-nope", "quantity": 1}, "No variant"),
    ({"variant_id": "v-m-white", "quantity": 0}, "Quantity must be"),
])
def test_quote_refusals_are_error_json(tools, line, fragment):
    out, _, ok = quote(tools, [line], "Dhaka")
    assert not ok
    assert fragment in json.loads(out)["error"]
    assert tools.last_quote is None


def test_quote_non_numeric_quantity_returns_error(tools):
    out, _, ok = quote(tools, [{"variant_id": "v-m-white", "quantity": "two"}], "Dhaka")
    assert not ok and "error" in json.loads(out)


def test_check_stock_options_case_insensitive(tools):
    out, _, ok = tools.call("check_stock", json.dumps(
        {"product_id": "p-panjabi", "options": {"size": "l", "COLOUR": "white"}}))
    result = json.loads(out)
    assert ok
    assert [m["variant_id"] for m in result["matches"]] == ["v-l-white"]
    assert result["matches"][0]["in_stock"] is False


def test_check_stock_unknown_option_says_nothing_matched(tools):
    out, _, _ = tools.call("check_stock", json.dumps(
        {"product_id": "p-panjabi", "options": {"Size": "XXL"}}))
    result = json.loads(out)
    assert result["matches"] == []
    assert "No variant" in result["note"]


def test_search_by_english_name(tools):
    result = tools.search_products("do you have cotton panjabi?")
    assert [p["product_id"] for p in result["products"]] == ["p-panjabi"]


def test_search_by_latin_alias(tools):
    assert tools.search_products("panjabi")["products"][0]["product_id"] == "p-panjabi"


def test_search_by_bangla_alias(tools):
    assert tools.search_products("পাঞ্জাবি")["products"][0]["product_id"] == "p-panjabi"


@pytest.mark.parametrize("minor,expected", [(180000, "৳1,800"), (7000, "৳70"), (0, "৳0"),
                                            (150050, "৳1,500.50"), (123456789, "৳1,234,567.89")])
def test_taka_format(minor, expected):
    assert taka(minor) == expected
