"""
MIRAI — Virtual Try-On Provider Configuration and Session API.
Provides VTO provider discovery and secure local session credentials.
Supports Decart Lucy V-TON as a temporary external prototype provider alongside
Mirai KVGE (Self-Hosted Kinematic Volumetric Garment Engine).
"""
import os
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/v1/vto", tags=["Virtual Try-On Configuration"])


class VTOProviderInfo(BaseModel):
    id: str
    name: str
    is_temporary_prototype: bool
    description: str
    available: bool


class VTOConfigResponse(BaseModel):
    configured_provider: str
    has_decart_key: bool
    decart_model: str
    providers: List[VTOProviderInfo]


class VTOCredentialsResponse(BaseModel):
    api_key: Optional[str] = None
    provider: str
    decart_model: str
    has_key: bool


@router.get("/config", response_model=VTOConfigResponse)
def get_vto_config() -> VTOConfigResponse:
    """
    Returns available VTO providers and current configuration.
    Identifies Decart as a temporary external prototype provider and
    Mirai KVGE as the self-hosted engine.
    """
    decart_key = os.getenv("DECART_API_KEY", "").strip()
    has_decart = bool(decart_key)
    default_provider = os.getenv("MIRAI_DEFAULT_VTO_PROVIDER", "decart" if has_decart else "mirai_kvge")

    providers = [
        VTOProviderInfo(
            id="decart",
            name="Decart Lucy V-TON",
            is_temporary_prototype=True,
            description="Temporary external VTO inference provider for prototype validation",
            available=has_decart,
        ),
        VTOProviderInfo(
            id="mirai_kvge",
            name="Mirai KVGE (Self-Hosted)",
            is_temporary_prototype=False,
            description="Kinematic Volumetric Garment Engine (Edge GPU/WASM)",
            available=True,
        ),
    ]

    return VTOConfigResponse(
        configured_provider=default_provider,
        has_decart_key=has_decart,
        decart_model=os.getenv("DECART_MODEL_NAME", "lucy-vton-3.5"),
        providers=providers,
    )


@router.get("/credentials", response_model=VTOCredentialsResponse)
def get_vto_credentials() -> VTOCredentialsResponse:
    """
    Supplies credentials to the local kiosk frontend at runtime.
    Reads DECART_API_KEY from backend environment so the key is never
    hardcoded or bundled in client-side code.
    """
    decart_key = os.getenv("DECART_API_KEY", "").strip() or None
    return VTOCredentialsResponse(
        api_key=decart_key,
        provider="decart",
        decart_model=os.getenv("DECART_MODEL_NAME", "lucy-vton-3.5"),
        has_key=bool(decart_key),
    )