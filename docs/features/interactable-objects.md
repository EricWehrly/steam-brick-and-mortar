# Feature: Interactable Scene Objects

**Act**: 2 (prerequisite for TV button, prop triggers, any non-game-box clickable)
**Status**: Not started — layer infrastructure exists; dispatch gap is the work
**Priority**: Medium (blocks friend-stream projection Tier 1, peripheral cutout button, future prop interactions)

## What exists today

`SceneLayers.ts` already defines `SceneLayer.Interactable = 1`, and
`SceneClickGameBoxRaycast` already masks its raycaster to that layer:

```typescript
this.raycaster.layers.mask = 1 << SceneLayer.Interactable
```
(user edit/note: the layer number should be a const or enum or something, so we can reference it nominally externally, and not have "magic numbers")

So any mesh assigned to `SceneLayer.Interactable` is already *detected* by the raycaster. The
problem: `resolveGameBoxIntersection` returns `null` for anything that isn't a game box, and that
null is silently dropped. Non-game-box hits are detected and discarded.

## The gap

`SceneClickGameBoxRaycast.resolveGameBoxIntersection` only dispatches for:
1. Instanced meshes resolved through `GameFinder` (game box artwork/labels)
2. Objects with `userData.isGameBox === true`

Everything else on the Interactable layer is hit but produces no event.

## Design

**`userData` convention for interactable props:**
```typescript
mesh.userData.isInteractable = true
mesh.userData.interactionId = 'tv-screen-front'  // or any stable string id
mesh.layers.set(SceneLayer.Interactable)
```
(note: why isInteractable bool? wouldn't it be Redundant to layer?)
(note: here interactionId should again be an enum or something rather than raw string)

**Dispatch path** — extend `resolveGameBoxIntersection` with a fallthrough case:
```typescript
if (object.userData?.isInteractable && object.userData?.interactionId) {
    return { interactionId: object.userData.interactionId, point, distance, object }
}
```

Emit a `PropInteracted` event (new event type in `InteractionEvents.ts`) so prop owners can
subscribe without knowing about the raycaster:
```typescript
this.eventManager.emit<PropInteractedEvent>(InputEventTypes.PropInteracted, {
    interactionId: hit.interactionId,
    point: hit.point
})
```
(note: should include the prop that was interacted with so consumers don't need to do weird lookups / math on the point ...)
(like, if we have two TV's, how do we know which tv got pressed?)

Prop classes subscribe to `PropInteracted` and filter by their `interactionId`. No direct method
calls from the raycaster to the prop — consistent with the event-driven arch.

**VR:** the same event contract works for VR controller raycasting; the controller raycast emits
`SceneCanvasClick`-equivalent or `PropInteracted` directly. Layer filtering is unchanged.

**Game boxes are unaffected** — the game box path runs first (instanceId check, then isGameBox
check); the `isInteractable` fallthrough only fires for non-game-box objects.
(why? Why not just have gameboxes use the same prop event? why a separate path? they're a "special" prop, maybe, but they're still equivalently props in this case)

## What this unblocks

- TV monitor button → emit `PropInteracted` → `FriendStreamProjectionHandler` opens
  `getDisplayMedia` picker (see [Friend Stream Projection](friend-stream-projection.md))
- Peripheral cutout tap → detail overlay
- Future prop triggers (clock, concessions interactions, coming-attractions board)

## Stories / Tasks

- `InteractionEvents.ts` — add `PropInteracted` event type (`interactionId`, `point`)
- `SceneClickGameBoxRaycast` — add `isInteractable` fallthrough in `resolveGameBoxIntersection`;
  emit `PropInteracted`; rename class to `SceneInteractionRaycast` or add a sibling
- VR controller path — wire the same emit from VR controller raycast when ready
- Tests: prop on Interactable layer emits `PropInteracted`; game box still emits `GameSelected`;
  object not on layer is not hit

## Notes

- `resolveGameBoxIntersection` will need a return type union or separate method once the
  fallthrough case is added — don't force it to return a `SceneGameBoxHit` for prop hits.
- `SceneLayer.Interactable` is already reserved for this; don't add a new layer number.

## Related

- `src/scene/interaction/SceneClickGameBoxRaycast.ts` — current raycaster; extend or sibling here
- `src/scene/SceneLayers.ts` — layer constants; add if new layers ever needed
- `src/types/InteractionEvents.ts` — add `PropInteracted` event type here
- [Friend Stream Projection](friend-stream-projection.md) — first consumer of prop interaction
- [Fabricated Set Dressing](fabricated-set-dressing.md) — peripheral cutouts, coming-attractions

---
*— A1 / T1*
