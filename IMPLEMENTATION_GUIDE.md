# Implementation Guide - Modular One-Host

## Quick Start

### 1. Current Status
✅ **Foundation Complete**: Basic modular structure is in place
- Configuration constants
- DOM utilities
- Helper functions
- Storage service
- Notification service
- Main app orchestrator

### 2. How to Use Current Modules

#### Update HTML to Use Modular Structure
```html
<!-- Replace the current script.js import with: -->
<script type="module" src="js/app.js"></script>
```

#### Using the New Services
```javascript
// In any module, you can now import and use services:
import { notificationService } from './services/notification.js';
import { storageService } from './services/storage.js';
import { dom } from './utils/dom.js';

// Show notifications
notificationService.success('File sent successfully!');
notificationService.error('Connection failed');

// Access DOM elements
const peerId = dom.getText('peerId');
dom.show('fileTransferSection');

// Use storage
await storageService.saveFile(fileInfo);
const recentPeers = storageService.loadRecentPeers();
```

## Next Steps

### Phase 2: Create Core Services

#### 1. Create PeerJS Service (`js/services/peer.js`)
```javascript
import { PEER_CONFIG } from '../config/constants.js';
import { notificationService } from './notification.js';

export class PeerService {
    constructor(app) {
        this.app = app;
        this.peer = null;
        this.connections = new Map();
    }
    
    async initialize() {
        // Move PeerJS initialization logic here
    }
    
    connect(peerId) {
        // Move connection logic here
    }
    
    // ... other peer-related methods
}
```

#### 2. Create File Service (`js/services/file.js`)
```javascript
import { CHUNK_SIZE } from '../config/constants.js';
import { generateFileId, formatFileSize } from '../utils/helpers.js';

export class FileService {
    constructor(app) {
        this.app = app;
        this.fileQueue = [];
        this.transferInProgress = false;
    }
    
    async sendFile(file, peerId) {
        // Move file sending logic here
    }
    
    // ... other file-related methods
}
```

#### 3. Create UI Service (`js/services/ui.js`)
```javascript
import { dom } from '../utils/dom.js';
import { notificationService } from './notification.js';

export class UIService {
    constructor(app) {
        this.app = app;
    }
    
    updateConnectionStatus(status, message) {
        // Move UI update logic here
    }
    
    // ... other UI-related methods
}
```

### Phase 3: Extract Functions from script.js

#### Current Functions to Extract:

**PeerJS Related:**
- `initPeerJS()`
- `setupPeerHandlers()`
- `setupConnectionHandlers()`
- `reconnectToPeer()`

**File Transfer Related:**
- `sendFile()`
- `handleFileHeader()`
- `handleFileChunk()`
- `handleFileComplete()`
- `requestAndDownloadBlob()`

**UI Related:**
- `updateConnectionStatus()`
- `updateProgress()`
- `updateFilesList()`
- `generateQRCode()`

**Event Handling:**
- All event listener functions
- File drop handlers
- Button click handlers

## Migration Checklist

### ✅ Completed
- [x] Create modular directory structure
- [x] Extract constants to `config/constants.js`
- [x] Create DOM utilities in `utils/dom.js`
- [x] Create helper functions in `utils/helpers.js`
- [x] Create storage service in `services/storage.js`
- [x] Create notification service in `services/notification.js`
- [x] Create main app orchestrator in `app.js`

### 🔄 In Progress
- [ ] Extract PeerJS logic to `services/peer.js`
- [ ] Extract file handling to `services/file.js`
- [ ] Extract UI management to `services/ui.js`
- [ ] Extract event handling to `services/events.js`

### ⏳ Pending
- [ ] Create component modules
- [ ] Create manager modules
- [ ] Update HTML to use modular structure
- [ ] Test all functionality
- [ ] Remove old script.js file

## Testing Strategy

### 1. Unit Testing Each Module
```javascript
// Example test for notification service
describe('NotificationService', () => {
    test('should show success notification', () => {
        const notification = notificationService.success('Test message');
        expect(notification).toBeDefined();
        expect(notification.classList.contains('success')).toBe(true);
    });
});
```

### 2. Integration Testing
```javascript
// Test module interactions
describe('App Integration', () => {
    test('should initialize all services', async () => {
        await app.init();
        expect(app.services.storage).toBeDefined();
        expect(app.services.notification).toBeDefined();
    });
});
```

### 3. End-to-End Testing
- Test complete file transfer workflow
- Test peer connection establishment
- Test UI interactions

## Performance Considerations

### 1. Module Loading
```javascript
// Lazy load non-critical modules
const loadFileService = async () => {
    const { FileService } = await import('./services/file.js');
    return new FileService(app);
};
```

### 2. Bundle Optimization
```javascript
// Use tree shaking to eliminate unused code
import { only, what, you, need } from './utils/helpers.js';
```

### 3. Caching Strategy
```javascript
// Cache frequently used DOM elements
const cachedElements = new Map();
const getElement = (id) => {
    if (!cachedElements.has(id)) {
        cachedElements.set(id, document.getElementById(id));
    }
    return cachedElements.get(id);
};
```

## Common Patterns

### 1. Service Pattern
```javascript
class MyService {
    constructor(app) {
        this.app = app;
    }
    
    async init() {
        // Initialize service
    }
    
    destroy() {
        // Cleanup resources
    }
}
```

### 2. Event Pattern
```javascript
class EventEmitter {
    constructor() {
        this.events = new Map();
    }
    
    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(handler);
    }
    
    emit(event, data) {
        const handlers = this.events.get(event) || [];
        handlers.forEach(handler => handler(data));
    }
}
```

### 3. State Management Pattern
```javascript
class StateManager {
    constructor(initialState = {}) {
        this.state = initialState;
        this.listeners = new Set();
    }
    
    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.notifyListeners();
    }
    
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    
    notifyListeners() {
        this.listeners.forEach(listener => listener(this.state));
    }
}
```

## Troubleshooting

### Common Issues

#### 1. Module Import Errors
```javascript
// Make sure all imports use correct paths
import { dom } from './utils/dom.js';  // ✅ Correct
import { dom } from './utils/dom';     // ❌ Missing .js extension
```

#### 2. DOM Element Not Found
```javascript
// Use the DOM utility instead of direct access
const element = dom.get('peerId');  // ✅ Safe
const element = document.getElementById('peerId');  // ❌ May be null
```

#### 3. Service Not Initialized
```javascript
// Always check if service is initialized
if (storageService.isInitialized) {
    await storageService.saveFile(fileInfo);
} else {
    await storageService.init();
    await storageService.saveFile(fileInfo);
}
```

## Getting Help

### 1. Check Module Dependencies
```javascript
// Use browser dev tools to check module loading
// Network tab will show which modules are loaded
```

### 2. Debug Module Issues
```javascript
// Add debugging to modules
console.log('PeerService: Initializing...');
console.log('FileService: File sent successfully');
```

### 3. Test Individual Modules
```javascript
// Test modules in isolation
const testNotification = () => {
    notificationService.success('Test notification');
};
```

## Conclusion

The modular structure provides a solid foundation for the One-Host application. The next phase involves extracting the remaining functionality from `script.js` into appropriate service modules. This will result in a more maintainable, testable, and scalable codebase.

Remember to:
1. Test each module as you create it
2. Maintain backward compatibility during migration
3. Document any breaking changes
4. Keep the old `script.js` until the migration is complete 