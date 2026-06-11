"""
One-time script: seed the Cosmos allowlist with the three system admin emails.
Run once after deploying the allowlist feature.

Usage:
  cd api
  COSMOS_CONNECTION_STRING=... COSMOS_DATABASE_NAME=legends-db \
    .venv/bin/python scripts/seed_allowlist.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from functions.activities.cosmos import upsert_allowed_user

ADMIN_EMAILS = [
    # Replace with your system admin email addresses before running.
    "admin1@example.com",
    "admin2@example.com",
]

for email in ADMIN_EMAILS:
    upsert_allowed_user(email)
    print(f"Seeded: {email}")

print("Done.")
