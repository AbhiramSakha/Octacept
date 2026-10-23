"""
Dashboard pairing + live snapshot API (in-memory; resets when the server restarts).

Register in main.py like your other routers (the "/api" prefix is added there):
    app.include_router(dashboard_router, prefix="/api")

  GET  /api/v1/dashboard/lan-info          -> {"ip": "192.168.x.x", "all": [...]}  (for the QR code)
  PUT  /api/v1/dashboard/{pair_id}         <- mirror pushes its latest snapshot (JSON)
  GET  /api/v1/dashboard/{pair_id}?role=   -> snapshot + age + mobile_connected
  GET  /api/v1/dashboard/{pair_id}/status  -> {"mobile_connected": bool}

role=mobile marks the phone as connected (seen within the last 8 s).
"""
import json
import re
import socket
import time
from typing import Any, Dict, List

from fastapi import APIRouter, Body, HTTPException, Query

router = APIRouter(prefix="/v1/dashboard", tags=["dashboard"])

_PAIR_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")
_MAX_AGE_S = 6 * 3600
_MAX_BYTES = 64 * 1024
_MOBILE_TTL_S = 8

_store: Dict[str, Dict[str, Any]] = {}


def _check(pair_id: str) -> None:
    if not _PAIR_RE.match(pair_id):
        raise HTTPException(status_code=400, detail="Invalid pair id")


def _gc() -> None:
    now = time.time()
    for key in [k for k, v in _store.items() if now - v["touched"] > _MAX_AGE_S]:
        del _store[key]


def _entry(pair_id: str) -> Dict[str, Any]:
    now = time.time()
    return _store.setdefault(
        pair_id,
        {"snapshot": None, "updated": None, "mobile_seen": 0.0, "touched": now},
    )


def _lan_ips() -> List[str]:
    """
    Every IPv4 address of this PC that a phone could use, best guess first.
    Real Wi-Fi / LAN ranges (192.168.x, 10.x) come before virtual adapters (172.x: WSL, Docker, Hyper-V).
    """
    found: List[str] = []

    def add(ip: str) -> None:
        if ip and ip not in found and not ip.startswith(("127.", "169.254.")):
            found.append(ip)

    # 1) the address Windows would use to reach the internet (usually the Wi-Fi adapter)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # UDP: no packet is actually sent
        add(s.getsockname()[0])
    except Exception:
        pass
    finally:
        s.close()

    # 2) every other IPv4 address of this PC
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            add(info[4][0])
    except Exception:
        pass

    def rank(ip: str) -> int:
        if ip.startswith("192.168.56.") or ip.startswith("192.168.99."):
            return 3  # VirtualBox / Docker Toolbox host-only networks
        if ip.startswith("192.168."):
            return 0
        if ip.startswith("10."):
            return 1
        return 2

    found.sort(key=rank)  # stable: the internet-route address stays first inside its group
    return found or ["127.0.0.1"]


@router.get("/lan-info")
def lan_info() -> Dict[str, Any]:
    ips = _lan_ips()
    return {"ip": ips[0], "all": ips}


@router.put("/{pair_id}")
def push_snapshot(pair_id: str, snapshot: Dict[str, Any] = Body(...)) -> Dict[str, bool]:
    _check(pair_id)
    if len(json.dumps(snapshot)) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Snapshot too large")
    _gc()
    now = time.time()
    e = _entry(pair_id)
    e["snapshot"] = snapshot
    e["updated"] = now
    e["touched"] = now
    return {"ok": True}


@router.get("/{pair_id}/status")
def status(pair_id: str) -> Dict[str, bool]:
    _check(pair_id)
    e = _store.get(pair_id)
    seen = bool(e) and (time.time() - e["mobile_seen"] < _MOBILE_TTL_S)
    return {"mobile_connected": seen}


@router.get("/{pair_id}")
def read_snapshot(pair_id: str, role: str = Query("mirror")) -> Dict[str, Any]:
    _check(pair_id)
    now = time.time()
    e = _entry(pair_id)
    e["touched"] = now
    if role == "mobile":
        e["mobile_seen"] = now
    return {
        "snapshot": e["snapshot"],
        "age": None if e["updated"] is None else round(now - e["updated"], 1),
        "mobile_connected": now - e["mobile_seen"] < _MOBILE_TTL_S,
    }