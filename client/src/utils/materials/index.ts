export type { MaterialOptions, TextureLoadOptions } from './MaterialBase'
export { BaseMaterialGenerator } from './BaseMaterialGenerator'
export { TextureLoader } from './TextureLoader'

export { 
  WoodMaterialGenerator,
  type WoodMaterialOptions,
  type SimpleWoodMaterialOptions,
  type ProceduralWoodMaterialOptions,
  type EnhancedProceduralWoodMaterialOptions,
  type MDFVeneerMaterialOptions,
  type ShelfInteriorMaterialOptions,
  type BrandAccentMaterialOptions
} from './WoodMaterialGenerator'

export { 
  CarpetMaterialGenerator,
  type CarpetMaterialOptions,
  type ProceduralCarpetMaterialOptions,
  type EnhancedProceduralCarpetMaterialOptions
} from './CarpetMaterialGenerator'

export { 
  CeilingMaterialGenerator,
  type CeilingMaterialOptions,
  type ProceduralCeilingMaterialOptions,
  type EnhancedProceduralCeilingMaterialOptions
} from './CeilingMaterialGenerator'
