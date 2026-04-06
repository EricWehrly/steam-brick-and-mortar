# Steam Tag Styling Research

## Summary
Steam's game tags (genres and categories) are styled as interactive "pills" that provide visual metadata about a game. They are primarily found in the "Glance" section (sidebar) and the "All Tags" modal. The styling is consistent with Steam's dark, industrial aesthetic, using semi-transparent backgrounds and subtle hover effects.

## CSS Properties Observed

The primary container for tags in the sidebar is typically `.glance_tags` or `.app_tags`. Individual tags use the `.app_tag` class.

| Property | Value (Approximate) | Notes |
| :--- | :--- | :--- |
| **Element Type** | `<a>` (link) | Tags are functional links to tag-specific browse pages. |
| **Background Color** | `rgba(103, 193, 245, 0.1)` | A very faint, semi-transparent blue/grey. |
| **Text Color** | `#67c1f5` | The classic Steam "blue" link color. |
| **Font Size** | `11px` to `12px` | Very compact. |
| **Font Weight** | `normal` | Sometimes set to `400`. |
| **Border Radius** | `2px` | Very slight rounding, almost square. |
| **Padding** | `0 7px` | Horizontal padding; line-height usually handles vertical. |
| **Height / Line-Height** | `19px` to `22px` | Fixed height look. |
| **Margin** | `0 4px 4px 0` | Spacing between pills. |
| **Display** | `inline-block` | Allows them to wrap naturally. |
| **Text Transform** | `none` | Tags are usually title-case or as defined in DB. |
| **Background (Hover)** | `rgba(103, 193, 245, 0.2)` | Becomes slightly more opaque/bright. |
| **Text Color (Hover)** | `#ffffff` | Often transitions to white on hover. |

## Notable Variants

- **Genre vs. Feature Tags:** Visually, Steam does *not* significantly differentiate between a "Genre" tag (e.g., RPG) and a "Feature" tag (e.g., Single-player) in the main UI list. They are all rendered as `.app_tag`.
- **"Add your own" (+ icon):** Usually styled with the same background but a dotted border or different icon opacity.
- **Top Tags:** The first few tags in the list are treated as "High Information" tags but do not have unique CSS styles; they are simply ordered first.

## Recommendation for `UITag` Component

For the **Steam Brick and Mortar** project, we should replicate the "functional metadata" feel while adapting it for a 3D/VR space where 11px text might be unreadable.

1.  **Replicate:**
    *   **Semi-transparency:** Use a low-alpha background (e.g., `0.1` or `0.15`) to let the shelf/environment colors bleed through slightly, maintaining the "Steam" look.
    *   **Subtle Rounding:** Stick to a small border-radius (`2px` - `4px`) rather than "pill" shapes (large radius) to keep the industrial aesthetic.
    *   **Color Palette:** Use the `#67c1f5` blue for the primary text/border color.

2.  **Simplify/Modify:**
    *   **Interaction:** In VR, we may want to skip the "link" behavior (opening a browser) and instead use them for filtering the current shelf view.
    *   **Readability:** Increase font size for VR (minimum equivalent of 14-16px) and perhaps use a slightly bolder font weight (`500`) to ensure legibility against complex backgrounds.
    *   **Hover State:** Since "hover" in VR (pointing) is a key feedback loop, the background should glow or increase in opacity significantly more than the 10% jump on the website.
