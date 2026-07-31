mod hardware;
mod steam;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            steam::identity::read_steam_identity,
            steam::playtime::read_steam_playtimes,
            steam::collections::read_steam_collections,
            steam::appinfo::read_local_app_metadata,
            steam::screenshots::read_local_screenshots,
            steam::screenshots::read_local_screenshot_bytes,
            steam::librarycache::find_local_library_art,
            steam::librarycache::read_local_library_art_bytes,
            hardware::hid_devices::list_hid_devices,
            hardware::usb_devices::list_usb_devices,
            hardware::vr_headsets::detect_connected_vr_headset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
