//! Raw HID device enumeration via the OS - independent of whatever a browser's Gamepad/Touch/
//! Pointer APIs report for the same physical device. Exists because `DeviceDetector.ts`'s
//! browser-side classification has been observed to misidentify a connected VR controller as a
//! touchscreen (a synthetic `touchstart` event, not a real tap) - the browser has no reliable way
//! to ask "what kind of hardware actually generated this," but the OS's own HID enumeration does:
//! every device reports a vendor id, product id, and a usage page/usage pair that (for controllers
//! following the standard HID usage tables) identifies its general class independent of how any
//! particular browser or webview chooses to surface its input events.

use hidapi::HidApi;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct HidDeviceInfo {
    pub vendor_id: u16,
    pub product_id: u16,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    /// HID usage page (e.g. 0x01 = Generic Desktop, which covers mice/keyboards/joysticks/
    /// gamepads/multi-axis controllers - the `usage` field within that page narrows further).
    pub usage_page: u16,
    pub usage: u16,
    pub interface_number: i32,
}

/// Lists every HID device currently visible to the OS - not filtered to any particular class,
/// since we don't yet know which vendor id / product id / usage signature this dev machine's VR
/// controller reports. Intended for manual inspection (see the real-machine test below) while
/// building up that identification; not yet wired into any device-classification decision.
#[tauri::command]
pub fn list_hid_devices() -> Result<Vec<HidDeviceInfo>, String> {
    let api = HidApi::new().map_err(|e| format!("failed to initialize HID API: {e}"))?;

    Ok(api
        .device_list()
        .map(|device| HidDeviceInfo {
            vendor_id: device.vendor_id(),
            product_id: device.product_id(),
            manufacturer: device.manufacturer_string().map(str::to_string),
            product: device.product_string().map(str::to_string),
            serial_number: device.serial_number().map(str::to_string),
            usage_page: device.usage_page(),
            usage: device.usage(),
            interface_number: device.interface_number(),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real-machine check - `#[ignore]`d by default (see `steam::paths::tests` for the
    /// convention this follows). Run explicitly with a VR controller connected to see exactly
    /// what the OS reports for it: `cargo test --lib -- --ignored --nocapture lists_real_hid_devices_on_this_machine`.
    #[test]
    #[ignore]
    fn lists_real_hid_devices_on_this_machine() {
        let devices = list_hid_devices().expect("expected to enumerate HID devices");
        assert!(!devices.is_empty(), "expected at least one HID device (mouse/keyboard) on this machine");

        for device in &devices {
            println!(
                "vid=0x{:04x} pid=0x{:04x} usage_page=0x{:02x} usage=0x{:02x} iface={} manufacturer={:?} product={:?}",
                device.vendor_id, device.product_id, device.usage_page, device.usage,
                device.interface_number, device.manufacturer, device.product
            );
        }
    }
}
