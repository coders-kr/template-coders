from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Provided by the coders.kr platform via coders.yaml substitution.
    database_url: str = "postgresql+asyncpg://app:app@localhost:5432/app"

    # Local-dev escape hatch: when set, an X-Coders-User-less request is
    # treated as if it came from this UUID. Lets you `curl` the API
    # without the platform gate in front. Never set in production.
    dev_fake_user: str | None = None

    # Enables the local-only bridge used by the floating development toolbar.
    # coders.yaml intentionally does not set this, so deployed apps never expose
    # the agent event endpoints. docker compose enables it for local dev.
    dev_agent_bridge: bool = False
    dev_agent_public_url: str = "http://localhost:8000"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
