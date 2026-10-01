"""Consulta de solo lectura de uso y saldo de proveedores de IA para /panel."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone


def _get_json(url: str, headers: dict[str, str]) -> dict:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode() or "{}")


def _post_json(url: str, headers: dict[str, str], payload: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        method="POST",
        headers={**headers, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode() or "{}")


def _provider_error(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        return f"La API respondió HTTP {exc.code}. Revisa la clave y sus permisos."
    if isinstance(exc, (TimeoutError, urllib.error.URLError)):
        return "No se pudo conectar con el proveedor. Intenta actualizar."
    return "No se pudo leer la respuesta del proveedor."


def _openai_usage(now: datetime) -> dict:
    key = os.environ.get("OPENAI_ADMIN_API_KEY", "").strip()
    if not key:
        return {"configured": False}
    start = int(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp())
    end = int(now.timestamp())
    headers = {"Authorization": f"Bearer {key}"}
    org = os.environ.get("OPENAI_ORGANIZATION_ID", "").strip()
    if org:
        headers["OpenAI-Organization"] = org
    try:
        base = "https://api.openai.com/v1/organization"
        usage = _get_json(
            f"{base}/usage/completions?{urllib.parse.urlencode({'start_time': start, 'end_time': end, 'bucket_width': '1d', 'limit': 180})}",
            headers,
        )
        costs = _get_json(
            f"{base}/costs?{urllib.parse.urlencode({'start_time': start, 'end_time': end, 'bucket_width': '1d', 'limit': 180})}",
            headers,
        )
        input_tokens = output_tokens = requests = 0
        for bucket in usage.get("data", []):
            for row in bucket.get("results", []):
                input_tokens += int(row.get("input_tokens", 0) or 0)
                output_tokens += int(row.get("output_tokens", 0) or 0)
                requests += int(row.get("num_model_requests", 0) or 0)
        cost = sum(
            float(row.get("amount", {}).get("value", 0) or 0)
            for bucket in costs.get("data", [])
            for row in bucket.get("results", [])
        )
        return {
            "configured": True,
            "ok": True,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "requests": requests,
            "month_cost": round(cost, 4),
            "currency": "USD",
            "credit_balance": None,
            "note": "OpenAI no expone el saldo de créditos por esta API; el costo es el uso registrado del mes.",
        }
    except Exception as exc:  # proveedor no disponible no debe tumbar el panel
        return {"configured": True, "ok": False, "error": _provider_error(exc)}


def _xai_usage(now: datetime) -> dict:
    key = os.environ.get("XAI_MANAGEMENT_API_KEY", "").strip()
    team = os.environ.get("XAI_TEAM_ID", "").strip()
    if not key or not team:
        return {"configured": False}
    headers = {"Authorization": f"Bearer {key}"}
    encoded_team = urllib.parse.quote(team, safe="")
    base = f"https://management-api.x.ai/v1/billing/teams/{encoded_team}"
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    payload = {
        "analyticsRequest": {
            "timeRange": {
                "startTime": start.strftime("%Y-%m-%d %H:%M:%S"),
                "endTime": now.strftime("%Y-%m-%d %H:%M:%S"),
                "timezone": "Etc/GMT",
            },
            "timeUnit": "TIME_UNIT_DAY",
            "values": [{"name": "usd", "aggregation": "AGGREGATION_SUM"}],
            "groupBy": ["description"],
            "filters": [],
        }
    }
    try:
        balance, usage = _get_json(f"{base}/prepaid/balance", headers), _post_json(
            f"{base}/usage", headers, payload
        )
        total = (balance.get("total") or {}).get("val")
        spent = sum(
            float(value or 0)
            for series in usage.get("timeSeries", [])
            for point in series.get("dataPoints", [])
            for value in point.get("values", [])
        )
        return {
            "configured": True,
            "ok": True,
            "credit_balance": round(abs(float(total)) / 100, 2) if total is not None else None,
            "month_cost": round(spent, 4),
            "currency": "USD",
            "note": "Uso facturado del mes. El informe de billing de xAI no entrega tokens agregados.",
        }
    except Exception as exc:
        return {"configured": True, "ok": False, "error": _provider_error(exc)}


def _mistral_usage(now: datetime) -> dict:
    key = os.environ.get("MISTRAL_ADMIN_API_KEY", "").strip()
    if not key:
        return {"configured": False}
    query = urllib.parse.urlencode({"month": now.month, "year": now.year})
    headers = {"Authorization": f"Bearer {key}"}
    try:
        usage, limits = _get_json(
            f"https://api.mistral.ai/v1/admin/usage?{query}", headers
        ), _get_json("https://api.mistral.ai/v1/admin/spend-limit", headers)
        # Mistral returns cost arrays nested by category/model; sum numeric leaves.
        def sum_numbers(value):
            if isinstance(value, bool):
                return 0.0
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, list):
                return sum(sum_numbers(item) for item in value)
            if isinstance(value, dict):
                return sum(sum_numbers(item) for item in value.values())
            return 0.0

        categories = (
            "chat", "completion", "ocr", "audio", "audio_characters",
            "connectors", "fine_tuning", "libraries_api", "vibe_usage",
        )
        month_cost = sum(sum_numbers(usage.get(name)) for name in categories)
        limits_data = limits.get("limits", {})
        completion_limits = limits_data.get("completion", {})
        return {
            "configured": True,
            "ok": True,
            "month_cost": round(month_cost, 4),
            "currency": usage.get("currency") or limits_data.get("currency") or "USD",
            "monthly_limit_reached": completion_limits.get("monthly_limit_reached"),
            "credit_balance": None,
            "note": "Consumo/costo organizacional del mes. La Admin API no expone tokens agregados ni saldo de créditos; este último se ve en Billing de Mistral.",
        }
    except Exception as exc:
        return {"configured": True, "ok": False, "error": _provider_error(exc)}


def register_routes(app, panel_authorized) -> None:
    @app.get("/api/admin/ai-usage")
    def admin_ai_usage():
        if not panel_authorized():
            from flask import jsonify

            return jsonify({"error": "No autorizado"}), 401
        now = datetime.now(timezone.utc)
        jobs = (_openai_usage, _xai_usage, _mistral_usage)
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda fn: fn(now), jobs))
        from flask import jsonify

        return jsonify({
            "generated_at": now.isoformat(),
            "month": now.strftime("%Y-%m"),
            "providers": dict(zip(("openai", "xai", "mistral"), results)),
        })
