"""Load test (doc 10 · §2, decision 106): 30 people of one company at once.

Most of them browse what a working day opens (dashboard, portfolio,
customers, arrears, search, a loan); the cashier pays small amounts on the
same few loans, so payments collide on purpose. Runs against the demo data
(`seed_demo`) of a server with the production settings:

    uvx --from locust locust -f loadtest/locustfile.py --headless \\
        -u 30 -r 5 -t 3m --host https://localhost:8443

Needs REQUIRE_MFA=false on that server (the demo users have no 2FA) and
an open cash drawer for the cashier. Never against production.
"""

import random
import uuid

import urllib3
from locust import HttpUser, between, task

urllib3.disable_warnings()  # Caddy's local certificate authority

PASSWORD = "demo-cobradia-2026"  # seed_demo
STAFF = ["gerente", "supervisor", "oficial"]
# Only what each role may open (doc 06 matrix): a 403 here is a test bug.
ARREARS = {"gerente", "supervisor", "oficial"}
COLLECT = {"gerente", "supervisor", "cajera"}


class Staff(HttpUser):
    wait_time = between(1, 4)
    weight = 5
    email = ""

    def on_start(self) -> None:
        self.client.verify = False
        self.client.headers["Referer"] = f"{self.host}/"
        self.client.get("/api/v1/csrf/", name="csrf")
        token = self.client.cookies.get("csrftoken", "")
        self.client.headers["X-CSRFToken"] = token
        email = self.email or f"{random.choice(STAFF)}@modelo.test"
        self.role = email.split("@")[0]
        response = self.client.post(
            "/api/v1/auth/browser/v1/auth/login",
            json={"email": email, "password": PASSWORD},
            name="login",
        )
        response.raise_for_status()
        self.client.headers["X-CSRFToken"] = self.client.cookies.get("csrftoken", token)
        loans = self.client.get("/api/v1/prestamos/?estado=active", name="prestamos").json()
        self.loans = [row["number"] for row in loans.get("results", [])] or ["01-000001"]

    @task(4)
    def dashboard(self) -> None:
        self.client.get("/api/v1/yo/", name="yo")
        self.client.get("/api/v1/tablero/", name="tablero")

    @task(3)
    def portfolio(self) -> None:
        self.client.get("/api/v1/prestamos/", name="prestamos")

    @task(3)
    def customers(self) -> None:
        self.client.get("/api/v1/clientes/", name="clientes")

    @task(2)
    def arrears(self) -> None:
        if self.role in ARREARS:
            self.client.get("/api/v1/atrasos/", name="atrasos")

    @task(2)
    def search(self) -> None:
        text = random.choice(["Gómez", "Pérez", "01-"])
        self.client.get(f"/api/v1/buscar/?q={text}", name="buscar")

    @task(3)
    def loan(self) -> None:
        number = random.choice(self.loans)
        self.client.get(f"/api/v1/prestamos/{number}/", name="prestamo")
        if self.role in COLLECT:
            self.client.get(f"/api/v1/prestamos/{number}/cobro/", name="cobro (pantalla)")


class Cashier(Staff):
    """Pays RD$ 5 at a time on the same few loans: payments collide."""

    weight = 1
    email = "cajera@modelo.test"

    @task(5)
    def collect(self) -> None:
        number = random.choice(self.loans[:3])
        with self.client.post(
            f"/api/v1/prestamos/{number}/cobrar/",
            json={
                "kind": "regular",
                "amount": "5.00",
                "method": "cash",
                "received": "5.00",
                "idempotency_key": uuid.uuid4().hex,
            },
            name="cobrar",
            catch_response=True,
        ) as response:
            # A loan already paid off refuses: correct, not a failure.
            if response.status_code in (201, 400):
                response.success()
