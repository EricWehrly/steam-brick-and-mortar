export const InputAction = {
    MoveForward: 'move-forward',
    MoveBack: 'move-back',
    MoveLeft: 'move-left',
    MoveRight: 'move-right',
    MoveUp: 'move-up',
    MoveDown: 'move-down',
    LookHorizontal: 'look-horizontal',
    LookVertical: 'look-vertical',
    RollLeft: 'roll-left',
    RollRight: 'roll-right',
    ResetCamera: 'reset-camera',
    Sprint: 'sprint',
    Interact: 'interact',
    OpenMenu: 'open-menu'
} as const

export type InputActionId = typeof InputAction[keyof typeof InputAction]

export const InputActionType = {
    Axis: 'axis',
    Button: 'button'
} as const

export type InputActionTypeValue = typeof InputActionType[keyof typeof InputActionType]

export const InputContext = {
    Scene: 'scene',
    UI: 'ui',
    Global: 'global'
} as const

export type InputContextValue = typeof InputContext[keyof typeof InputContext]

export interface InputActionDefinition {
    id: InputActionId
    label: string
    type: InputActionTypeValue
    context: InputContextValue
}

export const INPUT_ACTION_DEFINITIONS: ReadonlyArray<InputActionDefinition> = [
    { id: InputAction.MoveForward, label: 'Move Forward', type: InputActionType.Axis, context: InputContext.Scene },
    { id: InputAction.MoveBack, label: 'Move Back', type: InputActionType.Axis, context: InputContext.Scene },
    { id: InputAction.MoveLeft, label: 'Move Left', type: InputActionType.Axis, context: InputContext.Scene },
    { id: InputAction.MoveRight, label: 'Move Right', type: InputActionType.Axis, context: InputContext.Scene },
    { id: InputAction.MoveUp, label: 'Move Up', type: InputActionType.Axis, context: InputContext.Scene },
    { id: InputAction.MoveDown, label: 'Move Down', type: InputActionType.Axis, context: InputContext.Scene },
    { id: InputAction.LookHorizontal, label: 'Look Horizontal', type: InputActionType.Axis, context: InputContext.Scene },
    { id: InputAction.LookVertical, label: 'Look Vertical', type: InputActionType.Axis, context: InputContext.Scene },
    { id: InputAction.RollLeft, label: 'Roll Left', type: InputActionType.Button, context: InputContext.Scene },
    { id: InputAction.RollRight, label: 'Roll Right', type: InputActionType.Button, context: InputContext.Scene },
    { id: InputAction.ResetCamera, label: 'Reset Camera View', type: InputActionType.Button, context: InputContext.Scene },
    { id: InputAction.Sprint, label: 'Sprint', type: InputActionType.Button, context: InputContext.Scene },
    { id: InputAction.Interact, label: 'Interact', type: InputActionType.Button, context: InputContext.Scene },
    { id: InputAction.OpenMenu, label: 'Open Menu', type: InputActionType.Button, context: InputContext.Global }
]

export const INPUT_ACTION_ORDER = INPUT_ACTION_DEFINITIONS.map(action => action.id)

export function getInputActionDefinition(actionId: InputActionId): InputActionDefinition {
    const found = INPUT_ACTION_DEFINITIONS.find(action => action.id === actionId)
    if (!found) {
        throw new Error(`Unknown input action: ${actionId}`)
    }
    return found
}
