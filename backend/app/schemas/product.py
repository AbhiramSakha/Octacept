"""
Pydantic schemas for Products, Categories, and Inventory.
Strictly mirrors /docs/API_CONTRACT.md.
"""
from typing import List, Dict, Optional
from pydantic import BaseModel, Field


class ProductCategory(BaseModel):
    id: str
    name: str
    display_order: int
    icon: Optional[str] = None


class ProductColor(BaseModel):
    name: str
    hex: str


class Product(BaseModel):
    id: str
    sku: str
    name: str
    category_id: str
    brand: str
    price: float
    currency: str = "INR"
    description: str
    colors: List[ProductColor]
    sizes: List[str]
    asset_2d_overlay: str
    asset_3d_model: Optional[str] = None
    asset_thumbnail: str
    in_stock: bool = True


class InventoryStatus(BaseModel):
    product_id: str
    total_stock: int
    size_breakdown: Dict[str, int]
    rack_location: str
