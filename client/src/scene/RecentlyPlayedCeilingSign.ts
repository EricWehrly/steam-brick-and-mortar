/**
 * RecentlyPlayedCeilingSign
 *
 * Places a single "Recently Played" sign hanging from the ceiling near the
 * front of the store. The sign uses the SceneSignManager ceiling mount style.
 *
 * Phase 1: flat above-shelf geometry at ceiling height (visible, not yet a
 * true hanging cable-and-bracket sign � that is a future visual pass).
 * Tech debt: docs/roadmaps/tech-debt.md -> "Ceiling sign visual pass"
 */

import * as THREE from 'three'
import { SceneSignManager, type SignMount } from './SceneSignManager'
import { RoomConstants } from './RoomManager'

export const RECENTLY_PLAYED_SIGN_UNIQUE_IDENTIFIER = 'Recently Played'

/** Z-position (depth into store) where the sign is anchored. 0 = entrance. */
// Z midpoint between first arc row (r=5, z=-5) and second (r=7.8, z=-7.8) at centre angle
const SIGN_ANCHOR_Z = -6.4

/**
 * Drop from ceiling � how far below ceiling surface the sign centre sits.
 * Enough to be clearly readable when standing at the entrance.
 */
const SIGN_DROP_FROM_CEILING = 0.5

export class RecentlyPlayedCeilingSign {
    private get signSystem(): SceneSignManager {
        return SceneSignManager.instance
    }

    private readonly position: THREE.Vector3 = new THREE.Vector3(0, RoomConstants.STORE_CEILING_HEIGHT - SIGN_DROP_FROM_CEILING, SIGN_ANCHOR_Z)

    constructor() {
        // SceneSignManager is a singleton - no local instance needed
    }

    /** Get the position of the sign. Caller must clone if mutation is needed. */
    public getPosition(): THREE.Vector3 {
        return this.position
    }

    /** Place (or replace) the Recently Played ceiling sign. */
    public place(centerX = 0): void {
        const y = RoomConstants.STORE_CEILING_HEIGHT - SIGN_DROP_FROM_CEILING
        this.position.set(centerX, y, SIGN_ANCHOR_Z)

        const mount: SignMount = {
            style: 'ceiling',
            signFacingY: 0,
        }

        this.signSystem.placeSign('ceiling', {
            uniqueIdentifier: RECENTLY_PLAYED_SIGN_UNIQUE_IDENTIFIER,
            anchorPosition: this.position,
            mount,
            // Blue text on gold — matches the store theme direction.
            // TD: align with UI design tokens once store theme is finalised
            //     docs/roadmaps/tech-debt.md -> "UI design tokens"
            style: {
                backgroundColor: 0xd4a017, // gold
                textColor: 0x003087,       // deep blue
                fontSize: 0.30,
                padding: '0.15 0.28',
            },
        })
    }

    public dispose(): void {
        // Shared SceneSignManager.instance - not disposed here; owner is responsible
    }
}