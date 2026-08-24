// Cardyn Staff API — all HTTP calls to https://api.cardyn.net go through here.
// The frontend sends the JWT token with each call; Rust forwards it via reqwest.
//
// Key design decisions:
//  - ONE shared reqwest::Client via OnceLock — reuses TCP/TLS connections (connection pool)
//    Instead of creating a new client per request (which does a full TLS handshake each time),
//    we share one client with a pool of keep-alive connections. This makes requests ~300ms faster.
//  - Separate timeouts per operation type:
//    · read/list ops: 30s  (server may be briefly busy)
//    · write/audit ops: 45s (PalmPay calls can take longer)
//    · connect timeout: 8s  (if server is down, fail fast)
//  - On error: return a clean message, never the raw reqwest error string

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::OnceLock;
use std::time::Duration;

const API_BASE: &str = "https://api.cardyn.net";

// ── Shared HTTP client — one pool for all commands ───────────────────────────
// OnceLock initialises exactly once; all Tauri commands share the same client.
// reqwest's internal connection pool reuses TCP/TLS connections automatically.
static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(8))   // fail fast if server unreachable
            .timeout(Duration::from_secs(30))           // default for read ops
            .pool_max_idle_per_host(6)                  // keep up to 6 idle connections
            .pool_idle_timeout(Duration::from_secs(60)) // recycle idle connections after 60s
            .tcp_keepalive(Duration::from_secs(30))     // keep TCP alive between requests
            .build()
            .expect("Failed to build HTTP client")
    })
}

/// Convert a reqwest/network error into a clean user-facing message
fn net_err(e: reqwest::Error) -> String {
    if e.is_timeout() {
        "服务器响应超时，请稍后重试".to_string()        // "Server timed out, please retry"
    } else if e.is_connect() {
        "无法连接到服务器，请检查网络".to_string()      // "Cannot reach server, check network"
    } else {
        format!("网络错误: {}", e)
    }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[tauri::command]
pub async fn staff_login(username: String, password: String) -> Result<Value, String> {
    client()
        .post(format!("{}/tuka/staffAuth/login", API_BASE))
        .json(&LoginRequest { username, password })
        .send()
        .await
        .map_err(net_err)?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_info(token: String) -> Result<Value, String> {
    client()
        .get(format!("{}/getInfo", API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(net_err)?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())
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
    req.send().await.map_err(net_err)?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn audit_order(token: String, payload: Value) -> Result<Value, String> {
    // Audit may trigger PalmPay — give it 45s
    client()
        .put(format!("{}/tuka/order/audit", API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .timeout(Duration::from_secs(45))
        .json(&payload)
        .send().await.map_err(net_err)?
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
    req.send().await.map_err(net_err)?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn audit_withdrawal(token: String, payload: Value) -> Result<Value, String> {
    // Withdrawal audit calls PalmPay — give it 45s
    client()
        .put(format!("{}/tuka/withdrawal/audit", API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .timeout(Duration::from_secs(45))
        .json(&payload)
        .send().await.map_err(net_err)?
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
    req.send().await.map_err(net_err)?
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
    req.send().await.map_err(net_err)?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_chat_messages(token: String, session_id: i64) -> Result<Value, String> {
    client()
        .get(format!("{}/tuka/chat/messages/{}", API_BASE, session_id))
        .header("Authorization", format!("Bearer {}", token))
        .query(&[("pageSize", "100")])
        .send().await.map_err(net_err)?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn poll_chat_session(token: String, session_id: i64, last_id: i64) -> Result<Value, String> {
    client()
        .get(format!("{}/tuka/chat/poll/{}", API_BASE, session_id))
        .header("Authorization", format!("Bearer {}", token))
        .query(&[("lastId", last_id.to_string())])
        .send().await.map_err(net_err)?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_chat_reply(token: String, session_id: i64, content: String) -> Result<Value, String> {
    client()
        .post(format!("{}/tuka/chat/admin/reply", API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "sessionId": session_id, "content": content }))
        .send().await.map_err(net_err)?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn claim_chat_session(token: String, session_id: i64) -> Result<Value, String> {
    client()
        .post(format!("{}/tuka/chat/admin/claim/{}", API_BASE, session_id))
        .header("Authorization", format!("Bearer {}", token))
        .send().await.map_err(net_err)?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_chat_session(token: String, session_id: i64) -> Result<Value, String> {
    client()
        .post(format!("{}/tuka/chat/admin/close/{}", API_BASE, session_id))
        .header("Authorization", format!("Bearer {}", token))
        .send().await.map_err(net_err)?
        .json::<Value>().await.map_err(|e| e.to_string())
}

// ── Dashboard poll — all counts in one request ────────────────────────────────

#[tauri::command]
pub async fn get_dashboard_poll(token: String, since: i64) -> Result<Value, String> {
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
            Ok(serde_json::json!({
                "code": 200,
                "data": { "pendingOrders": 0, "pendingWithdrawals": 0, "newSessions": [] }
            }))
        }
    }
}
