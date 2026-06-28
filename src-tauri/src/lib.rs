use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    error::Error,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};

struct Database {
    connection: Mutex<Connection>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WisdomCard {
    id: String,
    date_key: String,
    body: String,
    context: String,
    md_link: String,
    pdf_link: String,
    parent_id: String,
    focus: String,
    tags: Vec<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    default_view_mode: String,
    card_density: String,
    daily_card_limit: u8,
}

impl Database {
    fn new(app_handle: &AppHandle) -> Result<Self, Box<dyn Error>> {
        let app_data_dir = app_handle.path().app_data_dir()?;
        fs::create_dir_all(&app_data_dir)?;

        let connection = Connection::open(app_data_dir.join("wisdom-cards.sqlite3"))?;
        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS cards (
              id TEXT PRIMARY KEY NOT NULL,
              date_key TEXT NOT NULL,
              body TEXT NOT NULL,
              context TEXT NOT NULL,
              md_link TEXT NOT NULL DEFAULT '',
              pdf_link TEXT NOT NULL DEFAULT '',
              parent_id TEXT NOT NULL DEFAULT '',
              focus TEXT NOT NULL,
              tags TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS cards_date_key_idx ON cards(date_key);
            CREATE INDEX IF NOT EXISTS cards_created_at_idx ON cards(created_at);

            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY NOT NULL,
              value TEXT NOT NULL
            );
            ",
        )?;

        if !column_exists(&connection, "cards", "md_link")? {
            connection.execute(
                "ALTER TABLE cards ADD COLUMN md_link TEXT NOT NULL DEFAULT ''",
                [],
            )?;
        }
        if !column_exists(&connection, "cards", "pdf_link")? {
            connection.execute(
                "ALTER TABLE cards ADD COLUMN pdf_link TEXT NOT NULL DEFAULT ''",
                [],
            )?;
        }
        if !column_exists(&connection, "cards", "parent_id")? {
            connection.execute(
                "ALTER TABLE cards ADD COLUMN parent_id TEXT NOT NULL DEFAULT ''",
                [],
            )?;
        }

        Ok(Self {
            connection: Mutex::new(connection),
        })
    }
}

