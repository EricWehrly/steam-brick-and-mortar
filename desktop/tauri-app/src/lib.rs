mod steam;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            steam::identity::read_steam_identity,
            steam::playtime::read_steam_playtimes,
            steam::collections::read_steam_collections,
            steam::appinfo::read_local_app_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
