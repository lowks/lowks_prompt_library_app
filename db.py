"""Database initialization and helper functions for Prompt Library App."""

import sqlite3
import os
import json

DATABASE_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "data", "prompts.db"))


def get_db_connection():
    """Open a new database connection with row_factory set to sqlite3.Row."""
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create all tables if they do not already exist."""
    conn = get_db_connection()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sections (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                name      TEXT    NOT NULL,
                icon      TEXT    NOT NULL DEFAULT '📁',
                created_at TEXT   NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS subsections (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
                name       TEXT    NOT NULL,
                created_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS prompts (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                title         TEXT    NOT NULL,
                description   TEXT    DEFAULT '',
                section_id    INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
                subsection_id INTEGER REFERENCES subsections(id) ON DELETE SET NULL,
                content       TEXT    NOT NULL,
                tags          TEXT    NOT NULL DEFAULT '[]',
                favorite      INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
                updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_prompts_section    ON prompts(section_id);
            CREATE INDEX IF NOT EXISTS idx_prompts_subsection ON prompts(subsection_id);
            CREATE INDEX IF NOT EXISTS idx_prompts_favorite   ON prompts(favorite);
            CREATE INDEX IF NOT EXISTS idx_subsections_section ON subsections(section_id);
            """
        )
        conn.commit()
    finally:
        conn.close()


def row_to_section(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "icon": row["icon"],
        "createdAt": row["created_at"],
    }


def row_to_subsection(row):
    return {
        "id": row["id"],
        "sectionId": row["section_id"],
        "name": row["name"],
        "createdAt": row["created_at"],
    }


def row_to_prompt(row):
    tags = row["tags"]
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except (ValueError, TypeError):
            tags = []
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "sectionId": row["section_id"],
        "subsectionId": row["subsection_id"],
        "content": row["content"],
        "tags": tags,
        "favorite": bool(row["favorite"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }
