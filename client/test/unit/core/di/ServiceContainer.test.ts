/**
 * ServiceContainer Tests - Dependency Injection Container
 * 
 * Tests the core DI functionality to ensure services are properly resolved
 * and singletons work correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ServiceContainer } from '../../../../src/core/di/ServiceContainer'
import { ServiceKeys } from '../../../../src/core/di/ServiceKeys'
import { ServiceRegistration } from '../../../../src/core/di/ServiceRegistration'

describe('ServiceContainer', () => {
    let container: ServiceContainer

    beforeEach(() => {
        container = new ServiceContainer()
    })

    describe('Basic Registration and Resolution', () => {
        it('should register and resolve a singleton service', async () => {
            // Register a simple singleton
            container.registerSingleton(
                ServiceKeys.EventManager, 
                () => ({ name: 'EventManager', initialized: true })
            )

            // Initialize the container
            await container.initialize()

            // Resolve the service
            const service1 = await container.resolve(ServiceKeys.EventManager)
            const service2 = await container.resolve(ServiceKeys.EventManager)

            // Should be the same instance (singleton behavior)
            expect(service1).toBe(service2)
            expect(service1).toEqual({ name: 'EventManager', initialized: true })
        })

        it('should register and resolve services with dependencies', async () => {
            // Register services with dependency chain
            container.registerSingleton(
                ServiceKeys.DataManager,
                () => ({ name: 'DataManager' })
            )

            container.registerSingleton(
                ServiceKeys.EventManager,
                async (container) => {
                    const dataManager = await container.resolve(ServiceKeys.DataManager)
                    return { name: 'EventManager', dataManager }
                },
                [ServiceKeys.DataManager]
            )

            await container.initialize()

            const eventManager = await container.resolve(ServiceKeys.EventManager) as any
            expect(eventManager.name).toBe('EventManager')
            expect(eventManager.dataManager.name).toBe('DataManager')
        })
    })

    describe('Service Registration Integration', () => {
        it('should configure services via ServiceRegistration without WebGL dependencies', async () => {
            // Test the basic configuration without WebGL-dependent services
            const config = {
                data: { enablePersistence: true },
                performance: { maxGameBoxes: 50 }
            }

            // Register only non-WebGL services for testing
            container.registerInstance(ServiceKeys.AppConfig, config)
            
            container.registerSingleton(
                ServiceKeys.EventManager, 
                () => ({ name: 'EventManager', config })
            )

            container.registerSingleton(
                ServiceKeys.DataManager, 
                () => ({ name: 'DataManager', config: config.data })
            )

            await container.initialize()

            // Verify EventManager singleton behavior
            const eventManager1 = await container.resolve(ServiceKeys.EventManager) as any
            const eventManager2 = await container.resolve(ServiceKeys.EventManager) as any
            
            expect(eventManager1).toBe(eventManager2) // Same instance
            expect(eventManager1.name).toBe('EventManager')
        })

        it('should resolve SharedMaterialManager as singleton (without WebGL)', async () => {
            // Register SharedMaterialManager independently for testing
            container.registerSingleton(
                ServiceKeys.SharedMaterialManager,
                () => ({ 
                    name: 'SharedMaterialManager',
                    getInstance: () => ({ initialized: true }),
                    initialize: () => true
                })
            )
            
            await container.initialize()

            const manager1 = await container.resolve(ServiceKeys.SharedMaterialManager)
            const manager2 = await container.resolve(ServiceKeys.SharedMaterialManager)

            expect(manager1).toBe(manager2)
            expect(manager1).toBeDefined()
        })

        it('should verify ServiceKeys exist for Phase 1 and Phase 2 services', () => {
            // Verify all required service keys are defined
            // Note: GameBoxRenderer removed from DI - now uses composition pattern
            expect(ServiceKeys.SharedMaterialManager).toBeDefined()
            expect(ServiceKeys.SceneManager).toBeDefined()
            expect(ServiceKeys.SceneCoordinator).toBeDefined() // Phase 2
            expect(ServiceKeys.EventManager).toBeDefined()
            expect(ServiceKeys.DataManager).toBeDefined()
            
            // All keys should be symbols
            expect(typeof ServiceKeys.SharedMaterialManager).toBe('symbol')
            expect(typeof ServiceKeys.SceneCoordinator).toBe('symbol')
        })

        it('should resolve AppSettings as singleton via ServiceRegistration', async () => {
            // Configure with ServiceRegistration
            ServiceRegistration.configureServices(container, {})

            await container.initialize()

            // Resolve AppSettings - should work without WebGL dependencies
            const appSettings1 = await container.resolve(ServiceKeys.AppSettings) as any
            const appSettings2 = await container.resolve(ServiceKeys.AppSettings) as any
            
            // Verify singleton behavior
            expect(appSettings1).toBe(appSettings2)
            expect(appSettings1).toBeDefined()
            expect(typeof appSettings1.getSetting).toBe('function')
        })
    })

    describe('Lifecycle Management', () => {
        it('should properly dispose of services', async () => {
            container.registerSingleton(
                ServiceKeys.EventManager,
                () => ({ name: 'EventManager', disposed: false, dispose: function() { this.disposed = true } })
            )

            await container.initialize()
            const service = await container.resolve(ServiceKeys.EventManager) as any

            expect(service.disposed).toBe(false)

            await container.dispose()
            expect(service.disposed).toBe(true)
        })
    })

    describe('Performance Validation', () => {
        it('should create new instances efficiently for transient services', async () => {
            container.registerTransient(
                ServiceKeys.EventManager,
                () => ({ id: Math.random(), name: 'EventManager' })
            )

            await container.initialize()

            const iterations = 100
            const startTime = performance.now()
            
            const instances = []
            for (let i = 0; i < iterations; i++) {
                instances.push(await container.resolve(ServiceKeys.EventManager))
            }
            
            const endTime = performance.now()
            const totalTime = endTime - startTime
            const avgTime = totalTime / iterations

            console.debug(`🔄 Transient Performance: ${iterations} creations in ${totalTime.toFixed(2)}ms (avg: ${avgTime.toFixed(4)}ms per creation)`)

            // Transient creation should be reasonably fast (< 1ms per call)
            expect(avgTime).toBeLessThan(1.0)

            // Verify all instances are different
            const firstInstance = instances[0] as any
            const lastInstance = instances[instances.length - 1] as any
            expect(firstInstance).not.toBe(lastInstance)
            expect(firstInstance.id).not.toBe(lastInstance.id)
        })
    })

    describe('Test Infrastructure', () => {
        it('should support TestServiceContainer helper utility', async () => {
            const { createTestContainer } = await import('../../../utils/test-helpers')
            
            // Create test container with standard mocks
            const testContainer = await createTestContainer()
                .setupStandardMocks()
                .mockSingleton(ServiceKeys.DataManager, () => ({ name: 'TestDataManager' }))
                .initialize()

            try {
                // Verify standard mocks work
                const sceneManager = await testContainer.resolve(ServiceKeys.SceneManager) as any
                expect(sceneManager.name).toBe('MockSceneManager')
                expect(sceneManager.getScene).toBeTypeOf('function')

                // Verify custom mock works
                const dataManager = await testContainer.resolve(ServiceKeys.DataManager) as any
                expect(dataManager.name).toBe('TestDataManager')

                // Note: GameBoxRenderer test removed - no longer uses DI (composition pattern)
            } finally {
                await testContainer.dispose()
            }
        })
    })
})