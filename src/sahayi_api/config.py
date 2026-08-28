from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    dev_frontend_origin: str


def get_settings() -> Settings:
    origin = os.getenv("SAHAYI_DEV_FRONTEND_ORIGIN", "http://127.0.0.1:5173")
    return Settings(dev_frontend_origin=origin.rstrip("/"))
