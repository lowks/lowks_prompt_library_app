#!/usr/bin/env python3
"""Seed script — populates the database with sample prompts from prompt.json.

Usage:
    python seed.py              # uses default prompt.json in this directory
    python seed.py path/to/file.json
"""

import json
import os
import sys

# Allow running from any working directory
sys.path.insert(0, os.path.dirname(__file__))

from db import get_db_connection, init_db  # noqa: E402


def now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def seed(json_path: str | None = None) -> None:
    if json_path is None:
        json_path = os.path.join(os.path.dirname(__file__), "prompt.json")

    if not os.path.exists(json_path):
        print(f"ERROR: seed file not found: {json_path}")
        sys.exit(1)

    print(f"Loading seed data from: {json_path}")
    with open(json_path, encoding="utf-8") as fh:
        data = json.load(fh)

    init_db()
    conn = get_db_connection()

    try:
        # Check if data already exists
        existing_sections = conn.execute("SELECT COUNT(*) FROM sections").fetchone()[0]
        existing_prompts = conn.execute("SELECT COUNT(*) FROM prompts").fetchone()[0]

        if existing_sections > 0 or existing_prompts > 0:
            answer = input(
                f"Database already has {existing_sections} section(s) and "
                f"{existing_prompts} prompt(s). Overwrite? [y/N] "
            ).strip().lower()
            if answer != "y":
                print("Seed cancelled.")
                return

        # Wipe existing data
        conn.execute("DELETE FROM prompts")
        conn.execute("DELETE FROM subsections")
        conn.execute("DELETE FROM sections")
        conn.commit()

        section_id_map: dict[int, int] = {}
        subsection_id_map: dict[int, int] = {}

        # Insert sections
        for s in data.get("sections", []):
            cur = conn.execute(
                "INSERT INTO sections (name, icon, created_at) VALUES (?, ?, ?)",
                (s["name"], s.get("icon", "📁"), s.get("createdAt", now_iso())),
            )
            section_id_map[s["id"]] = cur.lastrowid

        # Insert subsections
        for sub in data.get("subsections", []):
            new_sec = section_id_map.get(sub.get("sectionId") or sub.get("section_id"))
            if not new_sec:
                continue
            cur = conn.execute(
                "INSERT INTO subsections (section_id, name, created_at) VALUES (?, ?, ?)",
                (new_sec, sub["name"], sub.get("createdAt", now_iso())),
            )
            subsection_id_map[sub["id"]] = cur.lastrowid

        # Insert prompts
        inserted = 0
        for p in data.get("prompts", []):
            sec_orig = p.get("sectionId") or p.get("section_id")
            sub_orig = p.get("subsectionId") or p.get("subsection_id")
            new_sec = section_id_map.get(sec_orig)
            new_sub = subsection_id_map.get(sub_orig) if sub_orig else None

            if not new_sec:
                # If no valid section, skip (or assign to first section)
                if not section_id_map:
                    continue
                new_sec = next(iter(section_id_map.values()))

            conn.execute(
                """INSERT INTO prompts
                   (title, description, section_id, subsection_id, content, tags,
                    favorite, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    p["title"],
                    p.get("description", ""),
                    new_sec,
                    new_sub,
                    p["content"],
                    json.dumps(p.get("tags") or []),
                    1 if p.get("favorite") else 0,
                    p.get("createdAt", now_iso()),
                    p.get("updatedAt", now_iso()),
                ),
            )
            inserted += 1

        conn.commit()
        print(
            f"Seeded: {len(section_id_map)} section(s), "
            f"{len(subsection_id_map)} subsection(s), "
            f"{inserted} prompt(s)."
        )
    finally:
        conn.close()


if __name__ == "__main__":
    json_file = sys.argv[1] if len(sys.argv) > 1 else None
    seed(json_file)
