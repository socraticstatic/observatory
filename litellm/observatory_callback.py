"""
LiteLLM custom callback — fires after every successful LLM call.
Posts the full response payload to Observatory's ingest endpoint.

Registered via success_callback in config.yaml only. Do NOT also append
to litellm.callbacks — that causes double-firing (one per registration).
"""
import json
import os
import threading
import urllib.request
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
            with urllib.request.urlopen(req, timeout=5) as _:
                pass
        except Exception as e:
            print(f"[Observatory] callback error: {e}")

    def _build_usage(self, kwargs, response_obj=None):
        usage = getattr(response_obj, "usage", None) if response_obj else None
        if usage is None:
            return None
        details = getattr(usage, "completion_tokens_details", None)
        thinking_tokens = (
            getattr(details, "reasoning_tokens", None)
            or getattr(usage, "reasoning_tokens", None)
            or 0
        )
        return {
            "input_tokens":               getattr(usage, "prompt_tokens", None) or getattr(usage, "input_tokens", 0),
            "output_tokens":              getattr(usage, "completion_tokens", None) or getattr(usage, "output_tokens", 0),
            "thinking_tokens":            thinking_tokens,
            "cache_read_input_tokens":    getattr(usage, "cache_read_input_tokens", 0),
            "cache_creation_input_tokens":getattr(usage, "cache_creation_input_tokens", 0),
        }

    def _build_meta(self, kwargs):
        _lp_meta = (kwargs.get("litellm_params") or {}).get("metadata") or {}
        return {
            "session_id": _lp_meta.get("session_id"),
            "surface":    _lp_meta.get("surface"),
            "project":    _lp_meta.get("project"),
        }

    def _build_payload(self, kwargs, response_obj, start_time, end_time, error=False):
        latency = (end_time - start_time).total_seconds() if end_time and start_time else None
        payload = {
            "model":               kwargs.get("model", ""),
            "custom_llm_provider": kwargs.get("custom_llm_provider", ""),
            "usage":               self._build_usage(kwargs, response_obj),
            "response_cost":       kwargs.get("response_cost"),
            "response_time":       latency,
            "content_type":        "llm_call",
            "metadata":            self._build_meta(kwargs),
        }
        if error:
            exception = kwargs.get("exception")
            payload["error"] = True
            payload["error_message"] = str(exception) if exception else "unknown"
            payload["response_cost"] = 0
            payload["response"] = {}
        else:
            payload["response"] = (
                response_obj.model_dump() if hasattr(response_obj, "model_dump") else {}
            )
        return payload

    # ── sync path ────────────────────────────────────────────────────────────

    def log_success_event(self, kwargs, response_obj, start_time, end_time):
        payload = self._build_payload(kwargs, response_obj, start_time, end_time)
        threading.Thread(target=self._post, args=(payload,), daemon=True).start()

    def log_failure_event(self, kwargs, response_obj, start_time, end_time):
        payload = self._build_payload(kwargs, response_obj, start_time, end_time, error=True)
        threading.Thread(target=self._post, args=(payload,), daemon=True).start()

    # ── async path ───────────────────────────────────────────────────────────
    # LiteLLM calls EITHER the sync OR the async handler depending on context.
    # Keep both so both paths are covered without double-firing.

    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        payload = self._build_payload(kwargs, response_obj, start_time, end_time)
        threading.Thread(target=self._post, args=(payload,), daemon=True).start()

    async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time):
        payload = self._build_payload(kwargs, response_obj, start_time, end_time, error=True)
        threading.Thread(target=self._post, args=(payload,), daemon=True).start()


observatory_logger = ObservatoryLogger()
