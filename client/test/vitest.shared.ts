/**
 * Vitest blanks every .css file to an empty string by default (so component tests don't pay for
 * CSS they never look at), and that applies to `?raw` imports too. The VR menu's stylesheet is
 * digested from raw text into uikit's style registry, so it must come through intact - otherwise
 * the menu silently has no styles under test. Every vitest config lists this under `test.css`.
 *
 * Deliberately not anchored with `$`: the module id being matched still carries its `?raw` suffix.
 */
export const RAW_STYLESHEET_CSS = {
  include: [/src[\\/]styles[\\/]vr-menu\.css/]
}
