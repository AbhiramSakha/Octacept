"""
Demo Store seed data and query interface.
Provides 76 demo garments and accessories across 17 categories for investor &
retail store demonstration. All prices are in INR (Indian Rupees).

The original 32 products (jackets, hoodies, shirts, trousers, dresses) are kept
exactly as before. New categories were added after them.
"""
import random
from typing import List, Optional
from ..schemas.product import ProductCategory, Product, ProductColor, InventoryStatus

# ---------------------------------------------------------------------------
# Category specs
# Each spec: id, display name, icon, SKU code, brand, sizes, description
# template, and a list of (name, price INR, hex, colour name) items.
# To add a product, append a tuple to the right list. To add a category,
# add a new spec dict at the end.
# ---------------------------------------------------------------------------
_APPAREL_4 = ["S", "M", "L", "XL"]
_APPAREL_5 = ["S", "M", "L", "XL", "XXL"]
_WAIST = ["28", "30", "32", "34", "36"]
_SHOES = ["6", "7", "8", "9", "10", "11"]
_BELT = ["30", "32", "34", "36", "38"]
_FREE = ["FREE"]

_SPECS = [
    # ----------------------------- ORIGINAL 5 -----------------------------
    {
        "id": "jackets", "name": "Jackets & Outerwear", "icon": "jacket", "code": "JKT",
        "brand": "OCTACEPT Atelier", "sizes": _APPAREL_4,
        "desc": "Premium {n} crafted for physical trial and smart AR fitting.",
        "items": [
            ("Cyber Techwear Bomber",           1499, "#111111", "Matte Black"),
            ("Minimalist Wool Overcoat",        2199, "#e5e5e5", "Oatmeal"),
            ("Urban Utility Windbreaker",       1199, "#2f4f4f", "Dark Slate"),
            ("Vintage Distressed Denim Jacket",  950, "#4682b4", "Washed Indigo"),
            ("Structured Leather Moto Jacket",  2799, "#1c1c1c", "Midnight Black"),
            ("Puffer Thermore Vest",             899, "#d2b48c", "Desert Sand"),
            ("Sartorial Peak-Lapel Blazer",     1749, "#000080", "Navy Blue"),
        ],
    },
    {
        "id": "hoodies", "name": "Hoodies & Sweatshirts", "icon": "hoodie", "code": "HOD",
        "brand": "OCTACEPT Originals", "sizes": ["XS", "S", "M", "L", "XL"],
        "desc": "Signature {n} engineered with tailored silhouette tracking.",
        "items": [
            ("Heavyweight French Terry Hoodie",  849, "#808080", "Heather Grey"),
            ("Oversized Boxy Graphic Hoodie",    919, "#000000", "Obsidian"),
            ("Acid Wash Vintage Crewneck",       779, "#708090", "Slate Wash"),
            ("Cashmere-Blend Zip Hoodie",       1449, "#f5f5dc", "Cream Beige"),
            ("Reflective Pipeline Pullover",     989, "#ff4500", "Signal Neon"),
            ("Thermal Knit Quarter-Zip",         879, "#2e8b57", "Forest Green"),
        ],
    },
    {
        "id": "shirts", "name": "Shirts & Tops", "icon": "shirt", "code": "SHT",
        "brand": "OCTACEPT Essentials", "sizes": _APPAREL_4,
        "desc": "Essential {n} offering breathable luxury.",
        "items": [
            ("Oxford Mercerized Cotton Shirt",   679, "#ffffff", "Crisp White"),
            ("Relaxed Camp-Collar Linen Shirt",  739, "#deb887", "Natural Flax"),
            ("Cuban Collar Silk-Touch Shirt",    889, "#800020", "Deep Merlot"),
            ("Supima Drop-Shoulder Heavy Tee",   449, "#000000", "Pitch Black"),
            ("Tailored Poplin Mandarin Shirt",   719, "#87ceeb", "Sky Azure"),
            ("Waffle Thermal Longsleeve",        519, "#696969", "Dim Ash"),
            ("Striped Breton Knit Top",          579, "#00008b", "Dark Marine"),
        ],
    },
    {
        "id": "trousers", "name": "Pants & Trousers", "icon": "pants", "code": "TRS",
        "brand": "OCTACEPT Atelier", "sizes": _WAIST,
        "desc": "Contemporary {n} with precision drape.",
        "items": [
            ("Pleated Wide-Leg Wool Trousers",  1299, "#36454f", "Charcoal"),
            ("Technical Cargo Tapered Pants",   1099, "#556b2f", "Olive Drab"),
            ("Relaxed Drawstring Linen Pants",   849, "#fdf5e6", "Ecru"),
            ("Selvedge Japanese Denim Jeans",   1649, "#191970", "Raw Indigo"),
            ("Cropped Tailored Chinos",          789, "#c2b280", "Khaki Sand"),
            ("Athletic Comfort Track Trousers",  749, "#000000", "Solid Black"),
        ],
    },
    {
        "id": "dresses", "name": "Dresses & Skirts", "icon": "dress", "code": "DRS",
        "brand": "OCTACEPT Atelier", "sizes": ["XS", "S", "M", "L"],
        "desc": "Fluid {n} modeled for movement simulation.",
        "items": [
            ("Bias-Cut Silk Slip Dress",          1749, "#2e0854", "Royal Violet"),
            ("Pleated Georgette Midi Dress",      1549, "#ffb6c1", "Blush Pink"),
            ("Sculptural Knit Maxi Dress",        1399, "#a0522d", "Sienna Clay"),
            ("Structured A-Line Linen Sundress",  1149, "#ffffe0", "Buttercream"),
            ("Asymmetrical Wrap Dress",           1599, "#008080", "Emerald Teal"),
            ("High-Waisted Knife-Pleat Skirt",     949, "#778899", "Muted Steel"),
        ],
    },
    # ------------------------------ NEW TOPS ------------------------------
    {
        "id": "tshirts", "name": "T-Shirts", "icon": "tshirt", "code": "TEE",
        "brand": "OCTACEPT Essentials", "sizes": _APPAREL_5,
        "desc": "Everyday {n} in soft combed cotton with a clean, comfortable fit.",
        "items": [
            ("Essential Crew Neck Tee",      399, "#ffffff", "Optic White"),
            ("Oversized Acid Wash Tee",      599, "#4a4a4a", "Washed Graphite"),
            ("Ribbed Slim-Fit Henley Tee",   549, "#c19a6b", "Camel"),
            ("Pique Polo Tee",               649, "#000080", "Navy Blue"),
            ("Graphic Street Print Tee",     499, "#000000", "Jet Black"),
        ],
    },
    {
        "id": "sweaters", "name": "Sweaters & Knitwear", "icon": "sweater", "code": "SWT",
        "brand": "OCTACEPT Knit", "sizes": _APPAREL_4,
        "desc": "Soft-touch {n} knitted for warmth and easy layering.",
        "items": [
            ("Ribbed Merino Crew Sweater",   1249, "#f5f5dc", "Oat Cream"),
            ("Chunky Cable Knit Sweater",    1499, "#5c4033", "Walnut"),
            ("V-Neck Wool Blend Sweater",    1199, "#1b2a49", "Midnight Navy"),
            ("Mock-Neck Fine Knit Jumper",   1099, "#36454f", "Charcoal"),
        ],
    },
    # ---------------------------- NEW BOTTOMS -----------------------------
    {
        "id": "jeans", "name": "Jeans & Denim", "icon": "jeans", "code": "JNS",
        "brand": "OCTACEPT Denim", "sizes": _WAIST,
        "desc": "Durable {n} with a comfortable stretch and a clean finish.",
        "items": [
            ("Slim Fit Stretch Jeans",   1199, "#1f2d4d", "Dark Indigo"),
            ("Relaxed Straight Jeans",   1299, "#a9c4e0", "Light Wash"),
            ("Baggy Wide-Leg Jeans",     1399, "#708090", "Stone Grey"),
            ("Tapered Black Jeans",      1249, "#111111", "Washed Black"),
        ],
    },
    {
        "id": "shorts", "name": "Shorts", "icon": "shorts", "code": "SRT",
        "brand": "OCTACEPT Summer", "sizes": _APPAREL_4,
        "desc": "Lightweight {n} built for warm days and easy movement.",
        "items": [
            ("Chino Bermuda Shorts",         649, "#c2b280", "Khaki Sand"),
            ("Distressed Denim Shorts",      749, "#a9c4e0", "Light Wash"),
            ("Utility Cargo Shorts",         799, "#556b2f", "Olive Drab"),
            ("Performance Running Shorts",   549, "#008080", "Deep Teal"),
        ],
    },
    # ------------------------------ NEW ETHNIC ----------------------------
    {
        "id": "kurtas", "name": "Kurtas & Ethnic Wear", "icon": "kurta", "code": "KUR",
        "brand": "OCTACEPT Ethnic", "sizes": _APPAREL_5,
        "desc": "Elegant {n} tailored for festive and everyday occasions.",
        "items": [
            ("Cotton Straight Kurta",      1099, "#ffffff", "Ivory White"),
            ("Embroidered Festive Kurta",  1899, "#d9a62e", "Marigold"),
            ("Linen Nehru Collar Kurta",   1299, "#deb887", "Natural Flax"),
            ("Silk Blend Occasion Kurta",  2499, "#800020", "Deep Merlot"),
        ],
    },
    # ----------------------------- NEW FOOTWEAR ---------------------------
    {
        "id": "sneakers", "name": "Sneakers", "icon": "sneaker", "code": "SNK",
        "brand": "OCTACEPT Footwear", "sizes": _SHOES,
        "desc": "Cushioned {n} designed for all-day comfort.",
        "items": [
            ("Court Classic Low-Top Sneakers",  1899, "#ffffff", "Cloud White"),
            ("Chunky Street Sneakers",          2299, "#808080", "Concrete Grey"),
            ("Knit Performance Runners",        2499, "#ff4500", "Signal Neon"),
            ("Canvas High-Top Sneakers",        1399, "#000000", "Jet Black"),
        ],
    },
    {
        "id": "formal_shoes", "name": "Formal Shoes", "icon": "shoe", "code": "FSH",
        "brand": "OCTACEPT Footwear", "sizes": _SHOES,
        "desc": "Polished {n} with a refined silhouette for office and events.",
        "items": [
            ("Leather Oxford Shoes",    2799, "#3b2417", "Espresso Brown"),
            ("Suede Slip-On Loafers",   2299, "#c19a6b", "Camel Tan"),
            ("Polished Derby Shoes",    2599, "#111111", "Midnight Black"),
        ],
    },
    # --------------------------- NEW ACCESSORIES --------------------------
    {
        "id": "caps", "name": "Caps & Hats", "icon": "cap", "code": "CAP",
        "brand": "OCTACEPT Accessories", "sizes": _FREE,
        "desc": "Easy-wear {n} with an adjustable fit.",
        "items": [
            ("Classic Baseball Cap",  449, "#000080", "Navy Blue"),
            ("Cotton Bucket Hat",     549, "#deb887", "Natural Flax"),
            ("Rib Knit Beanie",       399, "#800020", "Deep Merlot"),
        ],
    },
    {
        "id": "belts", "name": "Belts", "icon": "belt", "code": "BLT",
        "brand": "OCTACEPT Accessories", "sizes": _BELT,
        "desc": "Durable {n} finished with a refined metal buckle.",
        "items": [
            ("Full-Grain Leather Belt",   749, "#111111", "Jet Black"),
            ("Reversible Formal Belt",    999, "#3b2417", "Espresso Brown"),
            ("Woven Canvas Web Belt",     449, "#556b2f", "Olive Drab"),
        ],
    },
    {
        "id": "bags", "name": "Bags", "icon": "bag", "code": "BAG",
        "brand": "OCTACEPT Accessories", "sizes": _FREE,
        "desc": "Practical {n} with secure compartments for daily carry.",
        "items": [
            ("Water-Resistant Daypack",   1799, "#36454f", "Charcoal"),
            ("Structured Canvas Tote",     899, "#f5f5dc", "Oat Cream"),
            ("Leather Messenger Bag",     2999, "#3b2417", "Espresso Brown"),
            ("Compact Crossbody Sling",   1099, "#000000", "Jet Black"),
        ],
    },
    {
        "id": "sunglasses", "name": "Sunglasses", "icon": "sunglasses", "code": "SNG",
        "brand": "OCTACEPT Eyewear", "sizes": _FREE,
        "desc": "UV-protective {n} with a lightweight, comfortable frame.",
        "items": [
            ("Classic Aviator Sunglasses",   1299, "#c9a227", "Antique Gold"),
            ("Acetate Wayfarer Sunglasses",  1199, "#111111", "Gloss Black"),
            ("Retro Round Sunglasses",       1099, "#5c4033", "Tortoise"),
        ],
    },
    {
        "id": "watches", "name": "Watches", "icon": "watch", "code": "WCH",
        "brand": "OCTACEPT Time", "sizes": _FREE,
        "desc": "Reliable {n} with a clean dial and comfortable strap.",
        "items": [
            ("Minimal Steel Analog Watch",   2499, "#c0c0c0", "Brushed Silver"),
            ("Digital Sports Watch",         1999, "#000000", "Stealth Black"),
            ("Leather Strap Chronograph",    3299, "#3b2417", "Espresso Brown"),
        ],
    },
]

