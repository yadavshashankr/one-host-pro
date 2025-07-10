import { useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material';
import { usePeer } from './hooks/usePeer';
import useChatStore from './store/chatStore';
import ContactsSidebar from './components/ContactsSidebar';
import ChatWindow from './components/ChatWindow';

const theme = createTheme({
  palette: {
    primary: {
      main: '#128C7E',
      light: '#25D366',
      dark: '#075E54'
    }
  }
});

function App() {
  const {
    peerId,
    peers,
    isConnected,
    error,
    connect,
    sendText,
    sendFile
  } = usePeer();

  const {
    activeConversation,
    setActiveConversation,
    addMessage,
    updateLastSeen
  } = useChatStore();

  useEffect(() => {
    if (activeConversation) {
      updateLastSeen(activeConversation);
    }
  }, [activeConversation]);

  const handleConnect = async (remotePeerId) => {
    try {
      await connect(remotePeerId);
      setActiveConversation(remotePeerId);
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const handleSendText = async (text, peer) => {
    const message = await sendText(text, peer);
    return message;
  };

  const handleSendFile = async (file, peer) => {
    const fileId = await sendFile(file, peer);
    return fileId;
  };

  if (!isConnected) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            {error ? 'Connection Error' : 'Connecting...'}
          </h1>
          {error && <p className="text-red-500">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <div className="flex h-screen">
        <ContactsSidebar
          peers={peers}
          peerId={peerId}
          onConnect={handleConnect}
          activeConversation={activeConversation}
        />
        {activeConversation ? (
          <ChatWindow
            peer={activeConversation}
            onSendText={handleSendText}
            onSendFile={handleSendFile}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-whatsapp-chat-bg">
            <div className="text-center text-gray-500">
              <h2 className="text-xl font-semibold mb-2">Welcome to P2P Chat</h2>
              <p>Select a contact to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}

export default App; 