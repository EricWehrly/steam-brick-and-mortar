/**
 * Test-only DI utilities.
 *
 * Runtime no longer uses core/di artifacts; keep a lightweight container + keys
 * here for tests that still benefit from mock registration helpers.
 */

export type ServiceFactory<T> = (container: TestServiceContainer) => T | Promise<T>
export type ServiceKey<T> = string | symbol | (new (...args: any[]) => T)

export enum ServiceLifetime {
  Singleton = 'singleton',
  Transient = 'transient',
  Scoped = 'scoped'
}

export interface ServiceRegistration<T> {
  factory: ServiceFactory<T>
  lifetime: ServiceLifetime
  instance?: T
  dependencies?: ServiceKey<any>[]
}

export const ServiceKeys = {
  // Core
  AppConfig: Symbol('AppConfig'),
  EventManager: Symbol('EventManager'),
  DataManager: Symbol('DataManager'),
  AppSettings: Symbol('AppSettings'),
  SharedMaterialManager: Symbol('SharedMaterialManager'),

  // Scene
  SceneManager: Symbol('SceneManager'),
  SceneCoordinator: Symbol('SceneCoordinator'),

  // Common test keys used in helpers/docs
  SteamIntegration: Symbol('SteamIntegration'),
  LightingManager: Symbol('LightingManager'),
  ProceduralTextures: Symbol('ProceduralTextures'),
} as const

export type ServiceKeyType<T> = symbol | (new (...args: any[]) => T)

export class TestServiceContainer {
  private services = new Map<ServiceKey<any>, ServiceRegistration<any>>()
  private resolutionPath: ServiceKey<any>[] = []
  private initialized = false

  public register<T>(
    key: ServiceKey<T>,
    factory: ServiceFactory<T>,
    lifetime: ServiceLifetime = ServiceLifetime.Singleton,
    dependencies: ServiceKey<any>[] = []
  ): this {
    if (this.initialized) {
      throw new Error(`Cannot register service after container initialization: ${String(key)}`)
    }

    this.services.set(key, {
      factory,
      lifetime,
      dependencies,
    })

    return this
  }

  public registerSingleton<T>(
    key: ServiceKey<T>,
    factory: ServiceFactory<T>,
    dependencies: ServiceKey<any>[] = []
  ): this {
    return this.register(key, factory, ServiceLifetime.Singleton, dependencies)
  }

  public registerTransient<T>(
    key: ServiceKey<T>,
    factory: ServiceFactory<T>,
    dependencies: ServiceKey<any>[] = []
  ): this {
    return this.register(key, factory, ServiceLifetime.Transient, dependencies)
  }

  public registerInstance<T>(key: ServiceKey<T>, instance: T): this {
    if (this.initialized) {
      throw new Error(`Cannot register instance after container initialization: ${String(key)}`)
    }

    this.services.set(key, {
      factory: () => instance,
      lifetime: ServiceLifetime.Singleton,
      instance,
      dependencies: []
    })

    return this
  }

  public async resolve<T>(key: ServiceKey<T>): Promise<T> {
    const registration = this.services.get(key)

    if (!registration) {
      throw new Error(`Service not registered: ${String(key)}`)
    }

    if (this.resolutionPath.includes(key)) {
      const cycle = [...this.resolutionPath, key].map(k => String(k)).join(' → ')
      throw new Error(`Circular dependency detected: ${cycle}`)
    }

    if (registration.lifetime === ServiceLifetime.Singleton && registration.instance !== undefined) {
      return registration.instance
    }

    this.resolutionPath.push(key)

    try {
      if (registration.dependencies && registration.dependencies.length > 0) {
        await Promise.all(registration.dependencies.map(dep => this.resolve(dep)))
      }

      const instance = await registration.factory(this)

      if (registration.lifetime === ServiceLifetime.Singleton) {
        registration.instance = instance
      }

      return instance
    } finally {
      this.resolutionPath = this.resolutionPath.filter(k => k !== key)
    }
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return

    const singletonServices = Array.from(this.services.entries())
      .filter(([, reg]) => reg.lifetime === ServiceLifetime.Singleton)

    for (const [key] of singletonServices) {
      await this.resolve(key)
    }

    this.initialized = true
  }

  public async dispose(): Promise<void> {
    const instances = Array.from(this.services.values())
      .map(reg => reg.instance)
      .filter(Boolean)

    for (const instance of instances) {
      if (instance && typeof (instance as any).dispose === 'function') {
        try {
          await (instance as any).dispose()
        } catch {
          // Best effort in tests
        }
      }
    }

    this.services.clear()
    this.resolutionPath = []
    this.initialized = false
  }
}

// Backward-compat alias for tests still importing { ServiceContainer }
export { TestServiceContainer as ServiceContainer }

