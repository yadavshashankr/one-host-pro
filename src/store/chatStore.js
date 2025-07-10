import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useChatStore = create(
  persist(
    (set, get) => ({
      conversations: new Map(),
      activeConversation: null,
      unreadCounts: new Map(),
      typing: new Map(),
      lastSeen: new Map(),

      setActiveConversation: (peerId) => 
        set({ activeConversation: peerId }),

      addMessage: (peerId, message) => {
        const conversations = new Map(get().conversations);
        const messages = conversations.get(peerId) || [];
        conversations.set(peerId, [...messages, message]);

        // Update unread count if not active conversation
        if (peerId !== get().activeConversation) {
          const unreadCounts = new Map(get().unreadCounts);
          unreadCounts.set(peerId, (unreadCounts.get(peerId) || 0) + 1);
          set({ unreadCounts });
        }

        set({ conversations });
      },

      markAsRead: (peerId) => {
        const unreadCounts = new Map(get().unreadCounts);
        unreadCounts.delete(peerId);
        set({ unreadCounts });
      },

      setTyping: (peerId, isTyping) => {
        const typing = new Map(get().typing);
        typing.set(peerId, isTyping);
        set({ typing });
      },

      updateLastSeen: (peerId) => {
        const lastSeen = new Map(get().lastSeen);
        lastSeen.set(peerId, Date.now());
        set({ lastSeen });
      },

      getConversation: (peerId) => {
        return get().conversations.get(peerId) || [];
      },

      getUnreadCount: (peerId) => {
        return get().unreadCounts.get(peerId) || 0;
      },

      isTyping: (peerId) => {
        return get().typing.get(peerId) || false;
      },

      getLastSeen: (peerId) => {
        return get().lastSeen.get(peerId);
      }
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        conversations: Array.from(state.conversations.entries()),
        unreadCounts: Array.from(state.unreadCounts.entries()),
        lastSeen: Array.from(state.lastSeen.entries())
      }),
      onRehydrateStorage: () => (state) => {
        // Convert arrays back to Maps
        if (state) {
          state.conversations = new Map(state.conversations);
          state.unreadCounts = new Map(state.unreadCounts);
          state.lastSeen = new Map(state.lastSeen);
          state.typing = new Map();
        }
      }
    }
  )
);

export default useChatStore; 