from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SupplyChain Twin AI"
    database_url: str = "sqlite:///./supplychain_twin.db"
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 720
    ollama_url: str = "http://127.0.0.1:11434/api/generate"
    ollama_model: str = "qwen2.5:3b"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
