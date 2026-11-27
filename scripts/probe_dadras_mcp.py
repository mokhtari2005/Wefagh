#!/usr/bin/env python3
"""Read-only protocol probe for Dadras's public legal MCP endpoint."""
from __future__ import annotations

import json
from pathlib import Path

import requests

ENDPOINT = "https://mcp.dadrasai.com/mcp"
PROTOCOL = "2025-11-25"


def parse_response(response):
    content_type = (response.headers.get("content-type") or "").lower()
    if "text/event-stream" in content_type:
        messages = []
        for line in response.text.splitlines():
            if line.startswith("data:"):
                value = line[5:].strip()
                if value and value != "[DONE]":
                    try:
                        messages.append(json.loads(value))
                    except json.JSONDecodeError:
                        continue
        if not messages:
            raise RuntimeError("MCP event stream contained no JSON-RPC data")
        return messages[-1]
    return response.json()


def rpc(session, method, params=None, request_id=1, session_id=None, notification=False):
    headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": PROTOCOL,
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    payload = {"jsonrpc": "2.0", "method": method}
    if not notification:
        payload["id"] = request_id
    if params is not None:
        payload["params"] = params
    response = session.post(ENDPOINT, headers=headers, json=payload, timeout=35)
    if notification and response.status_code in (200, 202, 204):
        return {}, response.headers.get("Mcp-Session-Id") or session_id
    response.raise_for_status()
    result = parse_response(response)
    return result, response.headers.get("Mcp-Session-Id") or session_id


def main():
    report = {"endpoint": ENDPOINT, "status": "started"}
    session = requests.Session()
    try:
        direct_call, _ = rpc(
            session,
            "tools/call",
            {"name": "search_iranian_law", "arguments": {"query": "ماده ۱۰ قانون مدنی", "limit": 1}},
            request_id=99,
        )
        direct_result = (direct_call.get("result") or {}).get("content", [])
        report["stateless_tool_call"] = "available" if any(item.get("type") == "text" for item in direct_result) else "unavailable"
        initialized, session_id = rpc(
            session,
            "initialize",
            {
                "protocolVersion": PROTOCOL,
                "capabilities": {},
                "clientInfo": {"name": "mokhtari-law-academy-probe", "version": "1.0.0"},
            },
            request_id=1,
        )
        if initialized.get("error"):
            raise RuntimeError("MCP initialize failed: " + json.dumps(initialized["error"], ensure_ascii=False))
        negotiated = (initialized.get("result") or {}).get("protocolVersion")
        rpc(session, "notifications/initialized", session_id=session_id, notification=True)
        tools, session_id = rpc(session, "tools/list", {}, request_id=2, session_id=session_id)
        tool_items = (tools.get("result") or {}).get("tools", [])
        names = [item.get("name") for item in tool_items if item.get("name")]
        if "search_iranian_law" not in names:
            raise RuntimeError("Dadras MCP did not expose search_iranian_law")
        result, session_id = rpc(
            session,
            "tools/call",
            {"name": "search_iranian_law", "arguments": {"query": "ماده ۱۰ قانون مدنی", "limit": 2}},
            request_id=3,
            session_id=session_id,
        )
        if result.get("error"):
            raise RuntimeError("Dadras legal search failed: " + json.dumps(result["error"], ensure_ascii=False))
        content = (result.get("result") or {}).get("content", [])
        texts = [str(item.get("text", "")) for item in content if item.get("type") == "text"]
        report.update(
            status="available",
            negotiated_protocol=negotiated,
            session_created=bool(session_id),
            tools=names,
            search_result_preview="\n".join(texts)[:2200],
            search_result_text_blocks=len(texts),
        )
    except Exception as exc:
        report.update(status="unavailable", error=type(exc).__name__ + ": " + str(exc)[:1000])
    finally:
        session.close()
    Path("artifacts").mkdir(exist_ok=True)
    Path("artifacts/dadras-mcp-probe.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
