/**
 * RecentlyPlayedCeilingSign
 *
 * Places a single "Recently Played" sign hanging from the ceiling near the
 * front of the store. The sign uses the CategorySignSystem ceiling mount style.
 *
 * Phase 1: flat above-shelf geometry at ceiling height (visible, not yet a
 * true hanging cable-and-bracket sign — that is a future visual pass).
 * Tech debt: docs/roadmaps/tech-debt.md -> "Ceiling sign visual pass"
 */

import * as THREE from 'three'
import { CategorySignSystem, SignStyles, type SignMount } from './CategorySignSystem'
import { RoomConstants } from './RoomManager'

export const RECENTLY_PLAYED_SIGN_LABEL = 'Recently Played'

/** Z-position (depth into store) where the sign is anchored. 0 = entrance. */
const SIGN_ANCHOR_Z = -1.5

/**
 * Drop from ceiling — how far below ceiling surface the sign centre sits.
 * Enough to be clearly readable when standing at the entrance.
 */
const SIGN_DROP_FROM_CEILING = 0.5

export class RecentlyPlayedCeilingSign {
    private readonly signSystem: CategorySignSystem

    constructor(scene: THREE.Scene) {
        this.signSystem = new CategorySignSystem(scene)
    }

    /** Place (or replace) the Recently Played ceiling sign. */
    public place(centerX = 0): void {
        const y = RoomConstants.STORE_CEILING_HEIGHT - SIGN_DROP_FROM_CEILING

        const mount: SignMount = {
            style: 'ceiling',
        }

        this.signSystem.setSign({
            label: RECENTLY_PLAYED_SIGN_LABEL,
            anchorPosition: new THREE.Vector3(centerX, y, SIGN_ANCHOR_Z),
            mount,
            style: {
                ...SignStyles.Featured,
                width: 3.0,
                height: 0.5,
            },
        })
    }

    public dispose(): void {
        this.signSystem.dispose()
    }
}