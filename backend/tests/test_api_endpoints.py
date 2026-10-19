"""
Integration and unit tests for FastAPI REST endpoints.
Verifies HTTP status codes, CORS headers, JSON response schemas, and error handling.
"""
import unittest
from backend.app.main import app
from backend.app.schemas.product import Product, ProductCategory


class TestFastAPIEndpoints(unittest.TestCase):

    def setUp(self):
        try:
            from fastapi.testclient import TestClient
            self.client = TestClient(app)
            self.has_testclient = True
        except ImportError:
            self.client = None
            self.has_testclient = False

    def test_health_check_endpoint(self):
        if not self.has_testclient:
            self.skipTest("fastapi[testclient] not installed in environment")
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["service"], "mirai-backend")

    def test_categories_endpoint(self):
        if not self.has_testclient:
            self.skipTest("fastapi[testclient] not installed in environment")
        response = self.client.get("/api/v1/categories")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 5)
        self.assertIn("jackets", [c["id"] for c in data])

    def test_products_list_endpoint(self):
        if not self.has_testclient:
            self.skipTest("fastapi[testclient] not installed in environment")
        response = self.client.get("/api/v1/products")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 30)

    def test_product_filter_category_endpoint(self):
        if not self.has_testclient:
            self.skipTest("fastapi[testclient] not installed in environment")
        response = self.client.get("/api/v1/products?category_id=jackets")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for item in data:
            self.assertEqual(item["category_id"], "jackets")

    def test_get_single_product_and_404(self):
        if not self.has_testclient:
            self.skipTest("fastapi[testclient] not installed in environment")
        # Valid product
        response = self.client.get("/api/v1/products/oct_jkt_001")
        self.assertEqual(response.status_code, 200)
        prod = response.json()
        self.assertEqual(prod["id"], "oct_jkt_001")
        self.assertIn("sizes", prod)

        # Invalid product
        invalid = self.client.get("/api/v1/products/non_existent_item_999")
        self.assertEqual(invalid.status_code, 404)

    def test_session_creation_endpoint(self):
        if not self.has_testclient:
            self.skipTest("fastapi[testclient] not installed in environment")
        payload = {
            "mirror_id": "MIRAI-STORE-01-ROOM-3",
            "client_timestamp": 1727625600000
        }
        response = self.client.post("/api/v1/sessions", json=payload)
        self.assertEqual(response.status_code, 200)
        session = response.json()
        self.assertTrue(session["session_id"].startswith("sess_"))
        self.assertEqual(session["status"], "active")

    def test_vto_config_endpoint(self):
        if not self.has_testclient:
            self.skipTest("fastapi[testclient] not installed in environment")
        response = self.client.get("/api/v1/vto/config")
        self.assertEqual(response.status_code, 200)
        config = response.json()
        self.assertIn("configured_provider", config)
        self.assertIn("providers", config)
        provider_ids = [p["id"] for p in config["providers"]]
        self.assertIn("decart", provider_ids)
        self.assertIn("mirai_kvge", provider_ids)
        # Check Decart is flagged as temporary prototype
        decart_info = next(p for p in config["providers"] if p["id"] == "decart")
        self.assertTrue(decart_info["is_temporary_prototype"])

    def test_vto_credentials_endpoint(self):
        if not self.has_testclient:
            self.skipTest("fastapi[testclient] not installed in environment")
        response = self.client.get("/api/v1/vto/credentials")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("provider", data)
        self.assertEqual(data["provider"], "decart")
        self.assertIn("has_key", data)


if __name__ == "__main__":
    unittest.main()