import { name } from '../../package.json'

/** The app's identifier, taken from package.json's `name`. Prefixes every localStorage key and downloaded settings file name, so renaming the package
 *  orphans every user's saved settings. */
export const APP_ID: string = name
