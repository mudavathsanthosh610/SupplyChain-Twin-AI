import json
import re
import urllib.error
import urllib.request
from typing import Any

from app.config import settings


def _deterministic_fallback_parse(
    user_message: str,
    nodes: list[dict],
    routes: list[dict],
) -> dict[str, Any]:
    """
    Deterministic rule-based extractor used if Ollama is offline or unavailable.
    Guarantees the digital twin simulation always succeeds with valid company nodes.
    """
    msg_lower = user_message.lower()

    # Identify default source (supplier) and destination (customer)
    suppliers = [n["id"] for n in nodes if str(n.get("type", "")).lower() == "supplier"]
    customers = [n["id"] for n in nodes if str(n.get("type", "")).lower() == "customer"]

    default_source = suppliers[0] if suppliers else (nodes[0]["id"] if nodes else "")
    default_destination = customers[0] if customers else (nodes[-1]["id"] if nodes else "")

    # Duration extraction: "14 days", "2 weeks", "3 days", etc.
    closure_days = 0
    duration_match = re.search(r"(\d+)\s*(day|days|week|weeks|month|months)", msg_lower)
    if duration_match:
        count = int(duration_match.group(1))
        unit = duration_match.group(2)
        if "week" in unit:
            closure_days = count * 7
        elif "month" in unit:
            closure_days = count * 30
        else:
            closure_days = count

    # Fuel increase extraction: "30%", "20 percent", "fuel by 25%"
    fuel_percent = 0.0
    fuel_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:%|percent)", msg_lower)
    if fuel_match:
        fuel_percent = float(fuel_match.group(1))

    # Detect closed nodes from message matching company's node codes and names
    closure_keywords = (
        "close", "closed", "closure", "shut", "shutdown",
        "unavailable", "block", "blocked", "disrupt", "disrupted",
        "strike", "halt", "down", "offline", "damage",
    )
    is_closure_scenario = any(w in msg_lower for w in closure_keywords)

    closed_nodes = []
    if is_closure_scenario:
        for node in nodes:
            node_id = str(node["id"])
            node_name = str(node.get("name", ""))
            # Match code as word or name in message
            if (
                re.search(r"\b" + re.escape(node_id.lower()) + r"\b", msg_lower)
                or (len(node_name) > 2 and node_name.lower() in msg_lower)
            ):
                closed_nodes.append(node_id)

    # Detect closed routes
    closed_routes = []
    for route in routes:
        src = str(route.get("source", ""))
        dst = str(route.get("destination", ""))
        route_key = f"{src}->{dst}"
        if f"{src.lower()} to {dst.lower()}" in msg_lower or f"{src.lower()}->{dst.lower()}" in msg_lower:
            closed_routes.append(route_key)

    return {
        "closed_nodes": list(dict.fromkeys(closed_nodes)),
        "closed_routes": list(dict.fromkeys(closed_routes)),
        "closure_duration_days": closure_days,
        "fuel_cost_increase_percent": fuel_percent,
        "source": default_source,
        "destination": default_destination,
    }


def parse_supply_chain_scenario(
    user_message: str,
    available_nodes: list[dict] | None = None,
    available_routes: list[dict] | None = None,
) -> dict:
    nodes = available_nodes or []
    routes = available_routes or []

    # If no company nodes provided, return empty structure safely
    if not nodes:
        return {
            "closed_nodes": [],
            "closed_routes": [],
            "closure_duration_days": 0,
            "fuel_cost_increase_percent": 0,
            "source": "",
            "destination": "",
        }

    # Identify suppliers and customers for default endpoints
    suppliers = [n["id"] for n in nodes if str(n.get("type", "")).lower() == "supplier"]
    customers = [n["id"] for n in nodes if str(n.get("type", "")).lower() == "customer"]
    default_source = suppliers[0] if suppliers else nodes[0]["id"]
    default_destination = customers[0] if customers else nodes[-1]["id"]

    nodes_context_lines = [
        f"- {n['id']}: {n.get('name', n['id'])} (type: {n.get('type', 'facility')})"
        for n in nodes
    ]
    nodes_context_str = "\n".join(nodes_context_lines)

    valid_node_ids = {n["id"] for n in nodes}
    valid_route_keys = {f"{r.get('source')}->{r.get('destination')}" for r in routes if "source" in r and "destination" in r}

    prompt = f"""You are an expert supply-chain scenario parser for an active company workspace.
Convert the user's disruption request into valid JSON ONLY.

Available valid node IDs for this selected company:
{nodes_context_str}

Return EXACTLY this JSON structure:
{{
  "closed_nodes": [],
  "closed_routes": [],
  "closure_duration_days": 0,
  "fuel_cost_increase_percent": 0,
  "source": "{default_source}",
  "destination": "{default_destination}"
}}

CRITICAL RULES:
1. ONLY use node IDs from the available list above. NEVER invent or use old demo IDs like SH_SUP, ROT, BER, ANT, HAM unless they are explicitly in the available list above.
2. If a facility mentioned in the user request matches one of the company's nodes (by code or name), put its ID into "closed_nodes".
3. Convert any closure time into total number of days (e.g., "14 days" = 14, "2 weeks" = 14, "3 days" = 3).
4. Put fuel cost percentage change as a number only (e.g. 20% = 20).
5. "source" must be "{default_source}" unless the user specifically specifies a different valid source node.
6. "destination" must be "{default_destination}" unless the user specifically specifies a different valid destination node.
7. Return valid JSON only with NO markdown and NO explanations.

User disruption request:
{user_message}
"""

    payload = json.dumps(
        {
            "model": settings.ollama_parser_model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        settings.ollama_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            result = json.loads(response.read().decode("utf-8"))
        parsed = json.loads(result["response"])

        # Validate parsed IDs against selected company nodes
        parsed_closed_nodes = [
            node_id for node_id in parsed.get("closed_nodes", [])
            if node_id in valid_node_ids
        ]
        parsed_closed_routes = [
            route_key for route_key in parsed.get("closed_routes", [])
            if route_key in valid_route_keys
        ]

        source = parsed.get("source")
        if source not in valid_node_ids:
            source = default_source

        destination = parsed.get("destination")
        if destination not in valid_node_ids:
            destination = default_destination

        return {
            "closed_nodes": parsed_closed_nodes,
            "closed_routes": parsed_closed_routes,
            "closure_duration_days": int(parsed.get("closure_duration_days") or 0),
            "fuel_cost_increase_percent": float(parsed.get("fuel_cost_increase_percent") or 0),
            "source": source,
            "destination": destination,
        }

    except Exception:
        # Graceful deterministic fallback when Ollama is unavailable or errors
        return _deterministic_fallback_parse(
            user_message=user_message,
            nodes=nodes,
            routes=routes,
        )
