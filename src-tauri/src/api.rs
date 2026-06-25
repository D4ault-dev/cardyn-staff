// Cardyn Staff API — all HTTP calls to https://api.cardyn.net go through here.
// The frontend sends the JWT token with each call; Rust forwards it via reqwest.

use serde::{Deserialize, Serialize};
use serde_json::Value;

const API_BASE: &str = "https://api.cardyn.net";

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_default()
}

// ── Auth ──────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[tauri::command]
pub async fn staff_login(username: String, password: String) -> Result<Value, String> {
    let res = client()
        .post(format!("{}/tuka/staffAuth/login", API_BASE))
        .json(&LoginRequest { username, password })
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(res)
}

#[tauri::command]
pub async fn get_info(token: String) -> Result<Value, String> {
    let res = client()
        .get(format!("{}/getInfo", API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(res)
}

// ── Orders ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_orders(token: String, params: Value) -> Result<Value, String> {
    let mut req = client()
        .get(format!("{}/tuka/order/list", API_BASE))
        .header("Authorization", format!("Bearer {}", token));
    if let Some(map) = params.as_object() {
        for (k, v) in map {
            if let Some(s) = v.as_str() {
                if !s.is_empty() { req = req.query(&[(k, s)]); }
            } else if let Some(n) = v.as_i64() {
                req = req.query(&[(k, n.to_string())]);
            }
        }
    }
    req.send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn audit_order(token: String, payload: Value) -> Result<Value, String> {
    client()
        .put(format!("{}/tuka/order/audit", API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .json(&payload)
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

// ── Withdrawals ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_withdrawals(token: String, params: Value) -> Result<Value, String> {
    let mut req = client()
        .get(format!("{}/tuka/withdrawal/list", API_BASE))
        .header("Authorization", format!("Bearer {}", token));
    if let Some(map) = params.as_object() {
        for (k, v) in map {
            if let Some(s) = v.as_str() {
                if !s.is_empty() { req = req.query(&[(k, s)]); }
            } else if let Some(n) = v.as_i64() {
                req = req.query(&[(k, n.to_string())]);
            }
        }
    }
    req.send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn audit_withdrawal(token: String, payload: Value) -> Result<Value, String> {
    client()
        .put(format!("{}/tuka/withdrawal/audit", API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .json(&payload)
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

// ── Users ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_users(token: String, params: Value) -> Result<Value, String> {
    let mut req = client()
        .get(format!("{}/tuka/user/list", API_BASE))
        .header("Authorization", format!("Bearer {}", token));
    if let Some(map) = params.as_object() {
        for (k, v) in map {
            if let Some(s) = v.as_str() {
                if !s.is_empty() { req = req.query(&[(k, s)]); }
            } else if let Some(n) = v.as_i64() {
                req = req.query(&[(k, n.to_string())]);
            }
        }
    }
    req.send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

// ── Chat ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_chat_sessions(token: String, status: Option<String>) -> Result<Value, String> {
    let mut req = client()
        .get(format!("{}/tuka/chat/admin/sessions", API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .query(&[("pageSize", "100")]);
    if let Some(s) = status {
        if !s.is_empty() { req = req.query(&[("status", s)]); }
    }
    req.send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_chat_messages(token: String, session_id: i64) -> Result<Value, String> {
    client()
        .get(format!("{}/tuka/chat/messages/{}", API_BASE, session_id))
        .header("Authorization", format!("Bearer {}", token))
        .query(&[("pageSize", "100")])
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn poll_chat_session(token: String, session_id: i64, last_id: i64) -> Result<Value, String> {
    client()
        .get(format!("{}/tuka/chat/poll/{}", API_BASE, session_id))
        .header("Authorization", format!("Bearer {}", token))
        .query(&[("lastId", last_id.to_string())])
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_chat_reply(token: String, session_id: i64, content: String) -> Result<Value, String> {
    client()
        .post(format!("{}/tuka/chat/admin/reply", API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "sessionId": session_id, "content": content }))
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn claim_chat_session(token: String, session_id: i64) -> Result<Value, String> {
    client()
        .post(format!("{}/tuka/chat/admin/claim/{}", API_BASE, session_id))
        .header("Authorization", format!("Bearer {}", token))
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_chat_session(token: String, session_id: i64) -> Result<Value, String> {
    client()
        .post(format!("{}/tuka/chat/admin/close/{}", API_BASE, session_id))
        .header("Authorization", format!("Bearer {}", token))
        .send().await.map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

// ── Dashboard poll — all counts in one request ────────────────────────────────

#[tauri::command]
pub async fn get_dashboard_poll(token: String, since: i64) -> Result<Value, String> {
    // Try the combined endpoint first, fall back gracefully
    let res = client()
        .get(format!("{}/tuka/staff/dashboard-poll", API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .query(&[("since", since.to_string())])
        .send().await;

    match res {
        Ok(r) if r.status().is_success() => {
            r.json::<Value>().await.map_err(|e| e.to_string())
        }
        _ => {
            // Fallback: return empty — frontend handles gracefully
            Ok(serde_json::json!({ "code": 200, "data": { "pendingOrders": 0, "pendingWithdrawals": 0, "newSessions": [] } }))
        }
    }
}
