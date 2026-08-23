use futures_util::StreamExt;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{Mutex, Notify};

pub struct StreamRegistry(pub Arc<Mutex<HashMap<String, Arc<Notify>>>>);

impl Default for StreamRegistry {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

#[tauri::command]
pub async fn http_get_json(url: String, headers: HashMap<String, String>) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut req = client.get(&url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status.as_u16(), text));
    }
    Ok(text)
}

#[tauri::command]
pub async fn stream_chat(
    app: AppHandle,
    registry: State<'_, StreamRegistry>,
    request_id: String,
    url: String,
    headers: HashMap<String, String>,
    body: String,
) -> Result<(), String> {
    let notify = Arc::new(Notify::new());
    {
        let mut map = registry.0.lock().await;
        map.insert(request_id.clone(), notify.clone());
    }

    let client = reqwest::Client::new();
    let mut req = client.post(&url).body(body);
    for (k, v) in &headers {
        req = req.header(k, v);
    }

    let run = async {
        let res = req.send().await.map_err(|e| e.to_string())?;
        let status = res.status();
        if !status.is_success() {
            let text = res.text().await.unwrap_or_default();
            return Err(format!("HTTP {}: {}", status.as_u16(), text));
        }

        let mut stream = res.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            let text = String::from_utf8_lossy(&chunk).to_string();
            let _ = app.emit(&format!("stream-chunk-{}", request_id), text);
        }
        Ok::<(), String>(())
    };

    tokio::select! {
        result = run => {
            registry.0.lock().await.remove(&request_id);
            match result {
                Ok(_) => { let _ = app.emit(&format!("stream-done-{}", request_id), ()); }
                Err(e) => { let _ = app.emit(&format!("stream-error-{}", request_id), e); }
            }
        }
        _ = notify.notified() => {
            registry.0.lock().await.remove(&request_id);
            let _ = app.emit(&format!("stream-aborted-{}", request_id), ());
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn abort_stream(registry: State<'_, StreamRegistry>, request_id: String) -> Result<(), String> {
    if let Some(notify) = registry.0.lock().await.get(&request_id) {
        notify.notify_one();
    }
    Ok(())
}