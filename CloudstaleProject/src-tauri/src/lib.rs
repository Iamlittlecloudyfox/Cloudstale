mod ollama;
use ollama::{http_get_json, stream_chat, abort_stream, StreamRegistry};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(StreamRegistry::default())
    .invoke_handler(tauri::generate_handler![
        http_get_json,
        stream_chat,
        abort_stream
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
