from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    PROJECT_NAME: str = "AI Resume Analyzer"
    VERSION: str = "1.0.0"
    DEBUG: bool = True

    # File upload
    MAX_FILE_SIZE_MB: int = 10
    ALLOWED_EXTENSIONS: list[str] = [".pdf", ".docx"]

    # Pipeline
    JOBS_DATASET_PATH: str = "mock_jobs.json"
    TOP_MATCHES: int = 5

    # CORS
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]


settings = Settings()
