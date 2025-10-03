/**
 * Public API for Centralized Data Management System
 * 
 * Exports the main DataManager class and all type definitions
 * for clean imports throughout the application.
 */

export { DataManager } from './DataManager'
export { DataDomain } from './DataTypes'
export type { 
    DataMetadata, 
    DataEntry, 
    DataProvider, 
    DataManagerConfig, 
    DataChangeEvent 
} from './DataTypes'