# Prompt Library App

A self-hosted prompt management application with SQLite storage and HTTP Basic Authentication.
Based on the open-source [Prompt-Library-App](https://github.com/nyeya/Prompt-Library-App).

## Features

- 📝 Create, edit, duplicate and delete prompts
- 📂 Organise prompts into sections and subsections
- ⭐ Mark prompts as favourites
- 🔍 Full-text search across title, content, description and tags
- 🏷️ Tag-based filtering
- 💾 Export and import all data as JSON
- 🌓 Dark / light theme
- 🔒 HTTP Basic Authentication
- 🗄️ Persistent SQLite database
- 🐳 Systemd service support for production

## Requirements

- Python 3.10 or newer
- `pip`

## Quick start (development)

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Seed the database with sample prompts (optional)
python seed.py

# 3. Start the application
python app.py
```

Open <http://localhost:5000> in your browser.  
Default credentials: **username** `admin` / **password** `admin123456`

## Install for production

The included `install.sh` script installs the application, creates a virtual
environment, initialises the database, and optionally registers a systemd service.

```bash
chmod +x install.sh
./install.sh
```

### Environment variables

| Variable         | Default                         | Description                       |
|------------------|---------------------------------|-----------------------------------|
| `PORT`           | `5000`                          | HTTP port to listen on            |
| `AUTH_USERNAME`  | `admin`                         | Basic-auth username               |
| `AUTH_PASSWORD`  | `admin123456`                   | Basic-auth password               |
| `DATABASE_PATH`  | `data/prompts.db`               | Path to the SQLite database file  |
| `DEBUG`          | `false`                         | Enable Flask debug mode           |

> **Security note:** Change the default password before deploying to a public server.
> Set the `AUTH_PASSWORD` environment variable or edit the `.env` file created by `install.sh`.

## Seed script

The `seed.py` script populates the database with sample prompts from `prompt.json`:

```bash
python seed.py                 # uses prompt.json in the current directory
python seed.py /path/to/data.json  # uses a custom JSON file
```

## API endpoints

All endpoints require HTTP Basic Authentication.

| Method   | Path                              | Description               |
|----------|-----------------------------------|---------------------------|
| GET      | `/`                               | Serve the frontend        |
| GET      | `/api/sections`                   | List sections             |
| POST     | `/api/sections`                   | Create a section          |
| PUT      | `/api/sections/<id>`              | Update a section          |
| DELETE   | `/api/sections/<id>`              | Delete a section          |
| GET      | `/api/subsections`                | List subsections          |
| POST     | `/api/subsections`                | Create a subsection       |
| DELETE   | `/api/subsections/<id>`           | Delete a subsection       |
| GET      | `/api/prompts`                    | List prompts (filterable) |
| POST     | `/api/prompts`                    | Create a prompt           |
| GET      | `/api/prompts/<id>`               | Get a single prompt       |
| PUT      | `/api/prompts/<id>`               | Update a prompt           |
| DELETE   | `/api/prompts/<id>`               | Delete a prompt           |
| PATCH    | `/api/prompts/<id>/favorite`      | Toggle favourite          |
| GET      | `/api/stats`                      | Get summary stats         |
| GET      | `/api/export`                     | Export all data as JSON   |
| POST     | `/api/import`                     | Import JSON backup        |

### Query parameters for `GET /api/prompts`

| Parameter     | Description                              |
|---------------|------------------------------------------|
| `q`           | Full-text search string                  |
| `sectionId`   | Filter by section ID                     |
| `subsectionId`| Filter by subsection ID                  |
| `favorite`    | `true` / `false` — filter by favourite  |

## Project structure

```
.
├── app.py          # Flask application and REST API
├── db.py           # Database helpers and row converters
├── seed.py         # Database seed script
├── install.sh      # Production install script
├── requirements.txt
├── prompt.json     # Sample prompt data used by seed.py
├── data/
│   └── prompts.db  # SQLite database (created at runtime)
├── templates/
│   └── index.html  # Frontend HTML
└── static/
    ├── index.css   # Stylesheet
    └── main.js     # Frontend JavaScript (uses REST API)
```

## License

MIT
