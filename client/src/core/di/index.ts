/**
 * Dependency Injection Module
 * 
 * Exports all DI-related classes and types for clean imports throughout the application.
 */

export { ServiceContainer, ServiceLifetime } from './ServiceContainer'
export type { ServiceFactory, ServiceKey, ServiceRegistration as IServiceRegistration } from './ServiceContainer'

export { ServiceKeys } from './ServiceKeys'
export type { ServiceKeyType, ServiceKeyMap } from './ServiceKeys'

export { ServiceRegistration } from './ServiceRegistration'
export type { AppConfig } from './ServiceRegistration'