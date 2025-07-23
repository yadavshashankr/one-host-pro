// Application Constants
export const CHUNK_SIZE = 16384; // 16KB chunks
export const DB_NAME = 'fileTransferDB';
export const DB_VERSION = 1;
export const STORE_NAME = 'files';
export const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
export const CONNECTION_TIMEOUT = 60000; // 60 seconds
export const MAX_RECENT_PEERS = 5;

// Message Types for WebRTC communication
export const MESSAGE_TYPES = {
    FILE_INFO: 'file-info',
    FILE_HEADER: 'file-header',
    FILE_CHUNK: 'file-chunk',
    FILE_COMPLETE: 'file-complete',
    BLOB_REQUEST: 'blob-request',
    BLOB_REQUEST_FORWARDED: 'blob-request-forwarded',
    BLOB_ERROR: 'blob-error',
    CONNECTION_NOTIFICATION: 'connection-notification',
    KEEP_ALIVE: 'keep-alive',
    KEEP_ALIVE_RESPONSE: 'keep-alive-response',
    DISCONNECT_NOTIFICATION: 'disconnect-notification',
    SIMULTANEOUS_DOWNLOAD_REQUEST: 'simultaneous-download-request',
    SIMULTANEOUS_DOWNLOAD_READY: 'simultaneous-download-ready',
    SIMULTANEOUS_DOWNLOAD_START: 'simultaneous-download-start'
};

// PeerJS Configuration
export const PEER_CONFIG = {
    debug: 2,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ]
    }
};

// UI Configuration
export const UI_CONFIG = {
    notificationTimeout: 5000,
    progressUpdateThreshold: 1, // Update progress every 1%
    connectionTimeout: 15000,
    reconnectionDelay: 3000
}; 