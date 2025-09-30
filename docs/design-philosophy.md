# Design Philosophy - Steam Brick and Mortar

## Core Principles

### Persistent UI Elements
**Principle**: For anything that remains in the player's vision all the time, strive to take up only as much screen space as necessary to convey the information.

**Rationale**: Persistent UI creates visual clutter and competes for attention with the primary content (the VR environment and game library). Minimizing persistent UI footprint improves immersion and usability.

**Tension**: This creates a balance challenge with accessibility - action buttons still need sufficient click targets and visual prominence to be usable.

**Implementation Guidelines**:
- Use concise, clear text on persistent buttons ("Load" vs "Load My Games")
- Avoid layout shifts during user interaction (anti-pattern: moving elements right before click)
- Prioritize functional clarity over verbose labeling in persistent elements
- Reserve larger, more prominent UI for temporary interactions or critical actions

### Interactive Element Stability
**Principle**: Never move interactive elements during or immediately before user interaction.

**Rationale**: Moving UI elements as users attempt to interact with them breaks the interaction flow and creates frustration. This is a fundamental UX anti-pattern.

**Examples of Anti-patterns**:
- Layout changes on input focus that shift button positions
- Hover states that move elements
- Dynamic content that relocates interactive targets

**Solutions**:
- Use fixed positioning for interactive elements during interaction states
- Design layouts that accommodate expanded states without movement
- Apply smooth transitions only to non-positional properties (colors, opacity, scale)

### WebXR-First Design
**Principle**: Design decisions should prioritize the VR experience while maintaining desktop usability.

**Rationale**: This is a WebXR application where VR is the primary use case. Desktop interaction should be functional but not drive design decisions that compromise VR UX.

**Implementation**:
- Minimize persistent UI that competes with immersive 3D content
- Design UI elements that work well in both 2D and 3D contexts  
- Prioritize spatial interaction patterns over traditional 2D interface paradigms

## Application to Steam Brick and Mortar

### Steam UI Panel
- Persistent presence requires minimal footprint
- Input expansion handled without button movement
- Clear, concise action labels ("Load" not "Load My Games")
- Responsive text expansion only where it doesn't affect interaction

### Settings and Controls
- Settings UI can be more expansive (temporary visibility)
- VR controls prioritized over desktop mouse/keyboard
- Help text appears contextually, not persistently

## Future Considerations

As the application grows, apply these principles to:
- Game selection interfaces
- VR menu systems  
- Loading and progress indicators
- Error states and notifications

---

*This philosophy emerges from real UX issues encountered during development and should guide future design decisions.*