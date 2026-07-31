//! Detects a physically-connected VR headset by USB vendor/product id - see `usb_devices`'s
//! module docs for why this is necessary at all: PICO Connect (and likely similar PC-bridge
//! software for other headsets) doesn't register as a WebXR-discoverable runtime and its
//! controller mouse-emulation is indistinguishable from a real touch/mouse event once it reaches
//! the browser, so there's no reliable browser-side signal for "a VR headset is connected." The
//! headset's own USB device descriptor is a signal nothing in between can fake or lose.

use super::usb_devices::{list_usb_devices, UsbDeviceInfo};
use serde::Serialize;

struct KnownVrHeadset {
    vendor_id: u16,
    product_id: u16,
    name: &'static str,
}

/// Extend this list as support for other headsets is confirmed the same way Pico 4 was here -
/// connect it, run `usb_devices::tests::lists_real_usb_devices_on_this_machine` (`--ignored
/// --nocapture`), and read its vendor id/product id off the real device.
const KNOWN_VR_HEADSETS: &[KnownVrHeadset] = &[KnownVrHeadset {
    vendor_id: 0x2d40,
    product_id: 0x00b6,
    name: "PICO 4",
}];

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ConnectedVrHeadset {
    pub name: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub serial_number: Option<String>,
}

fn match_known_headset(device: &UsbDeviceInfo) -> Option<&'static KnownVrHeadset> {
    KNOWN_VR_HEADSETS
        .iter()
        .find(|known| known.vendor_id == device.vendor_id && known.product_id == device.product_id)
}

/// Returns the first known VR headset found connected over USB, or `None` if none of
/// `KNOWN_VR_HEADSETS` is present. Not a general "is any VR headset connected" check - only
/// recognizes headsets this list has been taught about.
#[tauri::command]
pub fn detect_connected_vr_headset() -> Result<Option<ConnectedVrHeadset>, String> {
    let devices = list_usb_devices()?;

    Ok(devices.iter().find_map(|device| {
        match_known_headset(device).map(|known| ConnectedVrHeadset {
            name: known.name.to_string(),
            vendor_id: device.vendor_id,
            product_id: device.product_id,
            serial_number: device.serial_number.clone(),
        })
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real-machine check - `#[ignore]`d by default (see `steam::paths::tests` for the
    /// convention this follows). Run explicitly with the Pico 4 connected via PICO Connect:
    /// `cargo test --lib -- --ignored --nocapture detects_pico_4_when_connected_on_this_machine`.
    #[test]
    #[ignore]
    fn detects_pico_4_when_connected_on_this_machine() {
        let headset = detect_connected_vr_headset()
            .expect("expected to enumerate USB devices")
            .expect("expected a PICO 4 to be detected - is it connected via PICO Connect?");

        assert_eq!(headset.name, "PICO 4");
        assert_eq!(headset.vendor_id, 0x2d40);
        assert_eq!(headset.product_id, 0x00b6);
        println!("Detected: {headset:?}");
    }
}
