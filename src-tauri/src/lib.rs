mod window;
mod api;

use tauri::{Manager, PhysicalPosition};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            // Open DevTools — enabled via devtools feature for debugging
            #[cfg(feature = "devtools")]
            window.open_devtools();
            tauri::async_runtime::spawn(async move {
                if let Ok(Some(pos)) = window::load_window_position().await {
                    if pos.x > -32000 && pos.y > -32000 {
                        let _ = window.set_position(PhysicalPosition::new(pos.x, pos.y));
                    } else {
                        let _ = window.center();
                    }
                } else {
                    let _ = window.center();
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(80)).await;
                let _ = window.show();
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            window::save_window_position,
            window::load_window_position,
            api::staff_login,
            api::get_info,
            api::get_orders,
            api::audit_order,
            api::get_withdrawals,
            api::audit_withdrawal,
            api::get_users,
            api::get_chat_sessions,
            api::get_chat_messages,
            api::send_chat_reply,
            api::claim_chat_session,
            api::close_chat_session,
            api::poll_chat_session,
            api::get_dashboard_poll,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
