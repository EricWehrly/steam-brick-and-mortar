//! Generic (not HID-limited) USB device enumeration. `hid_devices` only sees devices exposing a
//! HID-class interface (mice, keyboards, joysticks) - a device that enumerates as something else
//! entirely (Android/ADB composite, a vendor-specific streaming interface, a virtual network
//! adapter) is invisible to it. This module walks the full USB device tree instead, so a headset
//! whose PC-side bridge software (e.g. PICO Connect) doesn't register any HID interface at all
//! can still be identified by its raw vendor id/product id/device class.

use nusb::MaybeFuture;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct UsbDeviceInfo {
    pub vendor_id: u16,
    pub product_id: u16,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    /// USB device class/subclass/protocol at the device descriptor level - 0x00 means "defined
    /// per-interface" (common for composite devices; check each interface's own class instead).
    pub class: u8,
    pub subclass: u8,
    pub protocol: u8,
}

/// Lists every USB device visible to the OS, regardless of device class - see module docs for
/// why this is broader (and, for a non-HID device like a streaming headset, more useful) than
/// `hid_devices::list_hid_devices`. Intended for manual inspection (see the real-machine test
/// below) while identifying an unknown device's vendor id / product id signature.
#[tauri::command]
pub fn list_usb_devices() -> Result<Vec<UsbDeviceInfo>, String> {
    let devices = nusb::list_devices().wait().map_err(|e| format!("failed to list USB devices: {e}"))?;

    Ok(devices
        .map(|device| UsbDeviceInfo {
            vendor_id: device.vendor_id(),
            product_id: device.product_id(),
            manufacturer: device.manufacturer_string().map(str::to_string),
            product: device.product_string().map(str::to_string),
            serial_number: device.serial_number().map(str::to_string),
            class: device.class(),
            subclass: device.subclass(),
            protocol: device.protocol(),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real-machine check - `#[ignore]`d by default (see `steam::paths::tests` for the
    /// convention this follows). Run explicitly with the device of interest connected:
    /// `cargo test --lib -- --ignored --nocapture lists_real_usb_devices_on_this_machine`.
    #[test]
    #[ignore]
    fn lists_real_usb_devices_on_this_machine() {
        let devices = list_usb_devices().expect("expected to enumerate USB devices");
        assert!(!devices.is_empty(), "expected at least one USB device on this machine");

        for device in &devices {
            println!(
                "vid=0x{:04x} pid=0x{:04x} class=0x{:02x} subclass=0x{:02x} protocol=0x{:02x} manufacturer={:?} product={:?} serial={:?}",
                device.vendor_id, device.product_id, device.class, device.subclass, device.protocol,
                device.manufacturer, device.product, device.serial_number
            );
        }
    }
}
