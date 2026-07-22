"""Конфигурация GraphLens из переменных окружения."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Qdrant (источник чанков, любая БД) ---
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_api_key: str | None = None
    # Поле payload с текстом чанка; если пусто - перебираем типовые
    qdrant_text_field: str = ""

    # --- Neo4j (граф знаний) ---
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    # --- LLM (OpenAI-совместимый endpoint: LM Studio, vLLM и т.п.) ---
    llm_base_url: str = "http://localhost:1234/v1"
    llm_api_key: str = "lm-studio"
    llm_model: str = ""
    embedding_model: str = ""

    # --- Извлечение графа ---
    extract_batch_size: int = 5      # чанков в одном LLM-запросе
    extract_concurrency: int = 4     # параллельных LLM-извлечений
    extract_max_chars: int = 6000    # обрезка чанка перед LLM
    llm_num_predict: int = 4096

    # --- Поиск ---
    top_k_vector: int = 10
    graph_neighbor_depth: int = 2

    # --- Сервис ---
    api_port: int = 8200


settings = Settings()
