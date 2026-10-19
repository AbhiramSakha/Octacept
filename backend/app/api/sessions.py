"""
Customer Sessions & Saved Looks API routes for MIRAI backend.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter

from ..schemas.session import (
    CreateSessionRequest,
    SessionResponse,
    SaveLookRequest,
    SaveLookResponse,
    AnalyticsEventRequest
)

router = APIRouter(prefix="/v1", tags=["Sessions & Looks"])


@router.post("/sessions", response_model=SessionResponse)
def create_session(request: CreateSessionRequest):
    """Initialize a customer trial room session."""
    session_id = f"sess_{uuid.uuid4().hex[:8]}"

    return SessionResponse(
        session_id=session_id,
        mirror_id=request.mirror_id,
        status="active",
        created_at=datetime.now(timezone.utc).isoformat()
    )


@router.post("/sessions/{session_id}/end")
def end_session(session_id: str):
    """End an active customer trial room session."""
    return {
        "session_id": session_id,
        "status": "ended",
        "ended_at": datetime.now(timezone.utc).isoformat()
    }


@router.post("/saved-looks", response_model=SaveLookResponse)
def save_look(request: SaveLookRequest):
    """Save an outfit look for customer mobile handoff / QR code sharing."""
    look_id = f"look_{uuid.uuid4().hex[:6]}"

    return SaveLookResponse(
        look_id=look_id,
        qr_url=f"https://mirai.octacept.com/looks/{look_id}",
        shareable_code=f"FIT-{uuid.uuid4().hex[:4].upper()}"
    )


@router.post("/analytics/events")
def record_event(request: AnalyticsEventRequest):
    """Record an anonymized customer try-on or touch event."""
    return {
        "status": "recorded",
        "event_type": request.event_type
    }

