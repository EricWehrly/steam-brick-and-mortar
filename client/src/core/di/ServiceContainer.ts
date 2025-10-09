/**
 * ServiceContainer - Lightweight Dependency Injection Container
 * 
 * Provides type-safe dependency injection for the Steam Brick and Mortar application.
 * Designed to work with our WebXR-first architecture and existing component patterns.
 */

export type ServiceFactory<T> = (container: ServiceContainer) => T | Promise<T>
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

export class ServiceContainer {
  private services = new Map<ServiceKey<any>, ServiceRegistration<any>>()
  private resolving = new Set<ServiceKey<any>>()
  private initialized = false

  /**
   * Register a service with the container
   */
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
      dependencies
    })
    return this
  }

  /**
   * Register a singleton service (convenience method)
   */
  public registerSingleton<T>(
    key: ServiceKey<T>, 
    factory: ServiceFactory<T>,
    dependencies: ServiceKey<any>[] = []
  ): this {
    return this.register(key, factory, ServiceLifetime.Singleton, dependencies)
  }

  /**
   * Register a transient service (convenience method)
   */
  public registerTransient<T>(
    key: ServiceKey<T>, 
    factory: ServiceFactory<T>,
    dependencies: ServiceKey<any>[] = []
  ): this {
    return this.register(key, factory, ServiceLifetime.Transient, dependencies)
  }

  /**
   * Register an existing instance as singleton
   */
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

  /**
   * Resolve a service by key
   */
  public async resolve<T>(key: ServiceKey<T>): Promise<T> {
    if (!this.initialized) {
      throw new Error('Container must be initialized before resolving services')
    }

    // Check for circular dependencies
    if (this.resolving.has(key)) {
      throw new Error(`Circular dependency detected: ${String(key)}`)
    }

    const registration = this.services.get(key)
    if (!registration) {
      throw new Error(`Service not registered: ${String(key)}`)
    }

    // Return existing singleton instance
    if (registration.lifetime === ServiceLifetime.Singleton && registration.instance) {
      return registration.instance
    }

    // Mark as resolving to detect circular dependencies
    this.resolving.add(key)

    try {
      // Resolve dependencies first
      const resolvedDependencies = await Promise.all(
        registration.dependencies.map(dep => this.resolve(dep))
      )

      // Create the service instance
      const instance = await registration.factory(this)

      // Store singleton instance
      if (registration.lifetime === ServiceLifetime.Singleton) {
        registration.instance = instance
      }

      return instance
    } finally {
      this.resolving.delete(key)
    }
  }

  /**
   * Initialize the container (locks registration, enables resolution)
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.initialized = true
    console.debug('🔧 ServiceContainer initialized')
  }

  /**
   * Get a service synchronously (for already resolved singletons)
   */
  public get<T>(key: ServiceKey<T>): T {
    const registration = this.services.get(key)
    if (!registration?.instance) {
      throw new Error(`Service not available synchronously: ${String(key)}. Use resolve() for async resolution.`)
    }
    return registration.instance
  }

  /**
   * Check if a service is registered
   */
  public has(key: ServiceKey<any>): boolean {
    return this.services.has(key)
  }

  /**
   * Dispose all services in reverse dependency order
   */
  public async dispose(): Promise<void> {
    const disposableServices: Array<{ instance: any, key: ServiceKey<any> }> = []

    // Collect all singleton instances that have dispose methods
    for (const [key, registration] of this.services) {
      if (registration.instance && typeof registration.instance.dispose === 'function') {
        disposableServices.push({ instance: registration.instance, key })
      }
    }

    // Dispose in reverse order (last registered first)
    for (let i = disposableServices.length - 1; i >= 0; i--) {
      const { instance, key } = disposableServices[i]
      try {
        await instance.dispose()
        console.debug(`🧹 Disposed service: ${String(key)}`)
      } catch (error) {
        console.error(`Failed to dispose service ${String(key)}:`, error)
      }
    }

    this.services.clear()
    this.resolving.clear()
    this.initialized = false
  }
}