// Utility Functions
import { dom } from './dom.js';

// Format file size
export function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Generate unique file ID
export function generateFileId(file) {
    return `${file.name}-${file.size}`;
}

// Get file icon based on MIME type
export function getFileIcon(mimeType) {
    if (!mimeType) return 'insert_drive_file';
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'movie';
    if (mimeType.startsWith('audio/')) return 'audiotrack';
    if (mimeType.includes('pdf')) return 'picture_as_pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'description';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'table_chart';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'slideshow';
    if (mimeType.includes('text/')) return 'text_snippet';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'folder_zip';
    
    return 'insert_drive_file';
}

// Check browser support for WebRTC
export function checkBrowserSupport() {
    if (!window.RTCPeerConnection || !navigator.mediaDevices) {
        dom.show('browserSupport');
        return false;
    }
    return true;
}

// Validate peer ID format
export function validatePeerId(peerId) {
    if (!peerId || typeof peerId !== 'string') {
        return null;
    }
    
    // Remove whitespace and special characters that might cause issues
    const cleaned = peerId.trim().replace(/[^a-zA-Z0-9-_]/g, '');
    
    // Check length
    if (cleaned.length < 3 || cleaned.length > 50) {
        return null;
    }
    
    return cleaned;
}

// Check if peer is available
export function isPeerAvailable(peer, peerId) {
    return peer && peer.id && peer.id !== peerId && !peer.destroyed && !peer.disconnected;
}

// Debounce function
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function
export function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Deep clone object
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (typeof obj === 'object') {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

// Generate random string
export function generateRandomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Check if object is empty
export function isEmpty(obj) {
    if (obj == null) return true;
    if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
    return Object.keys(obj).length === 0;
}

// Sleep function
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry function with exponential backoff
export async function retry(fn, maxAttempts = 3, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            const delay = baseDelay * Math.pow(2, attempt - 1);
            await sleep(delay);
        }
    }
}

// Parse URL parameters
export function parseUrlParams() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const params = {};
        for (const [key, value] of urlParams) {
            params[key] = value;
        }
        return params;
    } catch (error) {
        console.error('Error parsing URL parameters:', error);
        return {};
    }
}

// Create blob URL
export function createBlobURL(blob) {
    return URL.createObjectURL(blob);
}

// Revoke blob URL
export function revokeBlobURL(url) {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
}

// Download blob
export function downloadBlob(blob, fileName) {
    const url = createBlobURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Cleanup
    setTimeout(() => revokeBlobURL(url), 100);
}

// Copy text to clipboard
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
    }
}

// Share content using Web Share API
export async function shareContent(data) {
    if (navigator.share) {
        try {
            await navigator.share(data);
            return true;
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error sharing:', error);
            }
            return false;
        }
    }
    return false;
}

// Check if Web Share API is available
export function isWebShareSupported() {
    return !!navigator.share;
}

// Get device type
export function getDeviceType() {
    const userAgent = navigator.userAgent.toLowerCase();
    if (/android/.test(userAgent)) return 'android';
    if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
    if (/windows/.test(userAgent)) return 'windows';
    if (/macintosh|mac os x/.test(userAgent)) return 'mac';
    if (/linux/.test(userAgent)) return 'linux';
    return 'unknown';
}

// Check if device is mobile
export function isMobile() {
    const deviceType = getDeviceType();
    return deviceType === 'android' || deviceType === 'ios';
}

// Check if device is touch capable
export function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
} 