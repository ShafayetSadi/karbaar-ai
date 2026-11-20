from karbaar_agent import language


def test_bangla_script(payload):
    assert language.reply_language(["আপনার কাছে পাঞ্জাবি আছে?"]) == "bn"


def test_example_message_is_banglish(request_):
    texts = [m.text for m in request_.conversation if m.author == "customer"]
    assert language.reply_language(texts) == "banglish"


def test_plain_english_question():
    assert language.reply_language(["Do you have this in blue? What is the price?"]) == "en"


def test_trailing_ok_defers_to_earlier_message():
    assert language.reply_language(["Bhaiyer jonno panjabi lagbe, L size white ache? dam koto?", "ok"]) == "banglish"
    assert language.reply_language(["Do you have this in blue?", "ok"]) == "en"
