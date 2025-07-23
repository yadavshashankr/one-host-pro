// Storage Service - Handles IndexedDB and Local Storage
import { DB_NAME, DB_VERSION, STORE_NAME, MAX_RECENT_PEERS } from '../config/constants.js';

class StorageService {
    constructor() {
        this.db = null;
        this.isInitialized = false;
    }

    // Initialize IndexedDB
    async init() {
        if (this.isInitialized) return;

        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (event) => {
                console.error('IndexedDB initialization failed:', event.target.error);
                throw new Error('IndexedDB initialization failed');
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isInitialized = true;
                console.log('IndexedDB initialized successfully');
            };

            // Wait for the database to be ready
            await new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.isInitialized = true;
                    console.log('IndexedDB initialized successfully');
                    resolve();
                };
                request.onerror = (event) => {
                    console.error('IndexedDB initialization failed:', event.target.error);
                    reject(new Error('IndexedDB initialization failed'));
                };
            });

        } catch (error) {
            console.error('Storage initialization error:', error);
            throw error;
        }
    }

    // Save file to IndexedDB
    async saveFile(fileInfo) {
        if (!this.isInitialized) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(fileInfo);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Get file from IndexedDB
    async getFile(fileId) {
        if (!this.isInitialized) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(fileId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Get all files from IndexedDB
    async getAllFiles() {
        if (!this.isInitialized) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Delete file from IndexedDB
    async deleteFile(fileId) {
        if (!this.isInitialized) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(fileId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Clear all files from IndexedDB
    async clearAllFiles() {
        if (!this.isInitialized) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Local Storage Operations for Recent Peers
    loadRecentPeers() {
        try {
            const saved = localStorage.getItem('recentPeers');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('Error loading recent peers:', error);
            return [];
        }
    }

    saveRecentPeers(recentPeers) {
        try {
            localStorage.setItem('recentPeers', JSON.stringify(recentPeers));
        } catch (error) {
            console.error('Error saving recent peers:', error);
        }
    }

    addRecentPeer(recentPeers, peerId) {
        const existingIndex = recentPeers.indexOf(peerId);
        if (existingIndex !== -1) {
            recentPeers.splice(existingIndex, 1);
        }
        recentPeers.unshift(peerId);
        if (recentPeers.length > MAX_RECENT_PEERS) {
            recentPeers.pop();
        }
        this.saveRecentPeers(recentPeers);
        return recentPeers;
    }

    clearRecentPeers() {
        try {
            localStorage.removeItem('recentPeers');
        } catch (error) {
            console.error('Error clearing recent peers:', error);
        }
    }

    // Local Storage Operations for Settings
    saveSetting(key, value) {
        try {
            localStorage.setItem(`setting_${key}`, JSON.stringify(value));
        } catch (error) {
            console.error(`Error saving setting ${key}:`, error);
        }
    }

    loadSetting(key, defaultValue = null) {
        try {
            const saved = localStorage.getItem(`setting_${key}`);
            return saved ? JSON.parse(saved) : defaultValue;
        } catch (error) {
            console.error(`Error loading setting ${key}:`, error);
            return defaultValue;
        }
    }

    // Local Storage Operations for File History
    saveFileHistory(fileHistory) {
        try {
            localStorage.setItem('fileHistory', JSON.stringify({
                sent: Array.from(fileHistory.sent),
                received: Array.from(fileHistory.received)
            }));
        } catch (error) {
            console.error('Error saving file history:', error);
        }
    }

    loadFileHistory() {
        try {
            const saved = localStorage.getItem('fileHistory');
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    sent: new Set(parsed.sent || []),
                    received: new Set(parsed.received || [])
                };
            }
        } catch (error) {
            console.error('Error loading file history:', error);
        }
        return { sent: new Set(), received: new Set() };
    }

    // Check storage quota
    async checkStorageQuota() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const estimate = await navigator.storage.estimate();
                return {
                    usage: estimate.usage,
                    quota: estimate.quota,
                    percentage: (estimate.usage / estimate.quota) * 100
                };
            } catch (error) {
                console.error('Error checking storage quota:', error);
            }
        }
        return null;
    }

    // Clean up old files
    async cleanupOldFiles(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days
        if (!this.isInitialized) await this.init();

        try {
            const files = await this.getAllFiles();
            const now = Date.now();
            const filesToDelete = files.filter(file => 
                file.timestamp && (now - file.timestamp) > maxAge
            );

            for (const file of filesToDelete) {
                await this.deleteFile(file.id);
            }

            console.log(`Cleaned up ${filesToDelete.length} old files`);
            return filesToDelete.length;
        } catch (error) {
            console.error('Error cleaning up old files:', error);
            return 0;
        }
    }

    // Export data
    async exportData() {
        try {
            const files = await this.getAllFiles();
            const recentPeers = this.loadRecentPeers();
            const fileHistory = this.loadFileHistory();
            
            return {
                files,
                recentPeers,
                fileHistory,
                exportDate: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error exporting data:', error);
            throw error;
        }
    }

    // Import data
    async importData(data) {
        try {
            // Import files
            if (data.files && Array.isArray(data.files)) {
                for (const file of data.files) {
                    await this.saveFile(file);
                }
            }

            // Import recent peers
            if (data.recentPeers && Array.isArray(data.recentPeers)) {
                this.saveRecentPeers(data.recentPeers);
            }

            // Import file history
            if (data.fileHistory) {
                this.saveFileHistory(data.fileHistory);
            }

            console.log('Data imported successfully');
        } catch (error) {
            console.error('Error importing data:', error);
            throw error;
        }
    }
}

// Create and export singleton instance
export const storageService = new StorageService(); 