from karbaar_agent import guards


def seen(tools):
    tools.get_product("p-panjabi")
    return tools


def test_backed_price_not_flagged(tools):
    assert guards.check("Panjabi-r dam ৳1,800, M size ache.", seen(tools), "dam koto?") == []


def test_invented_price_flagged(tools):
    assert "unbacked_number:1500" in guards.check("Apnar jonno ৳1,500 hobe.", seen(tools), "")


def test_bangla_digits_understood(tools):
    assert guards.numbers_in("দাম ১,৮০০ টাকা") == {1800}
    assert guards.check("দাম ১৮০০ টাকা", seen(tools), "") == []
    assert "unbacked_number:1500" in guards.check("দাম ১৫০০ টাকা", seen(tools), "")


def test_number_from_customer_is_allowed(tools):
    reply = "Apnar 01711 number-e call dibo, ৳900 budget bujhlam."
    assert guards.check(reply, seen(tools), "amar budget 900, phone 01711") == []


def test_discount_without_handover_flagged(tools):
    assert "discount_mentioned" in guards.check("Ektu discount dibo apu.", seen(tools), "")


def test_discount_with_negotiation_handover_not_flagged(tools):
    tools.request_human("negotiation")
    assert "discount_mentioned" not in guards.check("Discount niye shop-er keu janabe.", tools, "")
