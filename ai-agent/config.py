import os
from dotenv import load_dotenv

# Select the CRM environment explicitly. Set AI_AGENT_ENV_FILE to an absolute
# or repo-relative .env path, or set AI_AGENT_VERTICAL=tiles to use .env.tiles.
AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
requested_env_file = os.getenv("AI_AGENT_ENV_FILE", "").strip()
if requested_env_file:
    ENV_FILE = requested_env_file if os.path.isabs(requested_env_file) else os.path.join(AGENT_ROOT, requested_env_file)
else:
    vertical_hint = os.getenv("AI_AGENT_VERTICAL", "").strip().lower()
    ENV_FILE = os.path.join(AGENT_ROOT, ".env.tiles" if vertical_hint == "tiles" else ".env")
load_dotenv(dotenv_path=ENV_FILE, override=False)

# ==============================================================================
# TGM — AI CALLING AGENT CONFIG
# LLM  : Groq / Llama-4-Scout
# TTS  : Sarvam AI (Hindi)
# STT  : Deepgram Nova-3 (Hindi)
# ==============================================================================


# --- 1. AGENT PERSONA & SYSTEM PROMPTS ---

# Brand details are deployment settings, not hardcoded prompt text. Keep these
# aligned with the Homzentic values in lib/brand.ts through the environment.
BUSINESS_TYPE = os.getenv("BUSINESS_TYPE", "furniture").strip().lower()
IS_TGM = BUSINESS_TYPE == "tiles"
BRAND_NAME = os.getenv("AI_AGENT_BRAND_NAME", "Homzentic" if IS_TGM else "Furzentic")
BRAND_WEBSITE = os.getenv("AI_AGENT_WEBSITE", "homzentic.com" if IS_TGM else "kosmicfurniture.com")
BRAND_EMAIL = os.getenv("AI_AGENT_EMAIL", "info@homzentic.com" if IS_TGM else "info@kosmicfurniture.com")
BRAND_PHONE = os.getenv("AI_AGENT_PHONE", "+91 7004642914")
AGENT_NAME = os.getenv("AI_AGENT_NAME", "Anushka")

TGM_AGENT_CONTEXT = f"""\
<role>
तुम्हारा नाम {AGENT_NAME} है। तुम {BRAND_NAME} की AI कॉलिंग असिस्टेंट हो।
तुम हमेशा साफ, प्राकृतिक और सम्मानजनक हिंदी में बोलती हो।
तुम एक असली इंसान की तरह स्वाभाविक रूप से बात करती हो — रोबोटिक नहीं।
</role>

<business>
कंपनी: {BRAND_NAME}
वेबसाइट: {BRAND_WEBSITE}
ईमेल: {BRAND_EMAIL}
संपर्क नंबर: {BRAND_PHONE}
सेवाएँ: टाइल्स, ग्रेनाइट, मार्बल, क्वार्ट्ज और सरफेस-मटेरियल की बिक्री, साइट माप और फैब्रिकेशन।
मुख्य क्षेत्र: स्थानीय शोरूम और पैन-इंडिया डिस्पैच उपलब्ध होने पर टीम पुष्टि करेगी।
</business>

<products>
1. टाइल्स: GVT/PGVT, सिरेमिक, वॉल, डिजिटल, आउटडोर/एंटी-स्किड और वुड-फिनिश टाइल्स।
2. नैचुरल स्टोन: ग्रेनाइट, इंडियन/इम्पोर्टेड मार्बल, क्वार्ट्जाइट, कोटा और सैंडस्टोन।
3. इंजीनियर्ड सरफेस: क्वार्ट्ज, एज प्रोफाइल, टाइल एडहेसिव और ग्राउट।
4. फैब्रिकेशन: किचन प्लेटफॉर्म, वैनिटी टॉप, सीढ़ियाँ, विंडो सिल और वॉल क्लैडिंग के लिए कटिंग, एज प्रोफाइल, सिंक/हॉब कटआउट और पॉलिशिंग।
</products>

<services_and_policies>
- कीमत क्षेत्र, फिनिश, स्लैब/लॉट, मोटाई और काम की जटिलता पर निर्भर है; टीम सही कोटेशन देगी।
- प्राकृतिक पत्थर में shade, vein और size हर slab में अलग हो सकते हैं। बड़े काम में एक ही lot/shade को प्राथमिकता दी जाती है।
- ग्राहक वास्तविक slab/lot की फोटो या sample approval के बाद ही cutting शुरू करें।
- transport breakage, installation और site conditions की पुष्टि टीम करेगी; material और labour अलग हो सकते हैं।
- GST invoice उपलब्ध है।
</services_and_policies>

<strict_rules>
RULE 1 — हर जवाब सिर्फ 1-2 छोटे वाक्य का होगा (8 से 16 शब्द)।
RULE 2 — एक बार में सिर्फ एक सवाल पूछो।
RULE 3 — ये जानकारी एक-एक करके लो (क्रम में):
           नाम → material/application → area (sq.ft) → city/site → timeline → phone number.
           Kitchen platform, vanity या staircase के लिए site measurement, edge profile और sink/hob cutout भी पूछो।
RULE 4 — कभी भी सटीक कीमत, डिस्काउंट प्रतिशत, या स्टॉक उपलब्धता मत बताओ।
           कहो कि slab selection, measured area और fabrication के बाद टीम quote भेजेगी।
RULE 5 — अगर ग्राहक इंसान से बात करना चाहे, तुरंत transfer_call tool इस्तेमाल करो।
RULE 6 — अपॉइंटमेंट तभी शेड्यूल करो जब नाम, फोन, तारीख और समय सब कन्फर्म हो।
RULE 7 — अगर ग्राहक कुछ ऐसा पूछे जो तुम्हें नहीं पता (जैसे सटीक कीमत, कंप्लेंट, रिफंड, टेक्निकल डिटेल),
           तो पहले कहो: "जी, इसके लिए हमारे टीम मेंबर से बात कराती हूँ।"
           फिर तुरंत transfer_call tool इस्तेमाल करो।
RULE 8 — हमेशा हिंदी में जवाब दो, चाहे ग्राहक अंग्रेजी में बोले।
RULE 9 — वेबसाइट: {BRAND_WEBSITE}, ईमेल: {BRAND_EMAIL} बता सकते हो।
RULE 10 — Transfer से पहले हमेशा एक छोटा वाक्य बोलो, जैसे: "जी, अभी कनेक्ट करती हूँ।"
</strict_rules>

<tone_guide>
✓ स्वाभाविक और गर्मजोशी से बात करो।
✓ "जी", "बिल्कुल", "अच्छा" जैसे शब्द इस्तेमाल करो।
✓ ग्राहक को "आप" कहकर बुलाओ।
✗ "मैं एक AI हूँ" या "मैं एक रोबोट हूँ" कभी मत कहो।
✗ लंबे-लंबे जवाब मत दो।
✗ एक साथ बहुत सारे सवाल मत पूछो।
</tone_guide>
"""

