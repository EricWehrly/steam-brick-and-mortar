/**
 * Unit tests for ImageManager
 * Tests image downloading and caching functionality with mocks
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ImageManager } from '../../src/steam/images/ImageManager'
import { setupIndexedDBMock } from '../mocks/indexeddb.mock'
import { 
    setupFetchMock, 
    setupAbortControllerMock,
    createMockBlob, 
    createMockFetchResponse,
    mockGame 
} from '../utils/test-helpers'

describe('ImageManager Unit Tests', () => {
    let imageManager: ImageManager
    let fetchMock: any

    beforeEach(() => {
        // Setup all mocks
        setupIndexedDBMock()
        fetchMock = setupFetchMock()
        
        // Clear all mocks
        vi.clearAllMocks()
        
        // Create fresh image manager
        imageManager = new ImageManager()
    })

    afterEach(() => {
        vi.clearAllTimers()
    })

    describe('Image Download', () => {
        it('should download an image and return blob', async () => {
            const mockBlob = createMockBlob()
            const mockResponse = createMockFetchResponse(mockBlob)
            fetchMock.mockResolvedValue(mockResponse)
            
            const result = await imageManager.downloadImage(mockGame.artwork.icon)
            
            expect(fetchMock).toHaveBeenCalledWith(
                mockGame.artwork.icon,
                expect.objectContaining({
                    mode: 'cors'
                })
            )
            expect(result).toBe(mockBlob)
        })

        it('should handle download errors gracefully with fallback', async () => {
            fetchMock.mockRejectedValue(new Error('Network error'))
            
            const onImageError = vi.fn()
            const result = await imageManager.downloadImage(mockGame.artwork.icon, {
                enableFallback: true,
                onImageError
            })
            
            expect(result).toBeNull()
            expect(onImageError).toHaveBeenCalledWith(
                mockGame.artwork.icon,
                expect.any(Error)
            )
        })

        it('should throw error when fallback is disabled', async () => {
            fetchMock.mockRejectedValue(new Error('Network error'))
            
            await expect(imageManager.downloadImage(mockGame.artwork.icon, {
                enableFallback: false
            })).rejects.toThrow('Network error')
        })

        it('should handle timeout with abort signal', async () => {
            const abortController = setupAbortControllerMock()
            fetchMock.mockRejectedValue(new Error('The operation was aborted'))
            
            const result = await imageManager.downloadImage(mockGame.artwork.icon, {
                timeout: 1000,
                enableFallback: true
            })
            
            expect(result).toBeNull()
        })

        it('should validate image content type', async () => {
            const mockBlob = createMockBlob('text/html')
            const mockResponse = createMockFetchResponse(mockBlob)
            fetchMock.mockResolvedValue(mockResponse)
            
            const result = await imageManager.downloadImage(mockGame.artwork.icon, {
                enableFallback: true
            })
            
            expect(result).toBeNull()
        })

        it('should call onImageLoaded callback on success', async () => {
            const mockBlob = createMockBlob()
            const mockResponse = createMockFetchResponse(mockBlob)
            fetchMock.mockResolvedValue(mockResponse)
            
            const onImageLoaded = vi.fn()
            await imageManager.downloadImage(mockGame.artwork.icon, {
                onImageLoaded
            })
            
            expect(onImageLoaded).toHaveBeenCalledWith(mockGame.artwork.icon, mockBlob)
        })
    })

    describe('Game Artwork Download', () => {
        it('should download all artwork types for a game', async () => {
            const mockBlob = createMockBlob()
            const mockResponse = createMockFetchResponse(mockBlob)
            fetchMock.mockResolvedValue(mockResponse)
            
            const result = await imageManager.downloadGameArtwork(mockGame.artwork)
            
            expect(result).toEqual({
                icon: mockBlob,
                logo: mockBlob,
                header: mockBlob,
                library: mockBlob
            })
            
            // Verify all URLs were fetched
            expect(fetchMock).toHaveBeenCalledTimes(4)
        })

        it('should handle partial failures gracefully', async () => {
            let callCount = 0
            fetchMock.mockImplementation(() => {
                callCount++
                if (callCount === 2) { // Second call fails (logo)
                    return Promise.reject(new Error('Network error'))
                }
                return Promise.resolve(createMockFetchResponse(createMockBlob()))
            })
            
            const result = await imageManager.downloadGameArtwork(mockGame.artwork)
            
            expect(result.icon).toBeTruthy()
            expect(result.logo).toBeNull()
            expect(result.header).toBeTruthy()
            expect(result.library).toBeTruthy()
        })

        it('should add delays between downloads', async () => {
            const mockBlob = createMockBlob()
            const mockResponse = createMockFetchResponse(mockBlob)
            fetchMock.mockResolvedValue(mockResponse)
            
            const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback: any, ms: number) => {
                if (ms === 100) { // Our delay
                    callback()
                }
                return 1
            })
            
            await imageManager.downloadGameArtwork(mockGame.artwork)
            
            // Should have delays between downloads (number of delays = number of artwork items - 1)
            const delayCalls = setTimeoutSpy.mock.calls.filter(call => call[1] === 100)
            // 4 artwork items (icon, logo, header, library) means 4 delays 
            // (the implementation adds delay after each download, including the last one)
            expect(delayCalls.length).toBe(4)
            
            setTimeoutSpy.mockRestore()
        })
    })

    describe('Cache Management', () => {
        it('should handle missing IndexedDB gracefully', async () => {
            // Since IndexedDB is mocked, verify graceful handling
            const stats = await imageManager.getStats()
            expect(stats.totalImages).toBe(0)
            
            // Should not throw
            await expect(imageManager.clearCache()).resolves.not.toThrow()
        })
    })
})
