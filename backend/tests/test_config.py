import pytest
from pydantic import ValidationError

from app.config import Settings


def test_production_settings_reject_default_or_short_secret():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment="production")

    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment="production", secret_key="too-short")


def test_production_settings_accept_strong_secret_and_explicit_origin():
    settings = Settings(
        environment="production",
        secret_key="a-unique-secret-key-with-more-than-32-characters",
        cors_origins=["https://pilot.example.com"],
    )

    assert settings.cors_origins == ["https://pilot.example.com"]


def test_production_settings_reject_wildcard_origin():
    with pytest.raises(ValidationError, match="Wildcard CORS"):
        Settings(
            environment="production",
            secret_key="a-unique-secret-key-with-more-than-32-characters",
            cors_origins=["*"],
        )


def test_production_settings_reject_http_origin():
    with pytest.raises(ValidationError, match="HTTPS"):
        Settings(
            environment="production",
            secret_key="a-unique-secret-key-with-more-than-32-characters",
            cors_origins=["http://pilot.example.com"],
        )