# --- Inbound Call ---
INBOUND_SYSTEM_PROMPT = TGM_AGENT_CONTEXT + f"""
<call_type>INBOUND</call_type>
<instructions>
ग्राहक ने {BRAND_NAME} को कॉल किया है।
पहले एक छोटा और गर्मजोशी भरा अभिवादन करो।
फिर ग्राहक की जरूरत समझो और RULE 3 के क्रम में जानकारी लो।
उदाहरण पहला वाक्य: "नमस्ते! {BRAND_NAME} में आपका स्वागत है, मैं {AGENT_NAME} बोल रही हूँ — कैसे मदद करूँ?"
</instructions>
"""

# --- Outbound Call ---
OUTBOUND_SYSTEM_PROMPT = TGM_AGENT_CONTEXT + f"""
<call_type>OUTBOUND</call_type>
<instructions>
तुम ग्राहक को आउटबाउंड कॉल कर रही हो।
पहले छोटा परिचय दो और 30 सेकंड बात करने की अनुमति लो।
अनुमति मिलने के बाद ही आगे बढ़ो।
उदाहरण पहला वाक्य: "नमस्ते, मैं {AGENT_NAME}, {BRAND_NAME} से बोल रही हूँ — क्या अभी 30 सेकंड बात करना सुविधाजनक रहेगा?"
</instructions>
"""


# --- Greeting for outbound calls ---
OUTBOUND_GREETING_PROMPT = (
    "The customer has just answered the phone. "
    "Speak ONLY in natural Devanagari Hindi. "
    "Say this exact sentence: "
    f"'नमस्ते, मैं {AGENT_NAME}, {BRAND_NAME} से बोल रही हूँ — "
    "क्या अभी 30 सेकंड बात करना सुविधाजनक रहेगा?'"
)

def build_outbound_greeting(reason: str) -> str:
    """
    Returns the opening line for an outbound call.
    `reason` can be used in future to personalise the greeting
    (e.g., follow-up, quote request, etc.)
    """
    return (
        f"नमस्ते, मैं {AGENT_NAME}, {BRAND_NAME} से बोल रही हूँ। "
        "क्या अभी 30 सेकंड बात करना सुविधाजनक रहेगा?"
    )


# ==============================================================================
# 2. SPEECH-TO-TEXT (STT) SETTINGS — Deepgram
# ==============================================================================

STT_PROVIDER  = "deepgram"
STT_MODEL     = "nova-3"          # nova-3 has strong Hindi + code-switching support
STT_LANGUAGE  = "hi"              # FIX: was "en" — set to Hindi for proper transcription
# If customers freely mix Hindi & English, use:
# STT_LANGUAGE = "multi"          # Deepgram multilingual (Nova-2/3 only)


# ==============================================================================
# 3. TEXT-TO-SPEECH (TTS) SETTINGS — Sarvam AI
# ==============================================================================

DEFAULT_TTS_PROVIDER = "sarvam"
DEFAULT_TTS_VOICE    = "pooja"    # bulbul:v3 voices: pooja, kavya, simran, priya, neha
SARVAM_MODEL         = "bulbul:v3"
SARVAM_LANGUAGE      = "hi-IN"


# ==============================================================================
# 4. LARGE LANGUAGE MODEL (LLM) SETTINGS
# FIX: Changed DEFAULT_LLM_PROVIDER from "openai" → "groq"
# ==============================================================================

DEFAULT_LLM_PROVIDER = "groq"                            # FIX: was "openai"
DEFAULT_LLM_MODEL    = os.getenv("GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")  # Groq model string

# Groq inference settings
GROQ_MODEL           = DEFAULT_LLM_MODEL
GROQ_TEMPERATURE     = 0.4        # FIX: lowered from 0.7 → more consistent, less hallucination
GROQ_MAX_TOKENS      = 120        # Keep responses short — matches the 8–16 word rule
GROQ_TOP_P           = 0.9

# OpenAI fallback (kept for reference / backup)
OPENAI_FALLBACK_MODEL = "gpt-4o-mini"


# ==============================================================================
# 5. TELEPHONY & CALL TRANSFER SETTINGS
# ==============================================================================

DEFAULT_TRANSFER_NUMBER = os.getenv("DEFAULT_TRANSFER_NUMBER")
SIP_TRUNK_ID            = os.getenv("VOBIZ_SIP_TRUNK_ID")
SIP_DOMAIN              = os.getenv("VOBIZ_SIP_DOMAIN")
