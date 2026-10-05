import json
import urllib.request
from typing import Any


OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "qwen2.5:3b"


AI_EXPLANATION_SCHEMA = {
    "type": "object",
    "properties": {
        "executive_summary": {
            "type": "string"
        },
        "route_impact": {
            "type": "string"
        },
        "inventory_impact": {
            "type": "string"
        },
        "risk_explanation": {
            "type": "string"
        },
        "recommended_actions": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
    },
    "required": [
        "executive_summary",
        "route_impact",
        "inventory_impact",
        "risk_explanation",
        "recommended_actions",
    ],
    "additionalProperties": False,
}


def _ensure_text(value: Any) -> str:
    """
    Guarantee that an explanation field
    is returned as plain text.
    """

    if isinstance(value, str):
        return value

    return json.dumps(
        value,
        ensure_ascii=False,
    )


def _ensure_actions(value: Any) -> list[str]:
    """
    Guarantee recommended_actions
    is always a list of strings.
    """

    if not isinstance(value, list):
        return [
            _ensure_text(value)
        ]

    return [
        _ensure_text(item)
        for item in value
    ]


def explain_simulation_result(
    user_message: str,
    parsed_scenario: dict,
    simulation_result: Any,
) -> dict:
    """
    Use the local LLM only to explain
    deterministic simulation results.

    The LLM is not allowed to recalculate
    or alter simulation values.
    """

    if hasattr(
        simulation_result,
        "model_dump",
    ):
        simulation_data = (
            simulation_result.model_dump()
        )
    else:
        simulation_data = simulation_result

    prompt = f"""
You are a supply-chain risk analyst.

The numerical results below were produced by
a deterministic Python simulation engine.

STRICT RULES:

STRICT RULES:

1. Do not recalculate any number.
2. Do not invent any number.
3. Do not modify any supplied number.
4. Use only the supplied simulation results.
5. Do not claim certainty beyond the data.
6. Recommendations are suggestions only.
7. Do not claim a recommendation has already
   been implemented.
8. Every explanation field must be plain text.
9. Do not return nested objects inside
   explanation fields.
10. Keep recommendations as an array of strings.

11. Use these exact location names when an ID
    appears in a route:

    SH_SUP = Shanghai Supplier
    SH_PORT = Shanghai Port
    ROT = Rotterdam Port
    ANT = Antwerp Port
    HAM = Hamburg Port
    FRA_WH = Frankfurt Warehouse
    BER = Berlin Customer

12. Never guess or expand a node ID into a
    different city or location name.

13. Distinguish these time concepts carefully:

    - disruption_days =
      duration of the stated disruption.

    - replenishment_arrival_days =
      time at which alternative supply reaches
      that location.

    - days_of_inventory =
      how long existing inventory can satisfy
      demand.

    - shortage_days_before_replenishment =
      time between inventory exhaustion and
      alternative replenishment arrival.

14. projected_shortage and
    emergency_inventory_required are calculated
    using the replenishment-arrival horizon when
    replenishment_arrival_days is available.

15. Do NOT say that projected_shortage was caused
    only by demand during disruption_days if the
    calculation extends to a later
    replenishment_arrival_days value.

16. When explaining inventory impact, explicitly
    state the replenishment arrival day and the
    shortage window whenever those fields are
    available.

17. Preserve the exact meaning of all deterministic
    fields. Do not reinterpret them.

18. When explaining cost changes, do not attribute
    the increase to fuel alone when the disrupted
    route is also different from the baseline route.

    If both rerouting and a fuel-price increase are
    present, explain that the cost impact reflects
    both the route change and the fuel-cost shock.

    
Return exactly these fields:

executive_summary
route_impact
inventory_impact
risk_explanation
recommended_actions

EXECUTIVE SUMMARY:
Briefly explain the overall operational impact.

ROUTE IMPACT:
Explain in plain text:
- baseline route
- disrupted route
- cost change
- lead-time change

INVENTORY IMPACT:
Explain in plain text:
- inventory coverage
- replenishment arrival
- shortage window
- emergency inventory requirement
- stockout exposure

RISK EXPLANATION:
Explain why the final risk level was assigned.

RECOMMENDED ACTIONS:
Provide practical mitigation recommendations.
Recommendations may include:
- emergency inventory
- expedited transport
- alternate ports
- temporary sourcing
- inventory reallocation
- safety-stock adjustment
- supplier diversification

ORIGINAL USER SCENARIO:

{user_message}

PARSED SCENARIO:

{json.dumps(
    parsed_scenario,
    indent=2,
)}

DETERMINISTIC SIMULATION RESULTS:

{json.dumps(
    simulation_data,
    indent=2,
)}

Return only the required JSON object.
"""

    payload = json.dumps(
        {
            "model": MODEL_NAME,
            "prompt": prompt,
            "stream": False,
            "format": AI_EXPLANATION_SCHEMA,
            "options": {
                "temperature": 0.1
            },
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={
            "Content-Type":
                "application/json"
        },
        method="POST",
    )

    with urllib.request.urlopen(
        request,
        timeout=300,
    ) as response:

        result = json.loads(
            response
            .read()
            .decode("utf-8")
        )

    explanation = json.loads(
        result["response"]
    )

    return {
        "executive_summary":
            _ensure_text(
                explanation.get(
                    "executive_summary",
                    "",
                )
            ),

        "route_impact":
            _ensure_text(
                explanation.get(
                    "route_impact",
                    "",
                )
            ),

        "inventory_impact":
            _ensure_text(
                explanation.get(
                    "inventory_impact",
                    "",
                )
            ),

        "risk_explanation":
            _ensure_text(
                explanation.get(
                    "risk_explanation",
                    "",
                )
            ),

        "recommended_actions":
            _ensure_actions(
                explanation.get(
                    "recommended_actions",
                    [],
                )
            ),
    }
