"""
LiteLLM custom callback — fires after every successful LLM call.
Posts the full response payload to Observatory's ingest endpoint.
"""
import json
import os
import threading
import urllib.request
import urllib.error
from litellm.integrations.custom_logger import CustomLogger


class ObservatoryLogger(CustomLogger):
    def __init__(self):
        self.endpoint = os.environ.get(
            "OBSERVATORY_INGEST_URL", "http://localhost:3099/api/ingest"
        )
        self.secret = os.environ.get("LITELLM_CALLBACK_SECRET", "")

    def _post(self, payload: dict):
        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                self.endpoint,
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "X-LiteLLM-Signature": self.secret,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                pass  # fire-and-forget
        except Exception as e:
            print(f"[Observatory] callback error: {e}")

    def log_success_event(self, kwargs, response_obj, start_time, end_time):
        latency = (end_time - start_time).total_seconds() if end_time and start_time else None
        payload = {
            "model": kwargs.get("model", ""),
            "custom_llm_provider": kwargs.get("custom_llm_provider", ""),
            "usage": getattr(response_obj, "usage", None) and {
                "input_tokens": getattr(response_obj.usage, "prompt_tokens", None)
                    or getattr(response_obj.usage, "input_tokens", 0),
                "output_tokens": getattr(response_obj.usage, "completion_tokens", None)
                    or getattr(response_obj.usage, "output_tokens", 0),
                "cache_read_input_tokens": getattr(response_obj.usage, "cache_read_input_tokens", 0),
                "cache_creation_input_tokens": getattr(response_obj.usage, "cache_creation_input_tokens", 0),
            },
            "response_cost": kwargs.get("response_cost"),
            "response_time": latency,
            "metadata": kwargs.get("metadata", {}),
            "response": response_obj.model_dump() if hasattr(response_obj, "model_dump") else {},
        }
        threading.Thread(target=self._post, args=(payload,), daemon=True).start()

    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        self.log_success_event(kwargs, response_obj, start_time, end_time)


observatory_logger = ObservatoryLogger()

# Register on litellm.callbacks so the proxy's async path picks it up.
# The success_callback YAML key alone doesn't reach the async success handler.
import litellm as _litellm  # noqa: E402
if observatory_logger not in _litellm.callbacks:
    _litellm.callbacks.append(observatory_logger)
