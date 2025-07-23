// DOM Elements Manager
class DOMManager {
    constructor() {
        this.elements = {
            peerId: document.getElementById('peer-id'),
            copyId: document.getElementById('copy-id'),
            shareId: document.getElementById('share-id'),
            remotePeerId: document.getElementById('remote-peer-id'),
            connectButton: document.getElementById('connect-button'),
            fileInput: document.getElementById('file-input'),
            dropZone: document.getElementById('drop-zone'),
            transferProgress: document.getElementById('transfer-progress'),
            progress: document.getElementById('progress'),
            transferInfo: document.getElementById('transfer-info'),
            fileList: document.getElementById('file-list'),
            statusText: document.getElementById('status-text'),
            statusDot: document.getElementById('status-dot'),
            browserSupport: document.getElementById('browser-support'),
            fileTransferSection: document.getElementById('file-transfer-section'),
            qrcode: document.getElementById('qrcode'),
            receivedFiles: document.getElementById('received-files'),
            notifications: document.getElementById('notifications'),
            sentFilesList: document.getElementById('sent-files-list'),
            receivedFilesList: document.getElementById('received-files-list'),
            recentPeers: document.getElementById('recent-peers'),
            recentPeersList: document.getElementById('recent-peers-list'),
            clearPeers: document.getElementById('clear-peers'),
            peerIdEdit: document.getElementById('peer-id-edit'),
            editIdButton: document.getElementById('edit-id'),
            saveIdButton: document.getElementById('save-id'),
            cancelEditButton: document.getElementById('cancel-edit')
        };
    }

    // Get element by ID
    get(id) {
        return this.elements[id];
    }

    // Show element
    show(id) {
        const element = this.get(id);
        if (element) {
            element.classList.remove('hidden');
        }
    }

    // Hide element
    hide(id) {
        const element = this.get(id);
        if (element) {
            element.classList.add('hidden');
        }
    }

    // Toggle element visibility
    toggle(id) {
        const element = this.get(id);
        if (element) {
            element.classList.toggle('hidden');
        }
    }

    // Update element text content
    setText(id, text) {
        const element = this.get(id);
        if (element) {
            element.textContent = text;
        }
    }

    // Update element innerHTML
    setHTML(id, html) {
        const element = this.get(id);
        if (element) {
            element.innerHTML = html;
        }
    }

    // Add event listener
    addEventListener(id, event, handler) {
        const element = this.get(id);
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    // Remove event listener
    removeEventListener(id, event, handler) {
        const element = this.get(id);
        if (element) {
            element.removeEventListener(event, handler);
        }
    }

    // Set element attribute
    setAttribute(id, attribute, value) {
        const element = this.get(id);
        if (element) {
            element.setAttribute(attribute, value);
        }
    }

    // Get element attribute
    getAttribute(id, attribute) {
        const element = this.get(id);
        return element ? element.getAttribute(attribute) : null;
    }

    // Add CSS class
    addClass(id, className) {
        const element = this.get(id);
        if (element) {
            element.classList.add(className);
        }
    }

    // Remove CSS class
    removeClass(id, className) {
        const element = this.get(id);
        if (element) {
            element.classList.remove(className);
        }
    }

    // Toggle CSS class
    toggleClass(id, className) {
        const element = this.get(id);
        if (element) {
            element.classList.toggle(className);
        }
    }

    // Check if element has class
    hasClass(id, className) {
        const element = this.get(id);
        return element ? element.classList.contains(className) : false;
    }

    // Focus element
    focus(id) {
        const element = this.get(id);
        if (element) {
            element.focus();
        }
    }

    // Select element text
    selectText(id) {
        const element = this.get(id);
        if (element && element.select) {
            element.select();
        }
    }

    // Get element value
    getValue(id) {
        const element = this.get(id);
        return element ? element.value : null;
    }

    // Set element value
    setValue(id, value) {
        const element = this.get(id);
        if (element) {
            element.value = value;
        }
    }

    // Create element
    createElement(tag, className = '', attributes = {}) {
        const element = document.createElement(tag);
        if (className) {
            element.className = className;
        }
        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
        return element;
    }

    // Append child to element
    appendChild(parentId, child) {
        const parent = this.get(parentId);
        if (parent) {
            parent.appendChild(child);
        }
    }

    // Remove child from element
    removeChild(parentId, child) {
        const parent = this.get(parentId);
        if (parent && child) {
            parent.removeChild(child);
        }
    }

    // Clear element content
    clear(id) {
        const element = this.get(id);
        if (element) {
            element.innerHTML = '';
        }
    }

    // Scroll element to bottom
    scrollToBottom(id) {
        const element = this.get(id);
        if (element) {
            element.scrollTop = element.scrollHeight;
        }
    }
}

// Create and export singleton instance
export const dom = new DOMManager(); 