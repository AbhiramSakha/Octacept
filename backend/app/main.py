"""
MIRAI Backend Service Entry Point (FastAPI).
OCTACEPT — Try Beyond Reality.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.products import router as products_router
from .api.sessions import router as sessions_router
from .api.tryon import router as tryon_router
from .api.vto import router as vto_router

app = FastAPI(
    title="MIRAI Backend API",
    description=(
        "Catalog, Inventory, Session Management, and Virtual Try-On API "
        "for MIRAI Intelligent Mirror — OCTACEPT"
    ),
    version="0.2.0"
)

# Enable CORS for local mirror frontend (Vite dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register versioned API routers
app.include_router(products_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(tryon_router, prefix="/api")
app.include_router(vto_router, prefix="/api")


@app.get("/health", tags=["Health"])
def health_check():
    """Service health status check."""
    return {
        "status": "healthy",
        "service": "mirai-backend",
        "version": "0.2.0",
        "product": "MIRAI - The Intelligent Mirror",
        "organization": "OCTACEPT",
        "vto_mode": "demo",
        "vto_note": "Demo VTO uses Pillow compositing — NOT real AI virtual try-on."
    }