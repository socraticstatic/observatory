#!/usr/bin/env python3
"""
Seed the Observatory dashboard with realistic LLM traffic via the LiteLLM proxy.

Usage:
    python scripts/seed_traffic.py             # full run (~40 calls)
    python scripts/seed_traffic.py --quick     # 8 calls, one per model/surface combo
    python scripts/seed_traffic.py --no-gemini # skip Gemini models
    python scripts/seed_traffic.py --quality   # inject synthetic quality scores (0-100)
"""
import argparse
import random
import time
import uuid
from openai import OpenAI

PROXY_URL = "http://localhost:4000"
PROXY_KEY  = "sk-observatory"

# Only include models confirmed working through the proxy.
# claude-sonnet/opus 4-5-20251014 IDs are rejected by Anthropic's API;
# update litellm/config.yaml when correct model names are known.
ANTHROPIC_MODELS = [
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-6",
    "claude-opus-4-7",
]

GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
]

SURFACES  = ["desktop", "api", "vscode", "cli", "automation"]
PROJECTS  = ["netbond-sdci", "observatory", "gpsail", "personal"]

# Repeated system prompt triggers Anthropic cache (>1024 tokens recommended)
SYSTEM_PROMPT = (
    "You are a highly capable AI assistant embedded in a network infrastructure management platform. "
    "Your role is to help AT&T network engineers understand complex topology data, interpret API responses, "
    "analyze routing decisions, and troubleshoot connectivity issues across hybrid cloud environments "
    "spanning Azure, AWS, and GCP. You speak plainly and precisely. You do not hedge. When uncertain, "
    "you say so directly. You prioritize operational clarity over thoroughness. The engineer you are "
    "assisting has decades of experience — do not over-explain fundamentals. Respond in plain text "
    "unless code, tables, or structured output will clearly aid comprehension. Your answers should be "
    "concise. Every word should earn its place. Do not repeat what the user said. Do not summarize "
    "your own response at the end. Treat the conversation as a high-bandwidth technical channel between "
    "peers. You have access to live telemetry, routing tables, and session logs when the user provides "
    "them. When interpreting latency data, consider baseline variance across regions. When reviewing "
    "BGP configurations, flag path asymmetries. When analyzing cost anomalies, cross-reference with "
    "utilization peaks. This system runs 24/7 across six regions. Uptime is contractually required. "
    "Your judgment matters. Be precise, be useful, be brief. "
    * 3  # repeat 3x to push past 1024-token cache threshold
)

CONVERSATIONS = [
    [
        {"role": "user", "content": "What's the difference between BGP and OSPF in a hybrid cloud context?"},
    ],
    [
        {"role": "user", "content": "Latency from us-east-1 to us-west-2 spiked 40ms at 14:00 UTC. What should I check first?"},
    ],
    [
        {"role": "user", "content": "Explain ECMP and when it breaks in AWS VPC setups."},
    ],
    [
        {"role": "user", "content": "I'm seeing asymmetric routing on a NetBond circuit. What are the common causes?"},
    ],
    [
        {"role": "user", "content": "Summarize the tradeoffs between ExpressRoute and VPN Gateway for a latency-sensitive workload."},
    ],
    [
        {"role": "user", "content": "What's the recommended MTU for VXLAN over a 10G backbone?"},
    ],
    [
        {"role": "user", "content": "Draft a runbook section for IPv6 dual-stack rollout on existing BGP peers."},
    ],
    [
        {"role": "user", "content": "How do I detect a routing loop in a multi-region MPLS network?"},
    ],
    [
        {"role": "user", "content": "What's the fastest way to validate ECMP is working across 4 paths?"},
    ],
    [
        {"role": "user", "content": "Explain the difference between full mesh and hub-and-spoke VPN topologies."},
    ],
]

def make_session() -> tuple[str, str, str]:
    session_id = str(uuid.uuid4())
    surface    = random.choice(SURFACES)
    project    = random.choice(PROJECTS)
    return session_id, surface, project


# Quality baselines by model family (mean ± variance)
QUALITY_PROFILE: dict[str, tuple[float, float]] = {
    "claude-opus":      (95.0, 3.0),
    "claude-sonnet":    (89.0, 4.0),
    "claude-haiku":     (81.0, 5.0),
    "gemini-2.5-pro":   (88.0, 4.0),
    "gemini-2.5-flash": (80.0, 5.0),
    "default":          (85.0, 5.0),
}

def quality_for(model: str) -> float:
    for key, (mean, var) in QUALITY_PROFILE.items():
        if key != "default" and key in model:
            return round(max(0, min(100, random.gauss(mean, var))), 2)
    mean, var = QUALITY_PROFILE["default"]
    return round(max(0, min(100, random.gauss(mean, var))), 2)


def call(client: OpenAI, model: str, messages: list, session_id: str, surface: str, project: str, with_quality: bool = False) -> None:
    try:
        metadata: dict = {
            "session_id": session_id,
            "surface":    surface,
            "project":    project,
        }
        if with_quality:
            metadata["quality_score"] = quality_for(model)

        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}] + messages,
            max_tokens=256,
            extra_body={"metadata": metadata},
        )
        usage = resp.usage
        q_str = f"  q={metadata['quality_score']:.1f}" if with_quality else ""
        print(
            f"  ok  {model:<40}  in={usage.prompt_tokens:<5} out={usage.completion_tokens:<5}"
            f"  surface={surface}  project={project}{q_str}"
        )
    except Exception as e:
        print(f"  ERR {model}: {e}")


def run_full(client: OpenAI, models: list[str], with_quality: bool = False) -> None:
    # Group conversations into sessions (2-4 turns each)
    conversations = CONVERSATIONS.copy()
    random.shuffle(conversations)

    idx = 0
    while idx < len(conversations):
        session_id, surface, project = make_session()
        batch_size = random.randint(2, 4)
        batch = conversations[idx : idx + batch_size]
        idx += batch_size

        print(f"\nSession {session_id[:8]}  surface={surface}  project={project}")
        for turn in batch:
            model = random.choice(models)
            call(client, model, turn, session_id, surface, project, with_quality=with_quality)
            # Free-tier Gemini: 5 RPM. Keep all calls under that with a 14s gap.
            delay = 14.0 if model.startswith("gemini") else 0.5
            time.sleep(delay)


def run_quick(client: OpenAI, models: list[str], with_quality: bool = False) -> None:
    session_id, surface, project = make_session()
    print(f"\nQuick session {session_id[:8]}")
    for i, model in enumerate(models):
        msg = CONVERSATIONS[i % len(CONVERSATIONS)]
        call(client, model, msg, session_id, surface, project, with_quality=with_quality)
        time.sleep(0.3)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Observatory with LLM traffic")
    parser.add_argument("--quick",     action="store_true", help="One call per model")
    parser.add_argument("--no-gemini", action="store_true", help="Skip Gemini models")
    parser.add_argument("--quality",   action="store_true", help="Inject synthetic quality scores via metadata")
    args = parser.parse_args()

    models = ANTHROPIC_MODELS if args.no_gemini else ANTHROPIC_MODELS + GEMINI_MODELS

    client = OpenAI(base_url=PROXY_URL, api_key=PROXY_KEY)

    print(f"Proxy: {PROXY_URL}")
    print(f"Models: {', '.join(models)}")
    print(f"Mode: {'quick' if args.quick else 'full'}{'  +quality' if args.quality else ''}")

    if args.quick:
        run_quick(client, models, with_quality=args.quality)
    else:
        run_full(client, models, with_quality=args.quality)

    print("\nDone. Refresh the dashboard.")


if __name__ == "__main__":
    main()