#[tauri::command]
fn load_cards(database: State<'_, Database>) -> Result<Vec<WisdomCard>, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "
            SELECT id, date_key, body, context, md_link, pdf_link, parent_id, focus, tags, created_at, updated_at
            FROM cards
            ORDER BY created_at DESC
            ",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let tags_json: String = row.get(8)?;
            let tags = serde_json::from_str(&tags_json).unwrap_or_default();

            Ok(WisdomCard {
                id: row.get(0)?,
                date_key: row.get(1)?,
                body: row.get(2)?,
                context: row.get(3)?,
                md_link: row.get(4)?,
                pdf_link: row.get(5)?,
                parent_id: row.get(6)?,
                focus: row.get(7)?,
                tags,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|error| error.to_string())?;

    let mut cards = Vec::new();
    for row in rows {
        cards.push(row.map_err(|error| error.to_string())?);
    }

    Ok(cards)
}

#[tauri::command]
fn save_cards(cards: Vec<WisdomCard>, database: State<'_, Database>) -> Result<(), String> {
    let mut connection = database
        .connection
        .lock()
        .map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    transaction
        .execute("DELETE FROM cards", [])
        .map_err(|error| error.to_string())?;

    {
        let mut statement = transaction
            .prepare(
                "
                INSERT INTO cards (
                  id, date_key, body, context, md_link, pdf_link, parent_id, focus, tags, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                ",
            )
            .map_err(|error| error.to_string())?;

        for card in cards {
            let tags_json = serde_json::to_string(&card.tags).map_err(|error| error.to_string())?;

            statement
                .execute(params![
                    card.id,
                    card.date_key,
                    card.body,
                    card.context,
                    card.md_link,
                    card.pdf_link,
                    card.parent_id,
                    card.focus,
                    tags_json,
                    card.created_at,
                    card.updated_at
                ])
                .map_err(|error| error.to_string())?;
        }
    }

    transaction.commit().map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn load_settings(database: State<'_, Database>) -> Result<AppSettings, String> {
    let connection = database
        .connection
        .lock()
        .map_err(|error| error.to_string())?;
    let settings_json = connection
        .query_row("SELECT value FROM settings WHERE key = 'app'", [], |row| {
            row.get::<_, String>(0)
        })
        .unwrap_or_else(|_| "{}".to_string());

    Ok(serde_json::from_str(&settings_json).unwrap_or_else(|_| default_settings()))
}

#[tauri::command]
fn save_settings(settings: AppSettings, database: State<'_, Database>) -> Result<(), String> {
    let connection = database
        .connection
        .lock()
        .map_err(|error| error.to_string())?;
    let settings_json = serde_json::to_string(&settings).map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            INSERT INTO settings (key, value)
            VALUES ('app', ?1)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            ",
            [settings_json],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn default_settings() -> AppSettings {
    AppSettings {
        default_view_mode: "list".to_string(),
        card_density: "comfortable".to_string(),
        daily_card_limit: 3,
    }
}

#[tauri::command]
fn open_markdown_folder(link: String) -> Result<(), String> {
    let markdown_path = markdown_path_from_link(&link)?;
    let folder_path = markdown_path
        .parent()
        .ok_or_else(|| "无法找到 Markdown 文件所在文件夹。".to_string())?;

    open_folder(folder_path)
}

#[tauri::command]
fn open_pdf_attachment(link: String) -> Result<(), String> {
    let pdf_path = pdf_path_from_link(&link)?;

    open_file(&pdf_path)
}

fn column_exists(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
) -> rusqlite::Result<bool> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table_name})"))?;
    let mut rows = statement.query([])?;

    while let Some(row) = rows.next()? {
        let existing_column: String = row.get(1)?;
        if existing_column == column_name {
            return Ok(true);
        }
    }

    Ok(false)
}

fn markdown_path_from_link(link: &str) -> Result<PathBuf, String> {
    file_path_from_link(link, "Markdown 链接为空。", "Markdown 文件不存在。")
}

fn pdf_path_from_link(link: &str) -> Result<PathBuf, String> {
    let path = file_path_from_link(link, "PDF 附件为空。", "PDF 文件不存在。")?;
    let is_pdf = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);

    if is_pdf {
        Ok(path)
    } else {
        Err("请选择 PDF 文件。".to_string())
    }
}

fn file_path_from_link(
    link: &str,
    empty_message: &str,
    missing_message: &str,
) -> Result<PathBuf, String> {
    let trimmed_link = link.trim();
    if trimmed_link.is_empty() {
        return Err(empty_message.to_string());
    }

    let path_text = trimmed_link.strip_prefix("file://").unwrap_or(trimmed_link);
    let path = PathBuf::from(path_text);

    if path.is_file() {
        return Ok(path);
    }

    Err(missing_message.to_string())
}

fn open_folder(folder_path: &Path) -> Result<(), String> {
    let status = if cfg!(target_os = "macos") {
        Command::new("open").arg(folder_path).status()
    } else if cfg!(target_os = "windows") {
        Command::new("explorer").arg(folder_path).status()
    } else {
        Command::new("xdg-open").arg(folder_path).status()
    }
    .map_err(|error| error.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("打开 Markdown 文件夹失败。".to_string())
    }
}

fn open_file(file_path: &Path) -> Result<(), String> {
    let status = if cfg!(target_os = "macos") {
        Command::new("open").arg(file_path).status()
    } else if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(file_path)
            .status()
    } else {
        Command::new("xdg-open").arg(file_path).status()
    }
    .map_err(|error| error.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("打开 PDF 附件失败。".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let database = Database::new(app.handle())?;
            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_cards,
            save_cards,
            load_settings,
            save_settings,
            open_markdown_folder,
            open_pdf_attachment
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