# ---------------------------------------------------------------------------
# Build categories and products from the specs
# ---------------------------------------------------------------------------
DEMO_CATEGORIES: List[ProductCategory] = [
    ProductCategory(id=s["id"], name=s["name"], display_order=i, icon=s["icon"])
    for i, s in enumerate(_SPECS, start=1)
]


def _generate_demo_products() -> List[Product]:
    products: List[Product] = []
    for spec in _SPECS:
        for idx, (name, price, hex_c, col_name) in enumerate(spec["items"], start=1):
            sku = f"OCT-{spec['code']}-{idx:03d}"
            products.append(Product(
                id=sku.lower().replace("-", "_"),
                sku=sku,
                name=name,
                category_id=spec["id"],
                brand=spec["brand"],
                price=float(price),
                currency="INR",
                description=spec["desc"].format(n=name.lower()),
                colors=[ProductColor(name=col_name, hex=hex_c)],
                sizes=list(spec["sizes"]),
                asset_2d_overlay=f"/assets/garments/{sku.lower()}_overlay.png",
                asset_thumbnail=f"/assets/thumbnails/{sku.lower()}_thumb.png",
                in_stock=True,
            ))
    return products


DEMO_PRODUCTS: List[Product] = _generate_demo_products()


# ---------------------------------------------------------------------------
# Query interface (same names as before, so existing routers keep working)
# ---------------------------------------------------------------------------
def get_demo_categories() -> List[ProductCategory]:
    return DEMO_CATEGORIES


def get_demo_products(category_id: Optional[str] = None) -> List[Product]:
    if category_id:
        return [p for p in DEMO_PRODUCTS if p.category_id == category_id]
    return DEMO_PRODUCTS


def get_demo_product_by_id(product_id: str) -> Optional[Product]:
    for p in DEMO_PRODUCTS:
        if p.id == product_id or p.sku.lower() == product_id.lower():
            return p
    return None


def get_demo_inventory(product_id: str) -> InventoryStatus:
    prod = get_demo_product_by_id(product_id)
    if not prod:
        return InventoryStatus(
            product_id=product_id,
            total_stock=0,
            size_breakdown={},
            rack_location="Not Found",
        )
    # Deterministic per-product stock (stable between restarts)
    rng = random.Random(prod.id)
    breakdown = {s: rng.choice([2, 3, 4, 5, 6]) for s in prod.sizes}
    return InventoryStatus(
        product_id=product_id,
        total_stock=sum(breakdown.values()),
        size_breakdown=breakdown,
        rack_location=f"Rack {prod.category_id[:3].upper()}-0{len(prod.sizes)}",
    )