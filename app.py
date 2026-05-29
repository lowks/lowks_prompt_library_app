"""Prompt Library App — Flask backend with SQLite storage and HTTP Basic Auth."""

import json
import os
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, abort, jsonify, render_template, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import (
    get_db_connection,
    init_db,
    row_to_prompt,
    row_to_section,
    row_to_subsection,
)

# ---------------------------------------------------------------------------
# App factory / config
# ---------------------------------------------------------------------------

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

# Basic-auth credentials (defaults can be overridden via environment variables)
AUTH_USERNAME = os.environ.get("AUTH_USERNAME", "admin")
AUTH_PASSWORD_HASH = generate_password_hash(
    os.environ.get("AUTH_PASSWORD", "admin123456")
)


# ---------------------------------------------------------------------------
# Authentication helpers
# ---------------------------------------------------------------------------

def _check_auth(username: str, password: str) -> bool:
    return username == AUTH_USERNAME and check_password_hash(AUTH_PASSWORD_HASH, password)


def _request_auth_response():
    return (
        jsonify({"error": "Authentication required"}),
        401,
        {"WWW-Authenticate": 'Basic realm="Prompt Library"'},
    )


def require_auth(f):
    """Decorator that enforces HTTP Basic Authentication."""

    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        if not auth or not _check_auth(auth.username, auth.password):
            return _request_auth_response()
        return f(*args, **kwargs)

    return decorated


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


# ---------------------------------------------------------------------------
# Global auth — applies to every request including static files
# ---------------------------------------------------------------------------

@app.before_request
def check_global_auth():
    auth = request.authorization
    if not auth or not _check_auth(auth.username, auth.password):
        return _request_auth_response()


# ---------------------------------------------------------------------------
# Frontend route
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# Sections API
# ---------------------------------------------------------------------------

@app.route("/api/sections", methods=["GET"])
def get_sections():
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT * FROM sections ORDER BY id").fetchall()
        return jsonify([row_to_section(r) for r in rows])
    finally:
        conn.close()


