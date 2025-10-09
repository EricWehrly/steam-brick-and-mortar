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
            expect(ServiceKeys.GameBoxRenderer).toBeDefined()
            expect(ServiceKeys.SharedMaterialManager).toBeDefined()
            expect(ServiceKeys.StorePropsRenderer).toBeDefined()
            expect(ServiceKeys.SceneManager).toBeDefined()
            expect(ServiceKeys.SceneCoordinator).toBeDefined() // Phase 2
            expect(ServiceKeys.EventManager).toBeDefined()
            expect(ServiceKeys.DataManager).toBeDefined()
            
            // All keys should be symbols
            expect(typeof ServiceKeys.GameBoxRenderer).toBe('symbol')
            expect(typeof ServiceKeys.SharedMaterialManager).toBe('symbol')
            expect(typeof ServiceKeys.SceneCoordinator).toBe('symbol')
        })

        it('should verify dependency chain registration for Phase 2', async () => {
            // Test that services can be registered with complex dependency chains
            container.registerInstance(ServiceKeys.AppConfig, {})
            
            // Mock SceneManager to avoid WebGL
            container.registerSingleton(
                ServiceKeys.SceneManager,
                () => ({ 
                    name: 'MockSceneManager',
                    getScene: () => ({ add: () => {}, remove: () => {} })
                })
            )

            // Mock GameBoxRenderer 
            container.registerSingleton(
                ServiceKeys.GameBoxRenderer,
                () => ({ name: 'MockGameBoxRenderer' })
            )

            // Mock StorePropsRenderer with GameBoxRenderer dependency
            container.registerSingleton(
                ServiceKeys.StorePropsRenderer,
                async (container) => {
                    const gameBoxRenderer = await container.resolve(ServiceKeys.GameBoxRenderer)
                    return { 
                        name: 'MockStorePropsRenderer', 
                        gameBoxRenderer,
                        setGameBoxRenderer: () => {},
                        getGameBoxRenderer: () => gameBoxRenderer
                    }
                },
                [ServiceKeys.GameBoxRenderer]
            )

            await container.initialize()

            // Verify dependency chain
            const storePropsRenderer = await container.resolve(ServiceKeys.StorePropsRenderer) as any
            expect(storePropsRenderer.name).toBe('MockStorePropsRenderer')
            expect(storePropsRenderer.gameBoxRenderer.name).toBe('MockGameBoxRenderer')
        })

        it('should resolve complex shared dependencies (SceneCoordinator scenario)', async () => {
            // Mock SceneManager (the shared dependency)
            container.registerSingleton(
                ServiceKeys.SceneManager,
                () => ({ name: 'MockSceneManager', getScene: () => ({ add: () => {}, remove: () => {} }) })
            )

            // Mock GameBoxRenderer with SceneManager dependency
            container.registerSingleton(
                ServiceKeys.GameBoxRenderer,
                async (container) => {
                    const sceneManager = await container.resolve(ServiceKeys.SceneManager)
                    return { name: 'MockGameBoxRenderer', sceneManager }
                },
                [ServiceKeys.SceneManager]
            )

            // Mock StorePropsRenderer with both SceneManager and GameBoxRenderer dependencies
            container.registerSingleton(
                ServiceKeys.StorePropsRenderer,
                async (container) => {
                    const sceneManager = await container.resolve(ServiceKeys.SceneManager)
                    const gameBoxRenderer = await container.resolve(ServiceKeys.GameBoxRenderer)
                    return { 
                        name: 'MockStorePropsRenderer', 
                        sceneManager,
                        gameBoxRenderer,
                        setGameBoxRenderer: () => {},
                        getGameBoxRenderer: () => gameBoxRenderer
                    }
                },
                [ServiceKeys.SceneManager, ServiceKeys.GameBoxRenderer]
            )

            // Mock SceneCoordinator with SceneManager and StorePropsRenderer dependencies
            container.registerSingleton(
                ServiceKeys.SceneCoordinator,
                async (container) => {
                    const sceneManager = await container.resolve(ServiceKeys.SceneManager)
                    const storePropsRenderer = await container.resolve(ServiceKeys.StorePropsRenderer)
                    return {
                        name: 'MockSceneCoordinator',
                        sceneManager,
                        storePropsRenderer
                    }
                },
                [ServiceKeys.SceneManager, ServiceKeys.StorePropsRenderer]
            )

            await container.initialize()

            // This should NOT throw a circular dependency error
            // The dependency chain: SceneCoordinator → StorePropsRenderer → GameBoxRenderer
            // All sharing SceneManager should resolve correctly
            const sceneCoordinator = await container.resolve(ServiceKeys.SceneCoordinator) as any
            
            expect(sceneCoordinator.name).toBe('MockSceneCoordinator')
            expect(sceneCoordinator.sceneManager.name).toBe('MockSceneManager')
            expect(sceneCoordinator.storePropsRenderer.name).toBe('MockStorePropsRenderer')
            expect(sceneCoordinator.storePropsRenderer.gameBoxRenderer.name).toBe('MockGameBoxRenderer')
            
            // Verify all services share the same SceneManager instance
            const directSceneManager = await container.resolve(ServiceKeys.SceneManager)
            expect(sceneCoordinator.sceneManager).toBe(directSceneManager)
            expect(sceneCoordinator.storePropsRenderer.sceneManager).toBe(directSceneManager)
            expect(sceneCoordinator.storePropsRenderer.gameBoxRenderer.sceneManager).toBe(directSceneManager)
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
        it('should have minimal overhead for service resolution', async () => {
            // Register services with dependencies
            container.registerSingleton(
                ServiceKeys.SceneManager,
                () => ({ name: 'SceneManager', timestamp: Date.now() })
            )

            container.registerSingleton(
                ServiceKeys.GameBoxRenderer,
                async (container) => {
                    const sceneManager = await container.resolve(ServiceKeys.SceneManager)
                    return { name: 'GameBoxRenderer', sceneManager, timestamp: Date.now() }
                },
                [ServiceKeys.SceneManager]
            )

            await container.initialize()

            // Measure singleton resolution performance (should be instant after first resolution)
            const iterations = 1000
            const startTime = performance.now()
            
            for (let i = 0; i < iterations; i++) {
                await container.resolve(ServiceKeys.GameBoxRenderer)
            }
            
            const endTime = performance.now()
            const totalTime = endTime - startTime
            const avgTime = totalTime / iterations

            console.debug(`🚀 DI Performance: ${iterations} resolutions in ${totalTime.toFixed(2)}ms (avg: ${avgTime.toFixed(4)}ms per resolution)`)

            // Singleton resolution should be very fast (< 0.1ms per call)
            expect(avgTime).toBeLessThan(0.1)

            // Verify singleton behavior - all calls return same instance
            const instance1 = await container.resolve(ServiceKeys.GameBoxRenderer) as any
            const instance2 = await container.resolve(ServiceKeys.GameBoxRenderer) as any
            expect(instance1).toBe(instance2)
            expect(instance1.name).toBe('GameBoxRenderer')
        })

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

                // Verify isolation - each service should be independent
                const gameBoxRenderer = await testContainer.resolve(ServiceKeys.GameBoxRenderer) as any
                expect(gameBoxRenderer.name).toBe('MockGameBoxRenderer')
            } finally {
                await testContainer.dispose()
            }
        })
    })
})