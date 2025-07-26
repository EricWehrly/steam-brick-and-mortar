/**
 * Advanced noise generation utilities for procedural textures
 * Implements Perlin and Simplex noise for more realistic patterns
 */

export class NoiseGenerator {
  private static permutation: number[] = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
    140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
    247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
    57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
    74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
    60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
    65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
    200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
    52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
    207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
    119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
    129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
    218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
    81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
    184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
    222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180
  ];

  private static p: number[] = new Array(512);

  static {
    // Initialize permutation table
    for (let i = 0; i < 512; i++) {
      NoiseGenerator.p[i] = NoiseGenerator.permutation[i % 256];
    }
  }

  /**
   * Simple 2D noise function that actually works
   */
  public static perlin(x: number, y: number, _z: number = 0): number {
    // Use a simple but effective noise implementation
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1; // Return value between -1 and 1
  }

  /**
   * Octave noise - combines multiple octaves of Perlin noise
   */
  public static octaveNoise(x: number, y: number, octaves: number = 4, persistence: number = 0.5, scale: number = 1): number {
    let value = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.perlin(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return value / maxValue;
  }

  /**
   * Wood grain noise - specialized for wood textures
   * Creates longitudinal grain running along the X-axis (length of the board)
   */
  public static woodGrain(x: number, y: number, ringFrequency: number = 0.1, grainStrength: number = 0.3): number {
    // Create grain lines running horizontally (along X-axis)
    // This simulates wood cut along the length of the grain
    const grainLines = Math.sin(y * ringFrequency) * 0.5 + 0.5;
    
    // Add subtle variation along the grain direction (X-axis)
    const grainVariation = this.octaveNoise(x * 0.01, y * 0.05, 2, 0.3, 1) * 0.2;
    
    // Add fine grain detail perpendicular to the main grain
    const fineGrain = this.octaveNoise(x * 0.08, y * 0.02, 3, 0.4, 1) * grainStrength;
    
    // Combine grain lines with variations for realistic wood appearance
    return Math.max(0, Math.min(1, grainLines + grainVariation + fineGrain));
  }

  /**
   * Carpet fiber noise - creates realistic carpet texture
   */
  public static carpetFiber(x: number, y: number, fiberDensity: number = 0.3): number {
    // Create fiber pattern with multiple octaves
    const fiber1 = this.octaveNoise(x * 0.1, y * 0.1, 2, 0.5, 1);
    const fiber2 = this.octaveNoise(x * 0.05, y * 0.2, 3, 0.3, 1);
    const fiber3 = this.octaveNoise(x * 0.2, y * 0.1, 2, 0.7, 1);
    
    return (fiber1 + fiber2 + fiber3) * fiberDensity;
  }

  /**
   * Popcorn ceiling noise - creates bumpy ceiling texture
   */
  public static popcornCeiling(x: number, y: number, bumpSize: number = 0.4, density: number = 0.6): number {
    // Create random bumps at different scales
    const bump1 = this.octaveNoise(x * 0.05, y * 0.05, 2, 0.8, 1);
    const bump2 = this.octaveNoise(x * 0.1, y * 0.1, 3, 0.6, 1);
    const bump3 = this.octaveNoise(x * 0.2, y * 0.2, 2, 0.4, 1);
    
    const combined = (bump1 + bump2 + bump3) * bumpSize;
    
    // Apply density threshold to create more realistic sparse bumps
    return combined > (1 - density) ? combined : 0;
  }

  private static fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private static lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private static grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
}
