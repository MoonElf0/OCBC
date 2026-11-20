"""
Qwen (Alibaba Cloud Model Studio / DashScope) over its OpenAI-compatible
chat completions endpoint. Standard library only: no SDK to install.

  DASHSCOPE_API_KEY    required
  DASHSCOPE_BASE_URL   default https://dashscope-intl.aliyuncs.com/compatible-mode/v1
                       (the international endpoint; mainland China accounts use
                       https://dashscope.aliyuncs.com/compatible-mode/v1)

Used by two separate systems, each with its own model setting: the verifier's
model steps (models.QwenProvider, ASSESSMENT_MODEL) and the answering agent
(agent.model_ask, AGENT_MODEL). They share this client and nothing else.
"""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
TIMEOUT = 90


class QwenError(Exception):
    """The call did not produce usable output. The message is safe to show to the user."""


def configured() -> tuple[bool, str | None]:
    if not os.environ.get("DASHSCOPE_API_KEY"):
        return False, "DASHSCOPE_API_KEY is not set on the server."
    return True, None


def chat(model: str, system: str, user: str, *, json_mode: bool = False, temperature: float = 0.2, max_tokens: int = 4000) -> str:
    """One chat completion. Returns the assistant's text."""
    key = os.environ.get("DASHSCOPE_API_KEY")
    if not key:
        raise QwenError("DASHSCOPE_API_KEY is not set on the server.")
    base = (os.environ.get("DASHSCOPE_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
        # Qwen3+ hybrid models think by default; a non-streamed call must turn it off.
        "enable_thinking": False,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            err = json.loads(e.read().decode("utf-8")).get("error") or {}
            detail = err.get("message") or err.get("code") or ""
        except Exception:
            pass
        if e.code in (401, 403):
            raise QwenError(f"The model provider rejected the server's credentials ({e.code}). {detail}".strip())
        if e.code == 429:
            raise QwenError("The model provider is rate limiting requests. Try again shortly.")
        raise QwenError(f"The model provider returned an error ({e.code}). {detail}".strip())
    except (urllib.error.URLError, TimeoutError) as e:
        raise QwenError(f"The server could not reach the model provider ({getattr(e, 'reason', e)}).")
    try:
        choice = data["choices"][0]
        text = choice["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise QwenError("The model returned no text.")
    if choice.get("finish_reason") == "length":
        raise QwenError("The model response was cut off.")
    if not text:
        raise QwenError("The model returned no text.")
    return text


def chat_json(model: str, system: str, user: str, schema: dict) -> dict:
    """A chat call whose reply must be one JSON object matching `schema` (checked for required keys)."""
    prompt = (f"{user}\n\nReply with a single JSON object (not an array), no prose, whose keys are the properties "
              f"of this JSON Schema:\n{json.dumps(schema)}")
    text = chat(model, system, prompt, json_mode=True)
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):]
    try:
        out = json.loads(text)
    except json.JSONDecodeError:
        raise QwenError("The model returned malformed output.")
    # Qwen sometimes wraps the object in a one-element array.
    if isinstance(out, list) and len(out) == 1:
        out = out[0]
    if not isinstance(out, dict) or any(k not in out for k in schema.get("required", [])):
        raise QwenError("The model returned output in the wrong shape.")
    return out
