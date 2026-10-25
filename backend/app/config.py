from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SupplyChain Twin AI"
    database_url: str = "sqlite:///./supplychain_twin.db"
    secret_key: str = "dev-secret-change-me"
    environment: str = "development"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    ollama_url: str = "http://127.0.0.1:11434/api/generate"
    ollama_model: str = "qwen2.5:0.5b"
    ollama_parser_model: str = "qwen2.5:3b"
    whisper_model_size: str = "base"
    document_storage_dir: str = str(
        Path(__file__).resolve().parents[1] / "data" / "company_documents"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_production_settings(self):
        if self.environment.casefold() not in {"development", "dev", "test"}:
            if self.secret_key == "dev-secret-change-me" or len(self.secret_key) < 32:
                raise ValueError(
                    "Set SECRET_KEY to a unique value of at least 32 characters outside development."
                )
            if not self.cors_origins:
                raise ValueError(
                    "Set CORS_ORIGINS to the exact frontend origin outside development."
                )
            if "*" in self.cors_origins:
                raise ValueError(
                    "Wildcard CORS origins are not allowed outside development."
                )
            if any(not origin.startswith("https://") for origin in self.cors_origins):
                raise ValueError(
                    "CORS_ORIGINS must contain HTTPS frontend origins outside development."
                )
        return self


settings = Settings()