@app.route("/api/sections", methods=["POST"])
def create_section():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    icon = (data.get("icon") or "📁").strip() or "📁"
    if not name:
        abort(400, "name is required")
    conn = get_db_connection()
    try:
        cur = conn.execute(
            "INSERT INTO sections (name, icon, created_at) VALUES (?, ?, ?)",
            (name, icon, now_iso()),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM sections WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify(row_to_section(row)), 201
    finally:
        conn.close()


@app.route("/api/sections/<int:section_id>", methods=["GET"])
def get_section(section_id):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM sections WHERE id = ?", (section_id,)).fetchone()
        if not row:
            abort(404, "Section not found")
        return jsonify(row_to_section(row))
    finally:
        conn.close()


@app.route("/api/sections/<int:section_id>", methods=["PUT"])
def update_section(section_id):
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    icon = (data.get("icon") or "📁").strip() or "📁"
    if not name:
        abort(400, "name is required")
    conn = get_db_connection()
    try:
        conn.execute(
            "UPDATE sections SET name = ?, icon = ? WHERE id = ?",
            (name, icon, section_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM sections WHERE id = ?", (section_id,)).fetchone()
        if not row:
            abort(404, "Section not found")
        return jsonify(row_to_section(row))
    finally:
        conn.close()


@app.route("/api/sections/<int:section_id>", methods=["DELETE"])
def delete_section(section_id):
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM sections WHERE id = ?", (section_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Subsections API
# ---------------------------------------------------------------------------

@app.route("/api/subsections", methods=["GET"])
def get_subsections():
    section_id = request.args.get("sectionId", type=int)
    conn = get_db_connection()
    try:
        if section_id:
            rows = conn.execute(
                "SELECT * FROM subsections WHERE section_id = ? ORDER BY id",
                (section_id,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM subsections ORDER BY id").fetchall()
        return jsonify([row_to_subsection(r) for r in rows])
    finally:
        conn.close()


@app.route("/api/subsections", methods=["POST"])
def create_subsection():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    section_id = data.get("sectionId")
    if not name:
        abort(400, "name is required")
    if not section_id:
        abort(400, "sectionId is required")
    conn = get_db_connection()
    try:
        cur = conn.execute(
            "INSERT INTO subsections (section_id, name, created_at) VALUES (?, ?, ?)",
            (section_id, name, now_iso()),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM subsections WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify(row_to_subsection(row)), 201
    finally:
        conn.close()


@app.route("/api/subsections/<int:sub_id>", methods=["DELETE"])
def delete_subsection(sub_id):
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM subsections WHERE id = ?", (sub_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Prompts API
# ---------------------------------------------------------------------------

@app.route("/api/prompts", methods=["GET"])
def get_prompts():
    section_id = request.args.get("sectionId", type=int)
    subsection_id = request.args.get("subsectionId", type=int)
    favorite = request.args.get("favorite")
    search = request.args.get("q", "").strip()

    conn = get_db_connection()
    try:
        query = "SELECT * FROM prompts WHERE 1=1"
        params: list = []

        if section_id:
            query += " AND section_id = ?"
            params.append(section_id)
        if subsection_id:
            query += " AND subsection_id = ?"
            params.append(subsection_id)
        if favorite is not None:
            query += " AND favorite = ?"
            params.append(1 if favorite.lower() in ("1", "true") else 0)
        if search:
            query += " AND (title LIKE ? OR content LIKE ? OR description LIKE ? OR tags LIKE ?)"
            like = f"%{search}%"
            params.extend([like, like, like, like])

        query += " ORDER BY updated_at DESC"
        rows = conn.execute(query, params).fetchall()
        return jsonify([row_to_prompt(r) for r in rows])
    finally:
        conn.close()


@app.route("/api/prompts", methods=["POST"])
def create_prompt():
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    section_id = data.get("sectionId")
    if not title:
        abort(400, "title is required")
    if not content:
        abort(400, "content is required")
    if not section_id:
        abort(400, "sectionId is required")

    description = (data.get("description") or "").strip()
    subsection_id = data.get("subsectionId") or None
    tags = json.dumps(data.get("tags") or [])
    favorite = 1 if data.get("favorite") else 0
    ts = now_iso()

    conn = get_db_connection()
    try:
        cur = conn.execute(
            """INSERT INTO prompts
               (title, description, section_id, subsection_id, content, tags, favorite, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (title, description, section_id, subsection_id, content, tags, favorite, ts, ts),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM prompts WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify(row_to_prompt(row)), 201
    finally:
        conn.close()


@app.route("/api/prompts/<int:prompt_id>", methods=["GET"])
def get_prompt(prompt_id):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
        if not row:
            abort(404, "Prompt not found")
        return jsonify(row_to_prompt(row))
    finally:
        conn.close()


@app.route("/api/prompts/<int:prompt_id>", methods=["PUT"])
def update_prompt(prompt_id):
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    section_id = data.get("sectionId")
    if not title:
        abort(400, "title is required")
    if not content:
        abort(400, "content is required")
    if not section_id:
        abort(400, "sectionId is required")

    description = (data.get("description") or "").strip()
    subsection_id = data.get("subsectionId") or None
    tags = json.dumps(data.get("tags") or [])
    favorite = 1 if data.get("favorite") else 0
    ts = now_iso()

    conn = get_db_connection()
    try:
        conn.execute(
            """UPDATE prompts SET
               title=?, description=?, section_id=?, subsection_id=?,
               content=?, tags=?, favorite=?, updated_at=?
               WHERE id=?""",
            (title, description, section_id, subsection_id, content, tags, favorite, ts, prompt_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
        if not row:
            abort(404, "Prompt not found")
        return jsonify(row_to_prompt(row))
    finally:
        conn.close()


@app.route("/api/prompts/<int:prompt_id>/favorite", methods=["PATCH"])
def toggle_favorite(prompt_id):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
        if not row:
            abort(404, "Prompt not found")
        new_val = 0 if row["favorite"] else 1
        conn.execute(
            "UPDATE prompts SET favorite=?, updated_at=? WHERE id=?",
            (new_val, now_iso(), prompt_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
        return jsonify(row_to_prompt(row))
    finally:
        conn.close()


@app.route("/api/prompts/<int:prompt_id>", methods=["DELETE"])
def delete_prompt(prompt_id):
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM prompts WHERE id = ?", (prompt_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Export / Import API
# ---------------------------------------------------------------------------

@app.route("/api/export", methods=["GET"])
def export_data():
    conn = get_db_connection()
    try:
        sections = [row_to_section(r) for r in conn.execute("SELECT * FROM sections ORDER BY id").fetchall()]
        subsections = [row_to_subsection(r) for r in conn.execute("SELECT * FROM subsections ORDER BY id").fetchall()]
        prompts = [row_to_prompt(r) for r in conn.execute("SELECT * FROM prompts ORDER BY id").fetchall()]
        return jsonify({
            "version": 1,
            "exportDate": now_iso(),
            "sections": sections,
            "subsections": subsections,
            "prompts": prompts,
        })
    finally:
        conn.close()


@app.route("/api/import", methods=["POST"])
def import_data():
    data = request.get_json(force=True)
    if not data or "version" not in data or "prompts" not in data:
        abort(400, "Invalid backup format")

    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM prompts")
        conn.execute("DELETE FROM subsections")
        conn.execute("DELETE FROM sections")

        section_id_map: dict = {}
        for s in data.get("sections", []):
            cur = conn.execute(
                "INSERT INTO sections (name, icon, created_at) VALUES (?, ?, ?)",
                (s["name"], s.get("icon", "📁"), s.get("createdAt", now_iso())),
            )
            section_id_map[s["id"]] = cur.lastrowid

        subsection_id_map: dict = {}
        for sub in data.get("subsections", []):
            new_sec = section_id_map.get(sub["sectionId"])
            if not new_sec:
                continue
            cur = conn.execute(
                "INSERT INTO subsections (section_id, name, created_at) VALUES (?, ?, ?)",
                (new_sec, sub["name"], sub.get("createdAt", now_iso())),
            )
            subsection_id_map[sub["id"]] = cur.lastrowid

        for p in data.get("prompts", []):
            new_sec = section_id_map.get(p["sectionId"])
            new_sub = subsection_id_map.get(p.get("subsectionId")) if p.get("subsectionId") else None
            if not new_sec:
                continue
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

        conn.commit()
        return jsonify({"ok": True, "message": "Data imported successfully"})
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Stats API
# ---------------------------------------------------------------------------

@app.route("/api/stats", methods=["GET"])
def get_stats():
    conn = get_db_connection()
    try:
        total_prompts = conn.execute("SELECT COUNT(*) FROM prompts").fetchone()[0]
        total_sections = conn.execute("SELECT COUNT(*) FROM sections").fetchone()[0]
        total_favorites = conn.execute("SELECT COUNT(*) FROM prompts WHERE favorite=1").fetchone()[0]
        return jsonify({
            "totalPrompts": total_prompts,
            "totalSections": total_sections,
            "totalFavorites": total_favorites,
        })
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
